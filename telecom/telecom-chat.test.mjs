import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { carriersForCountry, createSubmitGate, parseVendorHtml, validateAddress, vendorId } from "../static-site/telecom-carrier-rules.mjs";
import { COPY } from "../static-site/telecom-visitor-copy.mjs";
import {
  INTAKE_ERRORS,
  INTAKE_MESSAGE,
  applyIntakeLinks,
  createTelecomChat,
  handleOpsHttp,
  handlePublicHttp,
  intakeDisabledHtml,
} from "./telecom-chat.mjs";

const root = join(import.meta.dirname, "..");
const html = readFileSync(join(root, "static-site/telecom.html"), "utf8");
const catalog = parseVendorHtml(html);

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function harness(env, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "telecom-chat-"));
  const calls = [];
  const fetchImpl = options.fetch || (async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("api.github.com") && (!init?.method || init.method === "GET")) {
      return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
  });
  const service = createTelecomChat({
    env,
    file: join(dir, "queue.json"),
    catalog,
    fetch: fetchImpl,
    now: options.now,
    rateLimit: options.rateLimit,
    persist: options.persist,
  });
  return {
    service,
    calls,
    dir,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const US = {
  country: "US",
  street: "1801 California Street, Suite 2900",
  city: "Denver",
  region: "CO",
  postal: "80202",
};

const CA = {
  country: "Canada",
  street: "100 King Street West, Suite 5600",
  city: "Toronto",
  region: "ON",
  postal: "M5X 1C9",
};

function quoteBody(extra = {}) {
  const carriers = carriersForCountry(catalog, extra.country || "US");
  const carrier = carriers.find((item) => item.id === (extra.vendorId || "comcast")) || carriers[0];
  return {
    kind: "quote",
    ...US,
    company: "North Line Co",
    contactName: "Ada Lovelace",
    contactEmail: "ada@example.com",
    contactPhone: "(312) 555-0142",
    bandwidth: "1 Gbps",
    vendorId: carrier.id,
    offering: carrier.offerings[0],
    consent: true,
    idempotencyKey: extra.idempotencyKey || "idem-key-01",
    ...extra,
  };
}

test("flag off leaves the catalog page and inert endpoints", async () => {
  const { service, calls, cleanup } = harness({});
  try {
    assert.equal(service.enabled(), false);
    assert.equal(service.config().status, 404);
    assert.equal(service.address(US, {}).status, 404);
    assert.equal((await service.submit(quoteBody(), {})).status, 404);
    const res = mockRes();
    handleOpsHttp({ body: {} }, res, service, { authed: true, op: "list" });
    assert.equal(res.statusCode, 404);
    assert.equal(calls.length, 0);
    assert.equal(existsSync(service.file), false);
    assert.match(html, /href="\/contact"[^>]*>Request a quote/);
    assert.doesNotMatch(html, /id="telecom-chat"/);
    assert.equal((html.match(/<h1\b/gi) || []).length, 1);
    assert.match(html, /\/api\/telecom\/config/);
  } finally {
    cleanup();
  }
});

test("US and Canada addresses validate, and carriers follow the catalog", () => {
  const us = validateAddress({ ...US, region: "Colorado", postal: "80202-1234" });
  assert.equal(us.ok, true);
  assert.equal(us.address.region, "CO");
  assert.equal(us.address.postal, "80202-1234");
  assert.equal(us.address.country, "US");

  const ca = validateAddress({ ...CA, region: "Ontario", postal: "m5x1c9" });
  assert.equal(ca.ok, true);
  assert.equal(ca.address.region, "ON");
  assert.equal(ca.address.postal, "M5X 1C9");

  assert.deepEqual(validateAddress({ country: "Mexico", ...US, country: "Mexico" }).errors, [COPY.validation.country]);
  assert.ok(validateAddress({ ...US, postal: "M5X 1C9" }).errors.includes(COPY.validation.zip));
  assert.ok(validateAddress({ ...US, region: "ON" }).errors.includes(COPY.validation.state));
  assert.ok(validateAddress({ ...CA, postal: "80202" }).errors.includes(COPY.validation.postal));
  assert.ok(validateAddress({ ...CA, region: "CO" }).errors.includes(COPY.validation.province));
  assert.ok(validateAddress({ ...US, street: "12" }).errors.includes(COPY.validation.street));
  assert.ok(validateAddress({ ...US, city: "A" }).errors.includes(COPY.validation.city));

  const usCarriers = carriersForCountry(catalog, "US");
  const caCarriers = carriersForCountry(catalog, "CA");
  const usNames = usCarriers.map((item) => item.name);
  const caNames = caCarriers.map((item) => item.name);
  assert.ok(usNames.includes("Comcast"));
  assert.ok(usNames.includes("AT&T"));
  assert.ok(usNames.includes("Starlink"));
  assert.equal(usNames.includes("Rogers"), false);
  assert.equal(usNames.includes("RingCentral"), false);
  assert.equal(caNames[0], "Rogers");
  assert.ok(caNames.includes("Starlink"));
  assert.ok(caNames.includes("RingCentral"));
  assert.ok(caNames.includes("Zoom"));
  assert.equal(caNames.includes("Comcast"), false);
  assert.equal(caNames.includes("Spectrum"), false);
  assert.equal(vendorId("AT&T"), "att");
  const packed = JSON.stringify(usCarriers.concat(caCarriers));
  assert.doesNotMatch(packed, /\$\d/);
  assert.doesNotMatch(packed, /\bNRC\b|\bMRC\b/);
  for (const carrier of usCarriers.concat(caCarriers)) {
    assert.equal(carrier.pricing, "Peak Signal will follow up with options.");
    assert.equal(carrier.availability, "May serve this area. Peak Signal will confirm.");
    assert.ok(carrier.offerings.length > 0);
  }
});

test("a quote is queued once and only Brian is notified", async () => {
  const env = { PEAK_TELECOM_CHAT: "1", PEAK_FORMSPREE: "https://formspree.test/f/brian" };
  const { service, calls, cleanup } = harness(env);
  try {
    const body = quoteBody();
    const first = await service.submit(body, { headers: {} });
    assert.equal(first.status, 200);
    assert.equal(first.body.duplicate, false);
    assert.equal(first.body.notified, true);
    const stored = JSON.parse(readFileSync(service.file, "utf8"));
    assert.equal(stored.requests.length, 1);
    assert.equal(stored.requests[0].pricing, "Peak Signal will follow up with options.");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, env.PEAK_FORMSPREE);
    const payload = JSON.parse(calls[0].init.body);
    assert.deepEqual(Object.keys(payload).sort(), ["_subject", "message"]);
    assert.equal(payload.email, undefined);
    assert.equal(payload._replyto, undefined);
    assert.equal(payload._cc, undefined);
    assert.match(payload.message, /Peak Signal will follow up with options/);
    assert.match(payload.message, /No reply was sent to the visitor/);
    assert.match(payload.message, /Nothing was sent to a vendor/);
    assert.doesNotMatch(payload.message, /\$\d/);
    assert.doesNotMatch(calls[0].url, /ada@example\.com|evil\.example/);

    const second = await service.submit(body, { headers: {} });
    assert.equal(second.body.duplicate, true);
    assert.equal(second.body.id, first.body.id);
    assert.equal(calls.length, 1);

    const third = await service.submit({ ...body, idempotencyKey: "idem-key-02" }, { headers: {} });
    assert.equal(third.body.duplicate, true);
    assert.equal(calls.length, 1);
    assert.equal(JSON.parse(readFileSync(service.file, "utf8")).requests.length, 1);
  } finally {
    cleanup();
  }
});

test("honeypot, consent, rate limit, and a failed save do not notify", async () => {
  const env = { PEAK_TELECOM_CHAT: "1", PEAK_FORMSPREE: "https://formspree.test/f/brian" };
  const honey = harness(env);
  try {
    const tripped = await honey.service.submit({ ...quoteBody(), _gotcha: "https://evil.example/hook" }, {});
    assert.equal(tripped.status, 200);
    assert.equal(tripped.body.received, true);
    assert.equal(tripped.body.id, undefined);
    assert.equal(honey.calls.length, 0);
    const stored = JSON.parse(readFileSync(honey.service.file, "utf8"));
    assert.equal(stored.requests.length, 0);
  } finally {
    honey.cleanup();
  }

  const missing = harness(env);
  try {
    const denied = await missing.service.submit(quoteBody({ consent: false, idempotencyKey: "idem-key-03" }), {});
    assert.equal(denied.status, 400);
    assert.ok(denied.body.errors.includes(COPY.validation.consent));
    assert.equal(missing.calls.length, 0);
  } finally {
    missing.cleanup();
  }

  const limited = harness(env, { rateLimit: 2 });
  try {
    const a = await limited.service.submit(quoteBody({ company: "One Co", idempotencyKey: "idem-key-11" }), {});
    const b = await limited.service.submit(quoteBody({ company: "Two Co", idempotencyKey: "idem-key-12" }), {});
    const c = await limited.service.submit(quoteBody({ company: "Three Co", idempotencyKey: "idem-key-13" }), {});
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(c.status, 429);
    assert.deepEqual(c.body.errors, [COPY.validation.rate]);
    assert.equal(limited.calls.length, 2);
  } finally {
    limited.cleanup();
  }

  const disk = harness(env, {
    persist() {
      throw new Error("disk");
    },
  });
  try {
    const failed = await disk.service.submit(quoteBody({ idempotencyKey: "idem-key-21" }), {});
    assert.equal(failed.status, 503);
    assert.equal(disk.calls.length, 0);
  } finally {
    disk.cleanup();
  }
});

test("an opportunity is queued, and a needs URL is not fetched", async () => {
  const env = { PEAK_TELECOM_CHAT: "1", PEAK_FORMSPREE: "https://formspree.test/f/brian" };
  const { service, calls, cleanup } = harness(env);
  try {
    const result = await service.submit({
      kind: "opportunity",
      company: "North Line Co",
      contactName: "Ada Lovelace",
      contactEmail: "ada@example.com",
      contactPhone: "3125550142",
      seats: "18 seats",
      currentProvider: "Not sure",
      contractEnd: "Not sure",
      locations: "U.S. headquarters and a small Toronto office",
      needs: "Keep existing numbers. See https://evil.example/hook",
      vendorId: "ringcentral",
      consent: true,
      idempotencyKey: "idem-opp-01",
    }, {});
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, env.PEAK_FORMSPREE);
    assert.equal(calls.some((call) => String(call.url).includes("evil.example")), false);
    const row = JSON.parse(readFileSync(service.file, "utf8")).requests[0];
    assert.equal(row.kind, "opportunity");
    assert.equal(row.seats, "18");
    assert.equal(row.vendorName, "RingCentral");
    assert.equal(row.pricing, "Peak Signal will follow up with options.");
  } finally {
    cleanup();
  }
});

test("GitHub backup stays on the brain repo and ops approval sends nothing", async () => {
  const env = {
    PEAK_TELECOM_CHAT: "1",
    PEAK_FORMSPREE: "https://formspree.test/f/brian",
    GITHUB_TOKEN: "test-token",
  };
  const { service, calls, cleanup } = harness(env);
  try {
    const saved = await service.submit(quoteBody({ idempotencyKey: "idem-key-31" }), {});
    assert.equal(saved.status, 200);
    const hosts = calls.map((call) => new URL(call.url).host);
    assert.deepEqual(hosts, ["formspree.test", "api.github.com", "api.github.com"]);
    const put = calls.find((call) => call.init?.method === "PUT");
    const decoded = JSON.parse(Buffer.from(JSON.parse(put.init.body).content, "base64").toString("utf8"));
    assert.equal(decoded.requests[0].company, "North Line Co");
    assert.doesNotMatch(JSON.stringify(decoded), /\$\d/);
    assert.match(put.url, /brianscottwatson-cell\/brain\/contents\/clients\/peak-signal\/telecom-queue\.json$/);

    const before = calls.length;
    const decided = service.decide(saved.body.id, { action: "approve", note: "Reviewed by Brian at Peak Signal" });
    assert.equal(decided.status, 200);
    assert.equal(decided.body.request.status, "approved");
    assert.equal(calls.length, before);

    const open = mockRes();
    handleOpsHttp({}, open, service, { authed: false, op: "list" });
    assert.equal(open.statusCode, 401);
    const closed = mockRes();
    const off = harness({}).service;
    handleOpsHttp({}, closed, off, { authed: true, op: "list" });
    assert.equal(closed.statusCode, 404);
  } finally {
    cleanup();
  }
});

test("public chat files carry the visitor copy and none of the banned material", () => {
  const files = [
    "static-site/telecom-visitor-copy.mjs",
    "static-site/telecom-carrier-rules.mjs",
    "static-site/telecom-chat.js",
    "static-site/telecom.html",
    "ops/telecom.html",
    "telecom/telecom-chat.mjs",
    "telecom/quote.html",
    "telecom/openapi.json",
  ];
  const banned = [
    /\bloc8\b/i,
    /\bpax8\b/i,
    /\bwatson\b/i,
    /distribution partners/i,
    /\bchris\b/i,
    /\bdevon\b/i,
    /\bjed\b/i,
    /\btdm\b/i,
    /\$\d/,
    /\bNRC\b/,
    /\bMRC\b/,
  ];
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    for (const pattern of banned) {
      assert.doesNotMatch(text, pattern, `${file} matched ${pattern}`);
    }
  }
  const client = readFileSync(join(root, "static-site/telecom-chat.js"), "utf8");
  assert.match(client, /telecom-visitor-copy/);
  assert.doesNotMatch(client, /formspree/i);
  assert.match(COPY.consent.label, /Peak Signal may contact me about this request\./);
  assert.match(COPY.results.pricing, /Peak Signal will follow up with options/);
  const gate = createSubmitGate(() => "idem-key-41");
  assert.equal(gate.begin(), "idem-key-41");
  assert.equal(gate.begin(), "");
  gate.finish(false);
  assert.equal(gate.begin(), "idem-key-41");
});

function intakeBody(extra = {}) {
  return {
    business: "North Line Co",
    contact_name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "3125550142",
    service_address: "1801 California Street, Suite 2900, Denver, CO 80202",
    country: "US",
    services: "Business internet",
    lines_seats: "12 seats",
    timeline: "This month",
    notes: "Please include phone service.",
    consent: true,
    idempotencyKey: "idem-intake-01",
    ...extra,
  };
}

test("intake flag off is disabled, and the catalog links stay on the contact page", async () => {
  const { service, calls, cleanup } = harness({});
  try {
    const denied = await service.quoteRequest(intakeBody(), {});
    assert.equal(denied.status, 404);
    assert.deepEqual(denied.body, { ok: false, error: "disabled" });
    assert.equal(calls.length, 0);
    assert.equal(existsSync(service.file), false);
    assert.equal(applyIntakeLinks(html, {}), html);
    assert.match(intakeDisabledHtml(), /This form is disabled\./);
    assert.doesNotMatch(intakeDisabledHtml(), /\$\d/);
  } finally {
    cleanup();
  }
});

test("an enabled intake request is queued once and only Brian is notified", async () => {
  const env = { PEAK_TELECOM_INTAKE_ENABLED: "1", PEAK_FORMSPREE: "https://formspree.test/f/brian" };
  const { service, calls, cleanup } = harness(env);
  try {
    assert.equal(service.enabled(), false);
    assert.equal(service.intakeOn(), true);
    assert.equal(service.reviewEnabled(), true);
    const first = await service.quoteRequest(intakeBody(), {});
    assert.equal(first.status, 200);
    assert.equal(first.body.message, INTAKE_MESSAGE);
    assert.match(first.body.id, /^tq_[0-9a-f]{16}$/);
    assert.equal(Object.hasOwn(first.body, "duplicate"), false);
    assert.doesNotMatch(JSON.stringify(first.body), /\$\d/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, env.PEAK_FORMSPREE);
    const payload = JSON.parse(calls[0].init.body);
    assert.deepEqual(Object.keys(payload).sort(), ["_subject", "message"]);
    assert.equal(payload._replyto, undefined);
    assert.equal(payload._cc, undefined);
    assert.equal(payload.email, undefined);
    assert.match(payload.message, new RegExp(INTAKE_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(payload.message, /Nothing was sent to a vendor/);
    assert.doesNotMatch(payload.message, /\$\d/);
    const stored = JSON.parse(readFileSync(service.file, "utf8"));
    assert.equal(stored.requests.length, 1);
    assert.equal(stored.requests[0].kind, "intake");
    assert.equal(stored.requests[0].company, "North Line Co");

    const again = await service.quoteRequest(intakeBody({ idempotencyKey: "idem-intake-02" }), {});
    assert.equal(again.body.duplicate, true);
    assert.equal(again.body.id, first.body.id);
    assert.equal(again.body.message, INTAKE_MESSAGE);
    assert.equal(calls.length, 1);

    const honey = await service.quoteRequest(intakeBody({ _gotcha: "https://evil.example/hook", idempotencyKey: "idem-intake-03" }), {});
    assert.equal(honey.status, 400);
    assert.deepEqual(honey.body.errors, [INTAKE_ERRORS.honeypot]);
    assert.equal(calls.length, 1);
    assert.equal(JSON.parse(readFileSync(service.file, "utf8")).requests.length, 1);
    assert.equal(calls.some((call) => String(call.url).includes("evil.example")), false);

    const listed = service.list();
    assert.equal(listed.status, 200);
    assert.equal(listed.body.requests[0].pricing, INTAKE_MESSAGE);
    assert.doesNotMatch(JSON.stringify(listed.body), /\$\d/);
  } finally {
    cleanup();
  }
});

test("intake links replace only the quote buttons, and the public spec has no prices", () => {
  const linked = applyIntakeLinks(html, { PEAK_TELECOM_INTAKE_ENABLED: "1" });
  assert.match(linked, /href="\/telecom\/quote" class="quote-btn/);
  assert.match(linked, /<a href="\/telecom\/quote">Request a quote<\/a>/);
  assert.match(linked, /href="\/contact"/);
  assert.doesNotMatch(linked, /href="\/contact" class="quote-btn/);
  const spec = JSON.parse(readFileSync(join(root, "telecom/openapi.json"), "utf8"));
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(
    spec.paths["/api/telecom/quote-request"].post.responses["200"].content["application/json"].example.message,
    INTAKE_MESSAGE,
  );
  const form = readFileSync(join(root, "telecom/quote.html"), "utf8");
  for (const label of ["Business", "Contact name", "Email", "Phone", "Service address", "Country", "Services wanted", "Lines or seats", "Timeline", "Notes"]) {
    assert.match(form, new RegExp(`>${label}<`));
  }
  assert.match(form, /Peak Signal may contact me about this request\./);
  assert.match(form, /Request received/);
  assert.match(form, /Reference ID: /);
});

test("the public handler 404s until the flag is on", async () => {
  const off = harness({});
  const on = harness({ PEAK_TELECOM_CHAT: "1", PEAK_FORMSPREE: "https://formspree.test/f/brian" });
  try {
    const hidden = mockRes();
    await handlePublicHttp({ method: "GET", path: "/config" }, hidden, off.service);
    assert.equal(hidden.statusCode, 404);
    const shown = mockRes();
    await handlePublicHttp({ method: "GET", path: "/config" }, shown, on.service);
    assert.equal(shown.statusCode, 200);
    assert.equal(shown.body.enabled, true);
    const posted = mockRes();
    await handlePublicHttp({
      method: "POST",
      path: "/requests",
      headers: {},
      body: quoteBody({ idempotencyKey: "idem-key-51" }),
    }, posted, on.service);
    assert.equal(posted.statusCode, 200);
    assert.equal(on.calls.length, 1);
  } finally {
    off.cleanup();
    on.cleanup();
  }
});
