import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseVendorHtml } from "../../static-site/telecom-carrier-rules.mjs";
import { createTelecomChat } from "../telecom-chat.mjs";
import {
  INTAKE_FIELDS,
  acceptBusinessIntake,
  buildIntakeNotice,
  parseIntakeEmail,
} from "./business-quote.mjs";
import { loadOpportunitySchema, validateOpportunityDraft } from "./opportunity-schema.mjs";
import { createDurableQueue } from "../queue/durable-queue.mjs";

const root = join(import.meta.dirname, "../..");
const catalog = parseVendorHtml(readFileSync(join(root, "static-site/telecom.html"), "utf8"));
const schema = loadOpportunitySchema();
const partnerEnv = {
  LOC8_PARTNER_NAME: "Partner Name",
  LOC8_PARTNER_EMAIL: "partner@example.com",
  LOC8_PARTNER_PHONE: "303-555-0100",
};

function address(extra = {}) {
  return {
    country: "US",
    street: "1801 California Street",
    city: "Denver",
    region: "CO",
    postal: "80202",
    ...extra,
  };
}

function person(extra = {}) {
  return {
    business: "North Line Co",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    phone: "3125550142",
    consent: true,
    ...address(),
    ...extra,
  };
}

function internet(extra = {}) {
  return person({
    flow: "business",
    path: "internet",
    speeds: "500 Mbps",
    accessType: "fiber",
    budget: "",
    suiteNotNeeded: true,
    term: { mtm: false, y1: false, y2: false, y3: true },
    dateNeeded: "2026-12-01",
    roe: true,
    idempotencyKey: "idem-net-01",
    ...extra,
  });
}

function voice(extra = {}) {
  return person({
    flow: "business",
    path: "voice",
    speeds: "Voice seats",
    accessType: "broadband",
    budget: "",
    suiteNotNeeded: true,
    servicesSelected: ["voice"],
    term: { mtm: false, y1: true, y2: false, y3: false },
    dateNeeded: "2026-12-01",
    voiceType: "UCaaS",
    seats: "12",
    employees: "20",
    website: "https://northline.example",
    currentProvider: "Current phone vendor",
    contractEnd: "2026-08-01",
    roe: true,
    idempotencyKey: "idem-voice-01",
    ...extra,
  });
}

function harness(env, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "telecom-intake-"));
  const calls = [];
  const fetchImpl = options.fetch || (async (url, init) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
  });
  const service = createTelecomChat({
    env,
    file: join(dir, "queue.json"),
    catalog,
    fetch: fetchImpl,
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

test("the checked-in opportunity example validates, including allOf", () => {
  const example = JSON.parse(readFileSync(join(root, "data/loc8/opportunity.example.acme.json"), "utf8"));
  assert.equal(validateOpportunityDraft(example, schema).ok, true, JSON.stringify(validateOpportunityDraft(example, schema).errors));

  const otherHost = structuredClone(example);
  otherHost.metadata.environment = "https://example.com";
  assert.equal(validateOpportunityDraft(otherHost, schema).ok, false);

  const extraPartner = structuredClone(example);
  extraPartner.partner.badge = "nope";
  assert.equal(validateOpportunityDraft(extraPartner, schema).ok, false);

  const noNetwork = structuredClone(example);
  delete noNetwork.networkConnectivity;
  assert.equal(validateOpportunityDraft(noNetwork, schema).ok, false);

  const noVoice = structuredClone(example);
  delete noVoice.voice;
  assert.equal(validateOpportunityDraft(noVoice, schema).ok, false);

  const suite = structuredClone(example);
  suite.customer.address.line2NotNeeded = false;
  assert.equal(validateOpportunityDraft(suite, schema).ok, false);
});

test("internet intake leaves budget null and does not invent a price", () => {
  const blank = acceptBusinessIntake(internet(), { catalog, env: partnerEnv, now: new Date("2026-11-17T12:00:00Z") });
  assert.equal(blank.ok, true, JSON.stringify(blank.errors));
  assert.equal(blank.value.budget, null);
  assert.equal(blank.value.path, "internet");
  assert.equal(blank.value.humanFollowUp, false);
  assert.equal(blank.value.prefilledVendor, null);
  assert.equal(blank.value.opportunity.services.desiredPricePoint, null);
  assert.doesNotMatch(JSON.stringify(blank.value.opportunity), /\$\d/);

  const stated = acceptBusinessIntake(internet({ budget: "400", vendor: "Comcast" }), { catalog, env: partnerEnv });
  assert.equal(stated.ok, true, JSON.stringify(stated.errors));
  assert.equal(stated.value.budget, "400");
  assert.equal(stated.value.prefilledVendor, "Comcast");
  assert.equal(stated.value.opportunity.services.desiredPricePoint, "400");

  const invented = acceptBusinessIntake(internet({ budget: "about 400" }), { catalog, env: partnerEnv });
  assert.equal(invented.ok, false);
  assert.ok(invented.errors.includes(INTAKE_FIELDS.budget));
  assert.equal(acceptBusinessIntake(internet({ speeds: "" }), { catalog }).ok, false);
  assert.equal(acceptBusinessIntake(internet({ accessType: "" }), { catalog }).ok, false);
});

test("internet requests build a sandbox loc8 draft with network and no voice", () => {
  const now = new Date("2026-11-17T18:00:00Z");
  const result = acceptBusinessIntake(internet({
    currentProvider: "Current internet vendor",
    contractEnd: "2026-08-01",
  }), { catalog, env: partnerEnv, now });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const draft = result.value.opportunity;
  assert.equal(result.value.opportunityError, "");
  assert.equal(result.value.humanFollowUp, false);
  assert.equal(draft.metadata.status, "draft");
  assert.equal(draft.metadata.environment, "https://loc8.dev.cablefinder.net");
  assert.ok(draft.services.selected.includes("network"));
  assert.equal(draft.services.selected.includes("voice"), false);
  assert.deepEqual(draft.networkConnectivity, { connectivityType: "Fiber", bandwidthMbps: 500 });
  assert.equal(Object.hasOwn(draft, "voice"), false);
  assert.equal(Object.hasOwn(draft, "externalOpportunityId"), false);
  assert.equal(draft.customer.address.line2NotNeeded, true);
  assert.equal(Object.hasOwn(draft.customer.address, "line2"), false);
  assert.equal(draft.services.desiredPricePoint, null);
  assert.equal(draft.services.dateServicesNeeded, "2026-12-01");
  assert.equal(draft.services.term.y3, true);
  assert.equal(draft.partner.fullName, "Partner Name");
  assert.match(draft.notes.opportunityNotes, /Current provider: Current internet vendor\./);
  assert.match(draft.notes.opportunityNotes, /Contract end: 2026-08-01\./);
  assert.match(draft.notes.opportunityNotes, /SANDBOX$/);
  const checked = validateOpportunityDraft(draft, schema);
  assert.equal(checked.ok, true, JSON.stringify(checked.errors));

  const suite = acceptBusinessIntake(internet({ suiteNotNeeded: false, suite: "Suite 400" }), { catalog, env: partnerEnv, now });
  assert.equal(suite.ok, true, JSON.stringify(suite.errors));
  assert.equal(suite.value.opportunity.customer.address.line2, "Suite 400");
  assert.equal(Object.hasOwn(suite.value.opportunity.customer.address, "line2NotNeeded"), false);
  assert.equal(validateOpportunityDraft(suite.value.opportunity, schema).ok, true);

  const broadband = acceptBusinessIntake(internet({ accessType: "broadband", speeds: "Fast", bandwidthMbps: "300" }), { catalog, env: partnerEnv, now });
  assert.equal(broadband.ok, true, JSON.stringify(broadband.errors));
  assert.deepEqual(broadband.value.opportunity.networkConnectivity, { connectivityType: "Broadband", bandwidthMbps: 300 });

  const picked = acceptBusinessIntake(internet({ connectionType: "Coax" }), { catalog, env: partnerEnv, now });
  assert.equal(picked.ok, true, JSON.stringify(picked.errors));
  assert.equal(picked.value.opportunity.networkConnectivity.connectivityType, "Coax");
});

test("internet requests without partner env are queued with no draft", async () => {
  const result = acceptBusinessIntake(internet(), { catalog, env: {} });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.value.opportunity, null);
  assert.equal(result.value.opportunityError, "partner_not_configured");
  assert.equal(result.value.budget, null);
  const notice = buildIntakeNotice({ ...result.value, id: "tq_netnopartner" });
  assert.equal(parseIntakeEmail(notice).json.opportunity, null);

  const env = {
    PEAK_TELECOM_INTAKE_ENABLED: "1",
    RESEND_API_KEY: "re_test_key",
    PEAK_INTAKE_TO: "intake@peaksignal.example",
  };
  const { service, calls, cleanup } = harness(env);
  try {
    const saved = await service.quoteRequest(internet({ idempotencyKey: "idem-net-np-01" }), {});
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(calls.length, 1);
    const payload = JSON.parse(calls[0].init.body);
    assert.match(payload.text, /Opportunity draft: partner_not_configured/);
  } finally {
    cleanup();
  }
});

test("incomplete internet must-haves are rejected with the field messages", () => {
  const now = new Date("2026-11-17T18:00:00Z");
  const cases = [
    [{ term: { mtm: false, y1: false, y2: false, y3: false } }, INTAKE_FIELDS.term],
    [{ term: undefined }, INTAKE_FIELDS.term],
    [{ dateNeeded: "" }, INTAKE_FIELDS.date],
    [{ dateNeeded: "next month" }, INTAKE_FIELDS.date],
    [{ suiteNotNeeded: false, suite: "" }, INTAKE_FIELDS.suite],
    [{ roe: false }, INTAKE_FIELDS.roe],
    [{ speeds: "As fast as possible" }, INTAKE_FIELDS.bandwidth],
    [{ speeds: "1 Gig" }, INTAKE_FIELDS.bandwidth],
    [{ bandwidthMbps: "fast" }, INTAKE_FIELDS.bandwidth],
  ];
  for (const [extra, message] of cases) {
    const result = acceptBusinessIntake(internet(extra), { catalog, env: partnerEnv, now });
    assert.equal(result.ok, false, JSON.stringify(extra));
    assert.ok(result.errors.includes(message), `${JSON.stringify(extra)} -> ${JSON.stringify(result.errors)}`);
  }

  const noVoiceAsks = acceptBusinessIntake(internet({ roe: false }), { catalog, env: partnerEnv, now });
  for (const field of ["voiceType", "seats", "employees", "website"]) {
    assert.equal(noVoiceAsks.errors.includes(INTAKE_FIELDS[field]), false, field);
  }
});

test("UCaaS and SD-WAN drafts validate, and a missing partner is not invented", () => {
  const now = new Date("2026-11-17T18:00:00Z");
  const ucaas = acceptBusinessIntake(voice(), { catalog, env: partnerEnv, now });
  assert.equal(ucaas.ok, true, JSON.stringify(ucaas.errors));
  assert.equal(ucaas.value.path, "ucaas");
  assert.equal(ucaas.value.humanFollowUp, true);
  assert.equal(ucaas.value.budget, null);
  assert.equal(ucaas.value.opportunity.services.desiredPricePoint, null);
  assert.equal(ucaas.value.opportunity.metadata.status, "draft");
  assert.equal(ucaas.value.opportunity.metadata.environment, "https://loc8.dev.cablefinder.net");
  assert.equal(ucaas.value.opportunity.partner.fullName, "Partner Name");
  assert.equal(Object.hasOwn(ucaas.value.opportunity, "externalOpportunityId"), false);
  assert.match(ucaas.value.opportunity.notes.opportunityNotes, /Current provider: Current phone vendor/);
  assert.match(ucaas.value.opportunity.notes.opportunityNotes, /Contract end: 2026-08-01/);
  assert.equal(validateOpportunityDraft(ucaas.value.opportunity, schema).ok, true);

  const missingRoe = acceptBusinessIntake(voice({ roe: false }), { catalog, env: partnerEnv, now });
  assert.equal(missingRoe.ok, false);
  assert.ok(missingRoe.errors.includes(INTAKE_FIELDS.roe));

  const missingTerm = acceptBusinessIntake(voice({ term: { mtm: false, y1: false, y2: false, y3: false } }), { catalog, env: partnerEnv, now });
  assert.equal(missingTerm.ok, false);
  assert.ok(missingTerm.errors.includes(INTAKE_FIELDS.term));

  const missingSuite = acceptBusinessIntake(voice({ suiteNotNeeded: false, suite: "" }), { catalog, env: partnerEnv, now });
  assert.equal(missingSuite.ok, false);
  assert.ok(missingSuite.errors.includes(INTAKE_FIELDS.suite));

  const sdwan = acceptBusinessIntake(person({
    path: "sdwan",
    speeds: "200 Mbps",
    accessType: "fiber",
    suiteNotNeeded: true,
    term: { y2: true },
    dateNeeded: "2026-12-15",
    bandwidthMbps: "200",
    roe: true,
  }), { catalog, env: partnerEnv, now });
  assert.equal(sdwan.ok, true, JSON.stringify(sdwan.errors));
  assert.equal(sdwan.value.path, "sdwan");
  assert.equal(sdwan.value.humanFollowUp, true);
  assert.ok(sdwan.value.opportunity.services.selected.includes("sdwan"));
  assert.equal(sdwan.value.opportunity.networkConnectivity.bandwidthMbps, 200);
  assert.equal(validateOpportunityDraft(sdwan.value.opportunity, schema).ok, true);

  const noPartner = acceptBusinessIntake(voice(), { catalog, env: {}, now });
  assert.equal(noPartner.ok, true, JSON.stringify(noPartner.errors));
  assert.equal(noPartner.value.opportunity, null);
  assert.equal(noPartner.value.opportunityError, "partner_not_configured");
  const notice = buildIntakeNotice({ ...noPartner.value, id: "tq_nopartner" });
  assert.equal(parseIntakeEmail(notice).json.opportunity, null);
  assert.doesNotMatch(notice.text, /Invented Partner/);
});

test("the Peak notice parses back into the schema object and is not sent to the customer", async () => {
  const env = {
    PEAK_TELECOM_INTAKE_ENABLED: "1",
    RESEND_API_KEY: "re_test_key",
    PEAK_INTAKE_TO: "intake@peaksignal.example",
    // A token in the env must not back up the queue to GitHub.
    GITHUB_TOKEN: "test-token",
    ...partnerEnv,
  };
  const { service, calls, cleanup } = harness(env);
  try {
    const result = await service.quoteRequest(voice(), {});
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(Object.hasOwn(result.body, "opportunity"), false);
    assert.equal(Object.hasOwn(result.body, "notice"), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    const payload = JSON.parse(calls[0].init.body);
    assert.deepEqual(payload.to, ["intake@peaksignal.example"]);
    assert.equal(payload.to.includes("ada@example.com"), false);
    assert.equal(payload.reply_to, "ada@example.com");
    assert.match(payload.subject, /^\[PEAK-TELECOM-INTAKE v1\] tq_[0-9a-f]+ ucaas North Line Co$/);
    const parsed = parseIntakeEmail({ subject: payload.subject, text: payload.text });
    assert.equal(parsed.subject.path, "ucaas");
    assert.equal(parsed.fields.Budget, "(not stated)");
    assert.equal(parsed.fields["Human follow-up"], "yes");
    assert.equal(parsed.json.budget, null);
    assert.equal(parsed.json.humanFollowUp, true);
    assert.equal(validateOpportunityDraft(parsed.json.opportunity, schema).ok, true);
    const attached = JSON.parse(Buffer.from(payload.attachments[0].content, "base64").toString("utf8"));
    assert.deepEqual(attached, parsed.json);
    assert.equal(calls[0].init.headers.Authorization, "Bearer re_test_key");
    assert.doesNotMatch(payload.text, /re_test_key/);

    const again = await service.quoteRequest(voice({ idempotencyKey: "idem-voice-02" }), {});
    assert.equal(again.body.duplicate, true);
    assert.equal(calls.length, 1);
  } finally {
    cleanup();
  }
});

test("the queue file is the dev store, and Replit DB is used when configured", async () => {
  const dir = mkdtempSync(join(tmpdir(), "telecom-queue-"));
  try {
    const file = join(dir, "queue.json");
    const local = createDurableQueue({ file, env: {} });
    assert.equal(local.driver, "file");
    const stored = local.read();
    stored.requests.push({ id: "tq_local" });
    local.writeLocal(stored);
    const reopened = createDurableQueue({ file, env: {} });
    assert.equal(reopened.read().requests[0].id, "tq_local");

    const db = new Map();
    const fetchImpl = async (url, init) => {
      if (init?.method === "POST") {
        const params = new URLSearchParams(init.body);
        for (const [key, value] of params) db.set(key, value);
        return { ok: true, status: 200, text: async () => "" };
      }
      const key = decodeURIComponent(new URL(url).pathname.split("/").pop());
      if (!db.has(key)) return { ok: false, status: 404, text: async () => "" };
      return { ok: true, status: 200, text: async () => db.get(key) };
    };
    const env = {
      PEAK_TELECOM_CHAT: "1",
      REPLIT_DB_URL: "https://kv.replit.test/v0/db",
      RESEND_API_KEY: "re_test_key",
      PEAK_INTAKE_TO: "intake@peaksignal.example",
    };
    const remoteFile = join(dir, "remote.json");
    const first = createTelecomChat({ env, file: remoteFile, catalog, fetch: fetchImpl });
    const saved = await first.submit(internet({ idempotencyKey: "idem-remote-01" }), {});
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    rmSync(remoteFile, { force: true });
    const second = createTelecomChat({
      env,
      file: join(dir, "after-restart.json"),
      catalog,
      fetch: fetchImpl,
    });
    await second.hydrate();
    assert.equal(second.list().body.requests[0].id, saved.body.id);
    assert.equal(second.list().body.requests[0].budget, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ops can attach vendor results, and approval does not email the customer", async () => {
  const env = {
    PEAK_TELECOM_CHAT: "1",
    RESEND_API_KEY: "re_test_key",
    PEAK_INTAKE_TO: "intake@peaksignal.example",
  };
  const { service, calls, cleanup } = harness(env);
  try {
    const saved = await service.submit(internet({ vendor: "Comcast", idempotencyKey: "idem-ops-01" }), {});
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const before = calls.length;
    const attached = service.decide(saved.body.id, { action: "attach-pricing", note: "Vendor A — available\nVendor B — available" });
    assert.equal(attached.status, 200);
    assert.match(attached.body.request.returnedPricing.text, /Vendor A/);
    assert.equal(calls.length, before);
    const approved = service.decide(saved.body.id, { action: "approve", note: "Reviewed" });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.request.status, "approved");
    assert.equal(calls.length, before);
    assert.equal(calls.some((call) => JSON.parse(call.init.body).to?.includes("ada@example.com")), false);
  } finally {
    cleanup();
  }
});

test("business intake stays off with the flags, and no browser pricing worker is in this repo", async () => {
  const { service, calls, cleanup } = harness({});
  try {
    const denied = await service.quoteRequest(internet(), {});
    assert.equal(denied.status, 404);
    assert.equal(calls.length, 0);
  } finally {
    cleanup();
  }

  const files = [
    "telecom/telecom-chat.mjs",
    "telecom/intake/business-quote.mjs",
    "telecom/intake/notify-peak.mjs",
    "telecom/queue/durable-queue.mjs",
    "static-site/telecom-chat.js",
    "telecom/quote.html",
  ];
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(text, /playwright|PEAK_CF_QUOTE_WORKER|CF_SANDBOX_|getLocateSession/i, file);
  }
});
