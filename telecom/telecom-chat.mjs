/**
 * Telecom quote and opportunity queue.
 * Off unless PEAK_TELECOM_CHAT=1. Notifies Brian only. Does not email the visitor
 * and does not contact vendors.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  carriersForCountry,
  normalizeCountry,
  parseVendorHtml,
  validateAddress,
  validateOpportunity,
  validateQuote,
} from "../static-site/telecom-carrier-rules.mjs";
import { COPY } from "../static-site/telecom-visitor-copy.mjs";
import {
  PUBLIC_MESSAGE,
  SYSTEM_PROMPT,
  TURNSTILE_MESSAGE,
  asData,
  createMemoryLimiter,
  detectFraud,
  killed,
  logTelecom,
  publicResponse,
  unavailableResponse,
  verifyTurnstile,
} from "./telecom-security.mjs";
import { INTAKE_FIELDS, acceptBusinessIntake, buildIntakeNotice } from "./intake/business-quote.mjs";
import { sendPeakNotice } from "./intake/notify-peak.mjs";
import { createDurableQueue } from "./queue/durable-queue.mjs";

export { PUBLIC_MESSAGE, SYSTEM_PROMPT };
export const INTAKE_MESSAGE = PUBLIC_MESSAGE;

export const INTAKE_ERRORS = {
  business: "Enter the business name.",
  contactName: "Enter the contact name.",
  contact: "Enter an email address or a phone number.",
  address: "Enter the service address.",
  services: "Enter the services you want.",
  lines: "Enter the lines or seats, or say not sure.",
  timeline: "Enter the timeline.",
  honeypot: "That request could not be accepted.",
  disabled: "This form is disabled.",
};

const here = dirname(fileURLToPath(import.meta.url));
const DAY_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 8;
const MAX_REQUESTS = 200;

export function telecomChatEnabled(env = process.env) {
  return String(env.PEAK_TELECOM_CHAT || "").trim() === "1";
}

export function intakeEnabled(env = process.env) {
  return String(env.PEAK_TELECOM_INTAKE_ENABLED || "").trim() === "1";
}

export function formAvailable(env = process.env) {
  return !killed(env) && (telecomChatEnabled(env) || intakeEnabled(env));
}

/** The quote form lives on /telecom in the #quote section. */
export const QUOTE_FORM_HREF = "/telecom#quote";

/**
 * Point every "Request a quote" control on /telecom at the on-page form.
 * Same result with every flag value. Older markup that still links quote
 * buttons to /contact or /telecom/quote is rewritten. Nav "Contact" links
 * are left alone. The env argument is kept for older callers.
 */
export function applyQuoteLinks(html, _env = process.env) {
  let out = String(html);
  for (const legacy of ["/contact", "/telecom/quote"]) {
    out = out
      .replaceAll(`href="${legacy}" class="quote-btn`, `href="${QUOTE_FORM_HREF}" class="quote-btn`)
      .replaceAll(`<a href="${legacy}">Request a quote</a>`, `<a href="${QUOTE_FORM_HREF}">Request a quote</a>`);
  }
  return out;
}

export function applyIntakeLinks(html, env = process.env) {
  return applyQuoteLinks(html, env);
}

/** Old /telecom/quote links land on the on-page form with the same query. */
export function quoteRedirectTarget(originalUrl = "") {
  const raw = String(originalUrl || "");
  const at = raw.indexOf("?");
  const query = at === -1 ? "" : raw.slice(at).split("#")[0];
  return `/telecom${query === "?" ? "" : query}#quote`;
}

export function intakeDisabledHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Request a quote | Peak Signal</title>
  <style>
    body { margin: 0; background: #09090b; color: #e4e4e7; font: 16px/1.5 Inter, system-ui, sans-serif; }
    main { max-width: 40rem; margin: 0 auto; padding: 64px 24px; }
    h1 { font-size: 2rem; letter-spacing: -0.04em; }
    a { color: #e4e4e7; }
  </style>
</head>
<body>
  <main>
    <h1>Request a quote</h1>
    <p>${INTAKE_ERRORS.disabled}</p>
    <p>Peak Signal can still be reached from the <a href="/contact">contact page</a>.</p>
  </main>
</body>
</html>`;
}

export function readTelecomAsset(name) {
  const candidates = [
    join(here, name),
    join(here, "telecom", name),
    join(process.cwd(), "telecom", name),
    join(process.cwd(), "dist", "telecom", name),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  return "";
}

export function brianFormspreeUrl(env = process.env) {
  const raw = String(env.PEAK_FORMSPREE || "").trim();
  return raw || "https://formspree.io/f/mgobgrlr";
}

function catalogPath() {
  const candidates = [
    join(here, "../static-site/telecom.html"),
    join(here, "static-site/telecom.html"),
    join(process.cwd(), "static-site/telecom.html"),
    join(process.cwd(), "dist/static-site/telecom.html"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return candidates[0];
}

function loadCatalog(path) {
  return parseVendorHtml(readFileSync(path, "utf8"));
}

function clientIp(req) {
  const fwd = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req?.ip || req?.socket?.remoteAddress || "unknown";
}

function honeypotTripped(body) {
  const gotcha = String(body?._gotcha || "").trim();
  const website = String(body?.company_website || "").trim();
  return Boolean(gotcha || website);
}

function validKey(key) {
  return /^[A-Za-z0-9_-]{8,80}$/.test(String(key || ""));
}

function fingerprint(value) {
  const basis = {
    kind: value.kind,
    company: String(value.company || "").toLowerCase(),
    email: String(value.contactEmail || "").toLowerCase(),
    phone: String(value.contactPhone || "").replace(/\D/g, ""),
    address: String(value.formatted || "").toLowerCase(),
    vendorId: value.vendorId || "",
    offering: value.offering || "",
    path: value.path || "",
    speeds: String(value.desiredSpeeds || "").toLowerCase(),
    budget: value.budget == null ? "" : String(value.budget),
    bandwidth: String(value.bandwidth || "").toLowerCase(),
    seats: value.seats || "",
    needs: String(value.needs || "").toLowerCase(),
    services: String(value.services || "").toLowerCase(),
    linesSeats: String(value.linesSeats || "").toLowerCase(),
    timeline: String(value.timeline || "").toLowerCase(),
    notes: String(value.notes || "").toLowerCase(),
  };
  return createHash("sha256").update(JSON.stringify(basis)).digest("hex");
}

function oneLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function brianMessage(record) {
  const lines = [
    "Peak Signal telecom request",
    "For Brian at Peak Signal",
    "",
    `Request: ${record.id}`,
    `Kind: ${record.kind}`,
    `Company: ${record.company}`,
    `Contact: ${record.contactName}`,
    `Contact email: ${record.contactEmail}`,
    `Phone: ${record.contactPhone}`,
  ];
  if (record.kind === "quote") {
    lines.push(
      `Country: ${record.country}`,
      `Address: ${record.formatted}`,
      `Bandwidth: ${record.bandwidth}`,
      `Carrier: ${record.vendorName}`,
      `Option: ${record.offering}`,
    );
  } else if (record.kind === "intake") {
    lines.push(
      `Country: ${record.country}`,
      `Service address: ${record.formatted}`,
      `Services: ${record.services}`,
      `Lines or seats: ${record.linesSeats}`,
      `Timeline: ${record.timeline}`,
      `Notes: ${record.notes || "(none)"}`,
    );
  } else {
    lines.push(
      `Vendor: ${record.vendorName}`,
      `Seats: ${record.seats}`,
      `Current provider: ${record.currentProvider}`,
      `Contract end: ${record.contractEnd}`,
      `Locations: ${record.locations}`,
      `Needs: ${record.needs}`,
    );
  }
  lines.push(
    "",
    `Pricing: ${record.kind === "intake" ? INTAKE_MESSAGE : record.pricing}`,
    "Nothing was ordered. Nothing was sent to a vendor. No reply was sent to the visitor.",
  );
  return lines.join("\n");
}

function notifyPayload(record) {
  return {
    _subject: `Peak Signal telecom request — ${oneLine(record.company)}`,
    message: brianMessage(record),
  };
}

function limited(store, ip, now, limit, windowMs) {
  const stamps = (Array.isArray(store.rates[ip]) ? store.rates[ip] : [])
    .map(Number)
    .filter((stamp) => now - stamp < windowMs);
  if (stamps.length >= limit) {
    store.rates[ip] = stamps;
    return true;
  }
  stamps.push(now);
  store.rates[ip] = stamps;
  const keys = Object.keys(store.rates);
  if (keys.length > 500) delete store.rates[keys[0]];
  return false;
}

function findDuplicate(store, record, now) {
  if (record.idempotencyKey) {
    const byKey = store.requests.find((item) => item.idempotencyKey === record.idempotencyKey);
    if (byKey) return byKey;
  }
  return store.requests.find((item) => {
    if (item.fingerprint !== record.fingerprint) return false;
    const then = Date.parse(item.createdAt || "");
    return Number.isFinite(then) && now - then < DAY_MS;
  });
}

function publicRequest(record) {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    createdAt: record.createdAt,
    decidedAt: record.decidedAt || "",
    decisionNote: record.decisionNote || "",
    company: record.company,
    contactName: record.contactName,
    contactEmail: record.contactEmail,
    contactPhone: record.contactPhone,
    country: record.country || "",
    formatted: record.formatted || "",
    bandwidth: record.bandwidth || "",
    vendorName: record.vendorName || "",
    offering: record.offering || "",
    seats: record.seats || "",
    currentProvider: record.currentProvider || "",
    contractEnd: record.contractEnd || "",
    locations: record.locations || "",
    needs: record.needs || "",
    services: record.services || "",
    linesSeats: record.linesSeats || "",
    timeline: record.timeline || "",
    notes: record.notes || "",
    pricing: record.kind === "intake" ? INTAKE_MESSAGE : record.pricing,
    path: record.path || "",
    prefilledVendor: record.prefilledVendor || null,
    desiredSpeeds: record.desiredSpeeds || "",
    accessType: record.accessType || "",
    budget: record.budget == null ? null : record.budget,
    humanFollowUp: record.humanFollowUp === true,
    opportunity: record.opportunity || null,
    opportunityError: record.opportunityError || "",
    returnedPricing: record.returnedPricing || null,
  };
}

export function createTelecomChat(options = {}) {
  const env = options.env || process.env;
  const file = options.file || env.TELECOM_REQUESTS_PATH || join(process.cwd(), "data", "telecom-requests.json");
  const fetchImpl = options.fetch || globalThis.fetch;
  const nowFn = options.now || (() => new Date());
  const catalog = options.catalog || loadCatalog(options.catalogPath || catalogPath());
  const limiter = options.limiter || createMemoryLimiter(options.limits || {});
  const log = options.log || ((line) => console.log(String(line)));
  const rateLimit = Number.isFinite(options.rateLimit) ? options.rateLimit : RATE_LIMIT;
  const rateWindowMs = Number.isFinite(options.rateWindowMs) ? options.rateWindowMs : RATE_WINDOW_MS;
  const persist = options.persist;
  const queue = options.queue || createDurableQueue({ file, env, fetch: fetchImpl });
  const noticeKeys = new Map();

  function enabled() {
    return telecomChatEnabled(env);
  }

  function intakeOn() {
    return intakeEnabled(env);
  }

  function reviewEnabled() {
    return enabled() || intakeOn();
  }

  function carriers(country) {
    return carriersForCountry(catalog, country);
  }

  function save(store) {
    if (persist) {
      persist(store);
      return;
    }
    queue.writeLocal(store);
    queue.track(queue.mirror(store));
  }

  function loadStore() {
    return queue.read();
  }

  async function notifyBrian(record) {
    if (record.notice) {
      const sent = await sendPeakNotice({ notice: record.notice, env, fetch: fetchImpl });
      const urls = sent.url ? [sent.url] : [];
      return { ok: sent.ok, urls, channel: sent.channel };
    }
    const url = brianFormspreeUrl(env);
    const payload = notifyPayload(record);
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return { ok: Boolean(response && response.ok), urls: [url] };
  }

  function disabled() {
    return { status: 404, body: { ok: false, error: "not_found" } };
  }

  function config() {
    if (killed(env)) return { status: 503, body: unavailableResponse() };
    if (!enabled()) return disabled();
    const body = { ok: true, enabled: true };
    const siteKey = String(env.TURNSTILE_SITE_KEY || "").trim();
    if (siteKey) body.turnstileSiteKey = siteKey;
    return { status: 200, body };
  }

  function address(input, req) {
    if (!enabled()) return disabled();
    const store = loadStore();
    const now = nowFn().getTime();
    if (limited(store, clientIp(req), now, rateLimit, rateWindowMs)) {
      save(store);
      return { status: 429, body: { ok: false, errors: [COPY.validation.rate] } };
    }
    save(store);
    const checked = validateAddress(input);
    if (!checked.ok) return { status: 400, body: { ok: false, errors: checked.errors } };
    return {
      status: 200,
      body: {
        ok: true,
        address: checked.address,
        carriers: carriers(checked.address.country),
      },
    };
  }

  async function gateRequest(body, req, now) {
    if (killed(env)) return { status: 503, body: unavailableResponse() };
    const gate = limiter.check({
      ip: clientIp(req),
      sessionId: String(body?.sessionId || ""),
      now,
    });
    const turnstile = await verifyTurnstile({
      secret: env.TURNSTILE_SECRET_KEY,
      token: body?.turnstileToken,
      fetchImpl,
      log,
    });
    if (!turnstile.ok) return { status: 400, body: { ok: false, errors: [TURNSTILE_MESSAGE] } };
    if (gate.limited) return { status: 429, body: { ok: false, errors: [COPY.validation.rate] } };
    return { gate };
  }

  function chatQuoteValue(body) {
    const errors = [];
    const address = validateAddress(body);
    if (!address.ok) errors.push(...address.errors);
    const services = clip(body?.services, 500);
    const seatsLocations = clip(body?.seatsLocations, 120);
    const currentProvider = clip(body?.currentProvider, 120);
    const timeline = clip(body?.timeline, 120);
    const contactName = clip(body?.contactName, 80);
    const contactEmail = clip(body?.contactEmail, 120);
    const contactPhone = clip(body?.contactPhone, 40);
    const vendor = clip(body?.vendor, 80);
    const names = new Set(catalog.map((vendorCard) => vendorCard.name));
    if (services.length < 2) errors.push(COPY.validation.services);
    if (seatsLocations.length < 1) errors.push(COPY.validation.counts);
    if (currentProvider.length < 2) errors.push(COPY.validation.provider);
    if (timeline.length < 2) errors.push(COPY.validation.timeline);
    if (contactName.length < 2) errors.push(COPY.validation.contactName);
    if (!validEmail(contactEmail)) errors.push(COPY.validation.email);
    if (!validPhone(contactPhone)) errors.push(COPY.validation.phone);
    if (vendor && vendor !== COPY.vendor.notSure && !names.has(vendor)) errors.push(COPY.validation.vendor);
    if (!(body?.consent === true || body?.consent === "yes")) errors.push(COPY.validation.consent);
    if (errors.length) return { ok: false, errors };
    const fraudFlags = detectFraud({
      ...address.address,
      contactEmail,
      contactPhone,
      services,
      currentProvider,
      timeline,
      seatsLocations,
      contactName,
      company: contactName,
    });
    return {
      ok: true,
      errors: [],
      value: {
        kind: "quote",
        ...address.address,
        company: contactName,
        contactName,
        contactEmail,
        contactPhone,
        vendorName: vendor,
        services,
        seatsLocations,
        linesSeats: seatsLocations,
        currentProvider,
        timeline,
        pricing: PUBLIC_MESSAGE,
        fraudFlags,
      },
    };
  }

  async function submit(body, req) {
    if (killed(env)) return { status: 503, body: unavailableResponse() };
    if (!enabled()) return disabled();
    await queue.hydrate();
    if (body?.flow === "business") return takeBusiness(body, req, { turnstile: true });
    const guarded = await gateRequest(body, req, Date.now());
    if (guarded.status) return guarded;
    const key = String(body?.idempotencyKey || "").trim();
    if (key && !validKey(key)) {
      return { status: 400, body: { ok: false, errors: [COPY.validation.submitOnce] } };
    }

    const store = loadStore();
    const nowDate = nowFn();
    const now = nowDate.getTime();
    if (limited(store, clientIp(req), now, rateLimit, rateWindowMs)) {
      save(store);
      return { status: 429, body: { ok: false, errors: [COPY.validation.rate] } };
    }
    if (honeypotTripped(body)) {
      save(store);
      return { status: 200, body: { ok: true, received: true } };
    }

    const kind = body?.kind === "opportunity" ? "opportunity" : body?.kind === "quote" ? "quote" : "";
    if (!kind) {
      save(store);
      return { status: 400, body: { ok: false, errors: [COPY.validation.vendor] } };
    }

    const checked = kind === "quote" && body.services
      ? chatQuoteValue(body)
      : kind === "quote"
        ? validateQuote(body, carriers(body?.country))
        : validateOpportunity(body, catalog);
    if (!checked.ok) {
      save(store);
      return { status: 400, body: { ok: false, errors: checked.errors } };
    }

    const record = {
      id: `tq_${randomBytes(8).toString("hex")}`,
      idempotencyKey: key,
      fingerprint: fingerprint(checked.value),
      status: body?.services ? "ready_for_partner_submission" : "requested",
      createdAt: nowDate.toISOString(),
      decidedAt: "",
      decisionNote: "",
      ...checked.value,
    };

    const existing = findDuplicate(store, record, now);
    if (existing) {
      save(store);
      return { status: 200, body: { ok: true, id: existing.id, duplicate: true } };
    }

    store.requests.unshift(record);
    store.requests = store.requests.slice(0, MAX_REQUESTS);
    try {
      save(store);
    } catch {
      return { status: 503, body: { ok: false, errors: [COPY.validation.saveFailed] } };
    }

    let notified = false;
    try {
      const sent = await notifyBrian(record);
      notified = sent.ok;
    } catch (err) {
      console.error("telecom notify failed", record.id, err?.message || err);
    }
    logTelecom("telecom.request", {
      id: record.id,
      kind: record.kind,
      email: record.contactEmail,
      phone: record.contactPhone,
      flags: record.fraudFlags || [],
      ip: clientIp(req),
    }, log);
    if (body?.services) return { status: 200, body: publicResponse(record.id) };
    return { status: 200, body: { ok: true, id: record.id, duplicate: false, notified } };
  }

  function clip(value, max) {
    return String(value || "").replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 120;
  }

  function validPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
  }

  async function quoteRequest(body, req) {
    if (killed(env)) return { status: 503, body: unavailableResponse() };
    if (!intakeOn()) {
      // The /telecom form still reaches Peak with the intake flag off.
      if (body?.flow === "business") return noticeOnly(body, req);
      return { status: 404, body: { ok: false, error: "disabled" } };
    }
    await queue.hydrate();
    if (body?.flow === "business") return takeBusiness(body, req, { honeypotStatus: 400 });
    const store = loadStore();
    const nowDate = nowFn();
    const now = nowDate.getTime();
    if (limited(store, clientIp(req), now, rateLimit, rateWindowMs)) {
      save(store);
      return { status: 429, body: { ok: false, errors: [COPY.validation.rate] } };
    }
    if (honeypotTripped(body)) {
      save(store);
      return { status: 400, body: { ok: false, errors: [INTAKE_ERRORS.honeypot] } };
    }
    const key = String(body?.idempotencyKey || "").trim();
    if (key && !validKey(key)) {
      save(store);
      return { status: 400, body: { ok: false, errors: [COPY.validation.submitOnce] } };
    }

    const errors = [];
    const company = clip(body?.business, 120);
    const contactName = clip(body?.contact_name, 80);
    const contactEmail = clip(body?.email, 120);
    const contactPhone = clip(body?.phone, 40);
    const formatted = clip(body?.service_address, 200);
    const country = normalizeCountry(body?.country);
    const services = clip(body?.services, 500);
    const linesSeats = clip(body?.lines_seats, 80);
    const timeline = clip(body?.timeline, 120);
    const notes = clip(body?.notes, 2000);
    if (company.length < 2) errors.push(INTAKE_ERRORS.business);
    if (contactName.length < 2) errors.push(INTAKE_ERRORS.contactName);
    if (!contactEmail && !contactPhone) errors.push(INTAKE_ERRORS.contact);
    if (contactEmail && !validEmail(contactEmail)) errors.push(COPY.validation.email);
    if (contactPhone && !validPhone(contactPhone)) errors.push(COPY.validation.phone);
    if (formatted.length < 8 || !/[A-Za-z]/.test(formatted)) errors.push(INTAKE_ERRORS.address);
    if (!country) errors.push(COPY.validation.country);
    if (services.length < 2) errors.push(INTAKE_ERRORS.services);
    if (linesSeats.length < 1) errors.push(INTAKE_ERRORS.lines);
    if (timeline.length < 2) errors.push(INTAKE_ERRORS.timeline);
    const consent = body?.consent === true || body?.consent === "yes";
    if (!consent) errors.push(COPY.validation.consent);
    if (errors.length) {
      save(store);
      return { status: 400, body: { ok: false, errors } };
    }

    const value = {
      kind: "intake",
      company,
      contactName,
      contactEmail,
      contactPhone,
      country,
      formatted,
      services,
      linesSeats,
      timeline,
      notes,
      pricing: INTAKE_MESSAGE,
    };
    const record = {
      id: `tq_${randomBytes(8).toString("hex")}`,
      idempotencyKey: key,
      fingerprint: fingerprint(value),
      status: "ready_for_partner_submission",
      createdAt: nowDate.toISOString(),
      decidedAt: "",
      decisionNote: "",
      ...value,
    };
    const existing = findDuplicate(store, record, now);
    if (existing) {
      save(store);
      return { status: 200, body: { ok: true, id: existing.id, message: INTAKE_MESSAGE, duplicate: true } };
    }
    store.requests.unshift(record);
    store.requests = store.requests.slice(0, MAX_REQUESTS);
    try {
      save(store);
    } catch {
      return { status: 503, body: { ok: false, errors: [COPY.validation.saveFailed] } };
    }
    try {
      await notifyBrian(record);
    } catch (err) {
      console.error("telecom intake notify failed", record.id, err?.message || err);
    }
    return { status: 200, body: { ok: true, id: record.id, message: INTAKE_MESSAGE } };
  }

  function list() {
    if (!reviewEnabled()) return disabled();
    const store = loadStore();
    return {
      status: 200,
      body: { ok: true, requests: store.requests.map(publicRequest) },
    };
  }

  async function takeBusiness(body, req, options = {}) {
    if (options.turnstile) {
      const guarded = await gateRequest(body, req, Date.now());
      if (guarded.status) return guarded;
    }
    const key = String(body?.idempotencyKey || "").trim();
    if (key && !validKey(key)) {
      return { status: 400, body: { ok: false, errors: [COPY.validation.submitOnce] } };
    }
    const store = loadStore();
    const nowDate = nowFn();
    const now = nowDate.getTime();
    if (limited(store, clientIp(req), now, rateLimit, rateWindowMs)) {
      save(store);
      await queue.flush();
      return { status: 429, body: { ok: false, errors: [COPY.validation.rate] } };
    }
    if (honeypotTripped(body)) {
      save(store);
      await queue.flush();
      if (options.honeypotStatus === 400) {
        return { status: 400, body: { ok: false, errors: [INTAKE_ERRORS.honeypot] } };
      }
      return { status: 200, body: { ok: true, received: true } };
    }
    const checked = acceptBusinessIntake(body, { catalog, env, now: nowDate });
    if (!checked.ok) {
      save(store);
      await queue.flush();
      return { status: 400, body: { ok: false, errors: checked.errors } };
    }
    const record = {
      id: `tq_${randomBytes(8).toString("hex")}`,
      idempotencyKey: key,
      fingerprint: checked.value.fingerprint,
      status: "queued",
      createdAt: nowDate.toISOString(),
      decidedAt: "",
      decisionNote: "",
      fraudFlags: detectFraud(checked.value),
      ...checked.value,
    };
    record.notice = buildIntakeNotice(record);
    const existing = findDuplicate(store, record, now);
    if (existing) {
      save(store);
      await queue.flush();
      return { status: 200, body: { ok: true, id: existing.id, message: INTAKE_MESSAGE, duplicate: true } };
    }
    store.requests.unshift(record);
    store.requests = store.requests.slice(0, MAX_REQUESTS);
    try {
      save(store);
    } catch {
      return { status: 503, body: { ok: false, errors: [COPY.validation.saveFailed] } };
    }
    await queue.flush();
    try {
      await notifyBrian(record);
    } catch (err) {
      console.error("telecom intake notify failed", record.id, err?.message || err);
    }
    logTelecom("telecom.request", {
      id: record.id,
      kind: record.kind,
      path: record.path,
      email: record.contactEmail,
      phone: record.contactPhone,
      flags: record.fraudFlags || [],
      ip: clientIp(req),
    }, log);
    return { status: 200, body: { ok: true, id: record.id, message: INTAKE_MESSAGE } };
  }

  /**
   * Intake flag off: same acceptBusinessIntake validation, then one Peak
   * notice. Nothing is written to the queue and no opportunity draft is built, so the
   * notice says so. If the notice cannot be sent the visitor is told, and the
   * page falls back to the contact-form notification instead of losing it.
   */
  async function noticeOnly(body, req) {
    const nowDate = nowFn();
    const gate = limiter.check({ ip: clientIp(req), now: nowDate.getTime() });
    if (gate.limited) return { status: 429, body: { ok: false, errors: [COPY.validation.rate] } };
    if (honeypotTripped(body)) return { status: 400, body: { ok: false, errors: [INTAKE_ERRORS.honeypot] } };
    const key = String(body?.idempotencyKey || "").trim();
    if (key && !validKey(key)) return { status: 400, body: { ok: false, errors: [COPY.validation.submitOnce] } };
    if (key && noticeKeys.has(key)) {
      return { status: 200, body: { ok: true, id: noticeKeys.get(key), message: INTAKE_MESSAGE, duplicate: true } };
    }
    const checked = acceptBusinessIntake(body, { catalog, env, now: nowDate, partner: null });
    if (!checked.ok) return { status: 400, body: { ok: false, errors: checked.errors } };
    const record = {
      id: `tq_${randomBytes(8).toString("hex")}`,
      createdAt: nowDate.toISOString(),
      ...checked.value,
      opportunity: null,
      opportunityError: "intake_off",
      queued: false,
    };
    const notice = buildIntakeNotice(record);
    let sent = { ok: false };
    try {
      sent = await sendPeakNotice({
        notice,
        env: { ...env, PEAK_FORMSPREE: brianFormspreeUrl(env) },
        fetch: fetchImpl,
      });
    } catch (err) {
      console.error("telecom notice-only send failed", record.id, err?.message || err);
    }
    if (!sent.ok) return { status: 503, body: { ok: false, error: "notify_failed", errors: [INTAKE_FIELDS.save] } };
    if (key) {
      noticeKeys.set(key, record.id);
      if (noticeKeys.size > 500) noticeKeys.delete(noticeKeys.keys().next().value);
    }
    logTelecom("telecom.notice_only", {
      id: record.id,
      path: record.path,
      email: record.contactEmail,
      phone: record.contactPhone,
      ip: clientIp(req),
    }, log);
    return { status: 200, body: { ok: true, id: record.id, message: INTAKE_MESSAGE } };
  }

  function decide(id, body) {
    if (!reviewEnabled()) return disabled();
    const action = body?.action === "approve" || body?.action === "decline" || body?.action === "attach-pricing"
      ? body.action
      : "";
    if (!action) return { status: 400, body: { ok: false, error: "bad_action" } };
    const store = loadStore();
    const record = store.requests.find((item) => item.id === id);
    if (!record) return { status: 404, body: { ok: false, error: "not_found" } };
    if (action === "attach-pricing") {
      const text = String(body?.note || "").replace(/\u0000/g, "").trim();
      if (!text) return { status: 400, body: { ok: false, error: "bad_action" } };
      record.returnedPricing = { text: text.slice(0, 8000), attachedAt: nowFn().toISOString() };
      save(store);
      return { status: 200, body: { ok: true, request: publicRequest(record) } };
    }
    record.status = action === "approve" ? "approved" : "declined";
    record.decidedAt = nowFn().toISOString();
    record.decisionNote = oneLine(body?.note || "").slice(0, 500);
    save(store);
    return { status: 200, body: { ok: true, request: publicRequest(record) } };
  }

  return {
    enabled,
    intakeOn,
    reviewEnabled,
    carriers,
    config,
    address,
    submit,
    quoteRequest,
    list,
    decide,
    flush: () => queue.flush(),
    hydrate: () => queue.hydrate(),
    file,
    catalog,
  };
}

function routePath(req) {
  const raw = String(req.path || req.url || "/");
  return raw.split("?")[0].replace(/\/+$/, "") || "/";
}

function send(res, result) {
  res.status(result.status).json(result.body);
}

export function handlePublicHttp(req, res, service) {
  const path = routePath(req);
  const method = String(req.method || "GET").toUpperCase();
  if (!service.enabled()) {
    send(res, { status: 404, body: { ok: false, error: "not_found" } });
    return Promise.resolve();
  }
  if ((path === "/config" || path.endsWith("/config")) && method === "GET") {
    send(res, service.config());
    return Promise.resolve();
  }
  if ((path === "/address" || path.endsWith("/address")) && method === "POST") {
    send(res, service.address(req.body || {}, req));
    return Promise.resolve();
  }
  if ((path === "/requests" || path.endsWith("/requests")) && method === "POST") {
    return service.submit(req.body || {}, req).then((result) => send(res, result));
  }
  send(res, { status: 404, body: { ok: false, error: "not_found" } });
  return Promise.resolve();
}

export function handleQuoteRequest(req, res, service) {
  return service.quoteRequest(req.body || {}, req).then((result) => send(res, result));
}

export function handleOpsHttp(req, res, service, auth) {
  if (!service.reviewEnabled()) {
    send(res, { status: 404, body: { ok: false, error: "not_found" } });
    return;
  }
  if (!auth?.authed) {
    send(res, { status: 401, body: { ok: false, error: "unauthorized" } });
    return;
  }
  if (auth.op === "decide") {
    send(res, service.decide(String(auth.id || ""), req.body || {}));
    return;
  }
  send(res, service.list());
}

let singleton = null;
export function sharedTelecomChat() {
  if (!singleton) singleton = createTelecomChat();
  return singleton;
}
