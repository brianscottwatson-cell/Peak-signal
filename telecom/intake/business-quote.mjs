/**
 * Business-only telecom intake.
 * Internet, voice, both, UCaaS, and SD-WAN.
 * Every path builds an internal loc8 opportunity draft against the opportunity
 * schema when the partner env values are set. Internet drafts select "network".
 * Human follow-up stays on UCaaS / SD-WAN / voice / both.
 * Partner values come from the environment. Nothing here is hardcoded.
 * Budget and price point stay null unless the visitor typed a number.
 * Bandwidth is never invented: it comes from the bandwidth field, or from the
 * desired speed when that is a bare number or an explicit "<number> Mbps".
 * The /telecom form asks each question once: its speed-in-Mbps answer fills
 * both desiredSpeeds and the draft bandwidth, its one connection-type answer
 * fills both accessType and the draft connectivityType, and its budget fills
 * the draft price point. Speed and connection type are required only on paths
 * that build a network block.
 */
import { createHash } from "node:crypto";
import { validateAddress } from "../../static-site/telecom-carrier-rules.mjs";
import { COPY } from "../../static-site/telecom-visitor-copy.mjs";
import { loadOpportunitySchema, validateOpportunityDraft } from "./opportunity-schema.mjs";

export const SUBJECT_TAG = "[PEAK-TELECOM-INTAKE v1]";
export const SANDBOX_ENVIRONMENT = "https://loc8.dev.cablefinder.net";

const PATHS = new Set(["internet", "voice", "both", "ucaas", "sdwan"]);
// Paths that get a human follow-up flag.
const LONG_PATHS = new Set(["voice", "both", "ucaas", "sdwan"]);
// Paths that collect the opportunity must-haves and build a loc8 draft.
const DRAFT_PATHS = new Set(["internet", "voice", "both", "ucaas", "sdwan"]);
const SERVICES = ["network", "sdwan", "voice", "tv"];

export const INTAKE_FIELDS = {
  path: "Choose internet, voice, both, or SD-WAN.",
  speeds: "Enter the speeds you want.",
  access: "Choose a connection type.",
  budget: "Leave budget blank, or enter only a number you decided on.",
  business: "Enter the business name.",
  first: "Enter the contact first name.",
  last: "Enter the contact last name.",
  suite: "Enter a suite, or mark that a suite is not needed.",
  services: "Choose at least one service.",
  term: "Choose at least one term.",
  date: "Enter the date service is needed.",
  price: "Leave the price point blank, or enter only a number you decided on.",
  voiceType: "Choose a voice type.",
  seats: "Enter the number of seats.",
  employees: "Enter the number of employees.",
  website: "Enter a website.",
  connection: "Choose a connection type.",
  bandwidth: "Enter the bandwidth in Mbps.",
  roe: "Check the review box to continue.",
  vendor: "Leave the vendor blank, or use the vendor from the page.",
  save: "That request could not be saved. Call 970-660-5088 or use the contact page. Nothing was ordered.",
};

export function partnerFromEnv(env = process.env) {
  const fullName = String(env.LOC8_PARTNER_NAME || "").trim();
  const email = String(env.LOC8_PARTNER_EMAIL || "").trim();
  const phone = String(env.LOC8_PARTNER_PHONE || "").trim();
  if (!fullName || !email || !phone) return null;
  return { fullName, email, phone };
}

export function acceptBusinessIntake(body, options = {}) {
  const schema = options.schema || loadOpportunitySchema();
  const catalog = Array.isArray(options.catalog) ? options.catalog : [];
  const now = options.now || new Date();
  const partner = options.partner === undefined ? partnerFromEnv(options.env || process.env) : options.partner;
  const errors = [];
  const path = resolvePath(body);
  if (!path) errors.push(INTAKE_FIELDS.path);

  const speeds = clip(body?.speeds ?? body?.desiredSpeeds, 120);
  const accessRaw = clip(body?.accessType || body?.access, 40);
  const connectionTypes = schema.properties.networkConnectivity.properties.connectivityType.enum;
  const accessConnection = matchConnection(accessRaw, connectionTypes);
  const accessType = accessConnection ? accessRaw.toLowerCase() : "";

  const budget = optionalNumber(body?.budget);
  if (budget.error) errors.push(INTAKE_FIELDS.budget);
  const price = optionalNumber(body?.pricePoint ?? body?.price);
  if (price.error) errors.push(INTAKE_FIELDS.price);

  const business = clip(body?.business ?? body?.company, 120);
  const first = clip(body?.firstName ?? body?.contactFirstName, 60);
  const last = clip(body?.lastName ?? body?.contactLastName, 60);
  const email = clip(body?.email ?? body?.contactEmail, 120);
  const phoneRaw = clip(body?.phone ?? body?.contactPhone, 40);
  const phone = phoneRaw.replace(/\D/g, "");
  if (business.length < 2) errors.push(INTAKE_FIELDS.business);
  if (first.length < 1) errors.push(INTAKE_FIELDS.first);
  if (last.length < 1) errors.push(INTAKE_FIELDS.last);
  if (!email && !phone) errors.push(COPY.validation.contact);
  else {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(COPY.validation.email);
    if (phone && (phone.length < 10 || phone.length > 11)) errors.push(COPY.validation.phone);
  }

  const address = validateAddress({
    country: body?.country,
    street: body?.street,
    city: body?.city,
    region: body?.region ?? body?.state,
    postal: body?.postal ?? body?.zip,
  });
  if (!address.ok) errors.push(...address.errors);

  const vendorName = clip(body?.vendor ?? body?.vendorName, 80);
  const names = new Set(catalog.map((item) => item.name));
  if (vendorName && vendorName !== COPY.vendor.notSure && names.size && !names.has(vendorName)) {
    errors.push(INTAKE_FIELDS.vendor);
  }
  const prefilledVendor = vendorName && vendorName !== COPY.vendor.notSure ? vendorName : null;

  const consent = body?.consent === true || body?.consent === "yes";
  if (!consent) errors.push(COPY.validation.consent);

  // Every known path, internet included, collects the draft must-haves.
  const long = DRAFT_PATHS.has(path);
  const selected = normalizeServices(body, path);
  const term = normalizeTerm(body?.term);
  const suite = clip(body?.suite ?? body?.line2, 80);
  const suiteNotNeeded = body?.suiteNotNeeded === true || body?.line2NotNeeded === true;
  const voiceType = clip(body?.voiceType, 40);
  const seats = integerField(body?.seats);
  const employees = integerField(body?.employees);
  const website = clip(body?.website, 200);
  const connectionType = matchConnection(body?.connectionType, connectionTypes) || accessConnection;
  const bandwidth = bandwidthField(body?.bandwidthMbps ?? body?.bandwidth, speeds);
  const dateNeeded = clip(body?.dateNeeded ?? body?.dateServicesNeeded, 20);
  const currentProvider = clip(body?.currentProvider, 120);
  const contractEnd = clip(body?.contractEnd, 40);
  const voiceTypes = schema.properties.voice.properties.voiceType.enum;
  const needsNetwork = long && (selected.includes("network") || selected.includes("sdwan") || path === "both");
  const needsVoice = long && (selected.includes("voice") || path === "voice" || path === "ucaas" || path === "both");

  // Voice-only requests have no network block, so they are not asked for a
  // speed or connection type. An unknown path still gets every message.
  if (!long || needsNetwork) {
    if (speeds.length < 2) errors.push(INTAKE_FIELDS.speeds);
    if (!accessType) errors.push(INTAKE_FIELDS.access);
  }

  if (long) {
    if (!selected.length) errors.push(INTAKE_FIELDS.services);
    if (!term.mtm && !term.y1 && !term.y2 && !term.y3) errors.push(INTAKE_FIELDS.term);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateNeeded)) errors.push(INTAKE_FIELDS.date);
    if (!suite && !suiteNotNeeded) errors.push(INTAKE_FIELDS.suite);
    if (body?.roe !== true && body?.roeDisclaimerConfirmed !== true) errors.push(INTAKE_FIELDS.roe);
    if (needsVoice) {
      if (!voiceTypes.includes(voiceType)) errors.push(INTAKE_FIELDS.voiceType);
      if (!seats.ok) errors.push(INTAKE_FIELDS.seats);
      if (!employees.ok) errors.push(INTAKE_FIELDS.employees);
      if (website.length < 1) errors.push(INTAKE_FIELDS.website);
    }
    if (needsNetwork) {
      if (!connectionType) errors.push(INTAKE_FIELDS.connection);
      if (!bandwidth.ok) errors.push(INTAKE_FIELDS.bandwidth);
    }
  }

  if (errors.length || !address.ok) {
    return { ok: false, errors: unique(errors) };
  }

  const statedPrice = price.value != null ? price.value : budget.value;
  let opportunity = null;
  let opportunityError = "";
  if (long) {
    // The opportunity draft requires both a contact email and a phone. A valid
    // request may have only one, so skip the draft rather than fail it.
    if (!email || !phone) {
      opportunityError = "contact_incomplete";
    } else if (!partner) {
      opportunityError = "partner_not_configured";
    } else {
      opportunity = buildDraft({
        schema,
        partner,
        now,
        source: body?.source === "chat" ? "chat" : "ui",
        business,
        first,
        last,
        email,
        phone,
        address: address.address,
        suite,
        suiteNotNeeded,
        selected,
        term,
        statedPrice,
        dateNeeded,
        voiceType,
        seats: seats.value,
        employees: employees.value,
        website,
        connectionType,
        bandwidth: bandwidth.value,
        needsNetwork,
        needsVoice,
        currentProvider,
        contractEnd,
        extraNotes: clip(body?.notes, 2000),
      });
      const checked = validateOpportunityDraft(opportunity, schema);
      if (!checked.ok) {
        const partnerOnly = checked.errors.every((item) => item.startsWith("$.partner"));
        if (!partnerOnly) return { ok: false, errors: [INTAKE_FIELDS.save] };
        opportunity = null;
        opportunityError = "partner_invalid";
      }
    }
  }

  const value = {
    kind: "intake",
    flow: "business",
    company: business,
    contactName: `${first} ${last}`.trim(),
    contactFirstName: first,
    contactLastName: last,
    contactEmail: email,
    contactPhone: phone,
    country: address.address.country,
    street: address.address.street,
    city: address.address.city,
    region: address.address.region,
    postal: address.address.postal,
    suite,
    formatted: [address.address.formatted, suite].filter(Boolean).join(", "),
    path,
    vendorName: prefilledVendor || "",
    prefilledVendor,
    desiredSpeeds: speeds,
    accessType,
    budget: budget.value,
    humanFollowUp: LONG_PATHS.has(path),
    services: long ? selected.join(", ") : path,
    linesSeats: needsVoice && seats.ok ? String(seats.value) : "",
    timeline: long ? dateNeeded : "",
    notes: noteText({ currentProvider, contractEnd, extra: clip(body?.notes, 2000) }),
    currentProvider,
    contractEnd,
    pricing: "Peak Signal will follow up with options.",
    opportunity,
    opportunityError,
    returnedPricing: null,
  };
  value.fingerprint = createHash("sha256").update(JSON.stringify({
    path,
    company: business.toLowerCase(),
    email: email.toLowerCase(),
    phone,
    address: value.formatted.toLowerCase(),
    vendor: prefilledVendor || "",
    speeds: speeds.toLowerCase(),
    accessType,
    budget: budget.value,
    services: value.services,
  })).digest("hex");

  return { ok: true, errors: [], value };
}

export function buildIntakeNotice(record) {
  const envelope = {
    requestId: record.id,
    path: record.path,
    prefilledVendor: record.prefilledVendor || null,
    desiredSpeeds: record.desiredSpeeds || "",
    accessType: record.accessType || "",
    budget: record.budget == null ? null : record.budget,
    humanFollowUp: record.humanFollowUp === true,
    opportunity: record.opportunity || null,
  };
  const json = JSON.stringify(envelope, null, 2);
  const lines = [
    SUBJECT_TAG,
    `Request ID: ${record.id}`,
    `Path: ${record.path}`,
    `Business: ${record.company}`,
    `Prefilled vendor: ${record.prefilledVendor || "(none)"}`,
    `Desired speeds: ${record.desiredSpeeds || ""}`,
    `Fiber or broadband: ${record.accessType || ""}`,
    `Budget: ${record.budget == null ? "(not stated)" : record.budget}`,
    `Human follow-up: ${record.humanFollowUp ? "yes" : "no"}`,
    `Contact: ${record.contactName}`,
    `Email: ${record.contactEmail || ""}`,
    `Phone: ${record.contactPhone || ""}`,
    `Address: ${record.formatted}`,
    `Opportunity draft: ${record.opportunity ? "ready" : record.opportunityError || "not applicable"}`,
    "Customer email: not sent",
    ...(record.queued === false ? ["Queue: not stored (intake flag off). Follow up from this email."] : []),
    "",
    "```json",
    json,
    "```",
    "",
  ];
  const business = String(record.company || "").replace(/\s+/g, " ").trim();
  return {
    subject: `${SUBJECT_TAG} ${record.id} ${record.path} ${business}`,
    text: lines.join("\n"),
    json,
    replyTo: record.contactEmail || "",
    envelope,
  };
}

export function parseIntakeEmail({ subject = "", text = "" } = {}) {
  const subjectMatch = String(subject).match(/^\[PEAK-TELECOM-INTAKE v1\] (\S+) (internet|voice|both|ucaas|sdwan) (.*)$/);
  const fence = String(text).match(/```json\n([\s\S]*?)\n```/);
  const json = fence ? JSON.parse(fence[1]) : null;
  const fields = {};
  for (const line of String(text).split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z -]*): (.*)$/);
    if (match) fields[match[1]] = match[2];
  }
  return {
    subject: subjectMatch
      ? { requestId: subjectMatch[1], path: subjectMatch[2], business: subjectMatch[3] }
      : null,
    fields,
    json,
  };
}

function buildDraft(input) {
  const address = {
    line1: input.address.street,
    city: input.address.city,
    state: input.address.region,
    zip: input.address.postal,
    country: input.address.country === "CA" ? "Canada" : "United States",
  };
  if (input.suite) address.line2 = input.suite;
  else address.line2NotNeeded = true;

  const notes = [];
  if (input.currentProvider) notes.push(`Current provider: ${input.currentProvider}.`);
  if (input.contractEnd) notes.push(`Contract end: ${input.contractEnd}.`);
  if (input.extraNotes) notes.push(input.extraNotes);
  notes.push("SANDBOX");

  const draft = {
    schemaVersion: "1.0.0",
    partner: {
      fullName: input.partner.fullName,
      email: input.partner.email,
      phone: input.partner.phone,
    },
    customer: {
      businessName: input.business,
      contactFirstName: input.first,
      contactLastName: input.last,
      contactEmail: input.email,
      contactPhone: input.phone,
      locationCount: 1,
      address,
    },
    services: {
      selected: input.selected,
      term: input.term,
      desiredPricePoint: input.statedPrice,
      dateServicesNeeded: input.dateNeeded,
      roeDisclaimerConfirmed: true,
    },
    notes: { opportunityNotes: notes.join(" ") },
    metadata: {
      source: input.source,
      status: "draft",
      createdAt: input.now.toISOString(),
      updatedAt: input.now.toISOString(),
      environment: SANDBOX_ENVIRONMENT,
    },
  };

  if (input.needsNetwork) {
    draft.networkConnectivity = {
      connectivityType: input.connectionType,
      bandwidthMbps: input.bandwidth,
    };
  }
  if (input.needsVoice) {
    draft.voice = {
      voiceType: input.voiceType,
      seats: input.seats,
      employees: input.employees,
      website: input.website,
    };
  }
  return draft;
}

function resolvePath(body) {
  const raw = String(body?.path || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  const voiceType = clip(body?.voiceType, 40);
  if (raw === "both") return "both";
  if (raw === "sdwan" || raw === "sd-wan") return "sdwan";
  if (raw === "ucaas") return "ucaas";
  if (raw === "voice") return voiceType === "UCaaS" ? "ucaas" : "voice";
  if (raw === "internet") return "internet";
  return "";
}

function normalizeServices(body, path) {
  const allowed = new Set(SERVICES);
  const picked = Array.isArray(body?.servicesSelected) ? body.servicesSelected : [];
  const selected = [];
  for (const item of picked) {
    const key = String(item || "").trim().toLowerCase();
    const normal = key === "sd-wan" ? "sdwan" : key;
    if (allowed.has(normal) && !selected.includes(normal)) selected.push(normal);
  }
  if (!DRAFT_PATHS.has(path)) return selected;
  const ensure = (name) => {
    if (!selected.includes(name)) selected.push(name);
  };
  if (path === "internet") ensure("network");
  if (path === "sdwan") ensure("sdwan");
  if (path === "voice" || path === "ucaas") ensure("voice");
  if (path === "both") {
    ensure("network");
    ensure("voice");
  }
  return selected;
}

function normalizeTerm(term) {
  const source = term && typeof term === "object" ? term : {};
  return {
    mtm: source.mtm === true,
    y1: source.y1 === true,
    y2: source.y2 === true,
    y3: source.y3 === true,
  };
}

// One connection-type answer, matched to the draft enum without regard to case
// ("fiber" -> "Fiber"). Anything else is blank, never guessed.
function matchConnection(value, allowed) {
  const text = clip(value, 40).toLowerCase();
  if (!text) return "";
  return allowed.find((item) => item.toLowerCase() === text) || "";
}

function optionalNumber(value) {
  if (value == null) return { value: null };
  const text = String(value).trim();
  if (!text) return { value: null };
  if (!/^\d+(\.\d+)?$/.test(text)) return { error: true, value: null };
  return { value: text };
}

function integerField(value) {
  if (value == null || String(value).trim() === "") return { ok: false };
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return { ok: false };
  return { ok: true, value: number };
}

function numberField(value) {
  if (value == null || String(value).trim() === "") return { ok: false };
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return { ok: false };
  return { ok: true, value: number };
}

// Bandwidth field first. When it is blank, accept the desired speed only when
// it is a bare number (the form asks for Mbps) or an explicit "<number> Mbps".
// Never guess a number.
function bandwidthField(value, speeds) {
  if (value != null && String(value).trim() !== "") return numberField(value);
  const bare = String(speeds || "").trim();
  if (/^\d+(\.\d+)?$/.test(bare)) return numberField(bare);
  const match = String(speeds || "").match(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*(?:mbps|mb\/s|megabits?)(?![a-z])/i);
  if (!match) return { ok: false };
  return numberField(match[1]);
}

function noteText({ currentProvider, contractEnd, extra }) {
  const lines = [];
  if (currentProvider) lines.push(`Current provider: ${currentProvider}.`);
  if (contractEnd) lines.push(`Contract end: ${contractEnd}.`);
  if (extra) lines.push(extra);
  return lines.join(" ");
}

function clip(value, max) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function unique(list) {
  return [...new Set(list)];
}

export function humanFollowUpPaths() {
  return [...LONG_PATHS];
}

export function isKnownPath(path) {
  return PATHS.has(path);
}
