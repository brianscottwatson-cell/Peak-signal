#!/usr/bin/env node
/**
 * Build and check the public telecom catalog and /telecom JSON-LD.
 *
 * Source: data/telecom-vendor-knowledge.json (sanitized). Plans, prices,
 * promos, setup, discovery, sources, sla, and the internal note are not
 * in that file. Vendors that appear on static-site/telecom.html and are
 * missing from the source are added with the page name and category.
 * Their summary is the short third-person line in PAGE_SUMMARY, not the
 * marketing card text. Countries are copied from the source and omitted
 * when unknown. A summary fails if it uses we, our, or us, or is over
 * 200 characters.
 *
 *   node scripts/telecom-agent.mjs           check committed outputs
 *   node scripts/telecom-agent.mjs --write   rewrite static-site/telecom/catalog.json
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KNOWLEDGE = "data/telecom-vendor-knowledge.json";
const PAGE = "static-site/telecom.html";
const CATALOG = "static-site/telecom/catalog.json";
const QUOTE_URL = "https://getpeaksignal.com/contact";

/** Knowledge id -> visible name on /telecom. */
const PAGE_NAME = {
  ringcentral: "RingCentral",
  zoom: "Zoom",
  "comcast-business": "Comcast",
  "att-business": "AT&T",
  "spectrum-business": "Spectrum",
  "cox-business": "Cox",
  "starlink-business": "Starlink",
  "t-mobile-business": "T-Mobile for Business",
};

const VENDOR_KEYS = new Set(["name", "category", "countries", "summary", "quote_request_url"]);
const FORBIDDEN_KEYS = [
  "plans",
  "price",
  "prices",
  "promos",
  "promo",
  "setup",
  "discovery",
  "sources",
  "sla",
  "note",
  "commission",
  "integrations",
  "best_fit",
  "us_footprint",
  "canada",
];

const BANNED = [
  { id: "$", re: /\$/ },
  { id: "price", re: /\bprice\b/i },
  { id: "promo", re: /\bpromos?\b|\bpromotions?\b|\bpromotional\b/i },
  { id: "Pax8", re: /pax8/i },
  { id: "loc8", re: /loc8/i },
  { id: "commission", re: /\bcommission\b/i },
  { id: "discount", re: /\bdiscounts?\b/i },
  { id: "savings", re: /\bsavings\b/i },
  { id: "affordable", re: /\baffordable\b/i },
];

const OFFER_CATEGORIES = ["UCaaS", "internet", "wireless", "satellite"];
const SUMMARY_MAX = 200;
const FIRST_PERSON = /\b(we|our|ours|us)\b/i;

/**
 * One neutral sentence for vendors that are on /telecom and not in the
 * knowledge file. The HTML card text is marketing copy and is not published.
 */
const PAGE_SUMMARY = {
  "8x8": "8x8 offers cloud voice, video, and contact center.",
  Dialpad: "Dialpad offers cloud calling, messaging, meetings, and contact center.",
  Five9: "Five9 offers cloud contact center software.",
  GoTo: "GoTo offers video meetings, screen sharing, and webinars.",
  Net2Phone: "Net2Phone offers cloud voice, video, chat, and email.",
  Nextiva: "Nextiva offers cloud phone and customer communications.",
  Ooma: "Ooma offers cloud phone service for businesses.",
  SpectrumVoIP: "SpectrumVoIP offers cloud phone and business internet.",
  Talkdesk: "Talkdesk offers a cloud contact center.",
  TPx: "TPx offers managed network, security, and cloud communications services.",
  "Vonage Business": "Vonage offers cloud voice, messaging, video, and contact center.",
  "ACC Business": "ACC Business offers networking, data, cloud, and voice services.",
  "Bigleaf Networks": "Bigleaf Networks offers managed business internet connectivity.",
  Breezeline: "Breezeline offers business internet.",
  Brightspeed: "Brightspeed offers business internet.",
  "Dobson Fiber": "Dobson Fiber offers fiber internet and cloud phone.",
  "EPIC iO": "EPIC iO offers managed wireless, private cellular, and satellite connectivity.",
  FiberLight: "FiberLight offers fiber networking services.",
  For2Fi: "For2Fi offers managed wireless wide-area connectivity.",
  "Lightpath Fiber": "Lightpath Fiber offers business fiber connectivity.",
  Lumen: "Lumen offers enterprise network and telecommunications services.",
  Optimum: "Optimum offers fiber internet, television, and mobile service.",
  "Rise Internet": "Rise Internet offers business internet.",
  Rogers: "Rogers offers mobile, internet, television, and phone service.",
  Verizon: "Verizon offers wireless, internet, television, and phone service.",
  Viasat: "Viasat offers satellite internet.",
  "WOW! Business": "WOW! Business offers business internet, phone, and cable television.",
  Zayo: "Zayo offers fiber and bandwidth infrastructure.",
  "Ziply Fiber": "Ziply Fiber offers fiber internet.",
  VeloCloud: "VeloCloud offers SD-WAN for business networks.",
  AireSpring: "AireSpring offers managed network and unified communications services.",
  MetTel: "MetTel offers managed telecom and network services.",
  Nitel: "Nitel offers managed network services.",
  Spectrotel: "Spectrotel offers phone, internet, and managed network services.",
};

export function findBanned(text) {
  const hits = [];
  for (const rule of BANNED) {
    if (rule.re.test(text)) hits.push(rule.id);
  }
  return hits;
}

export function summaryProblems(summary, label = "summary") {
  const problems = [];
  if (typeof summary !== "string" || !summary.trim()) {
    problems.push(`${label} is missing`);
    return problems;
  }
  if (summary.length > SUMMARY_MAX) problems.push(`${label} is ${summary.length} characters`);
  if (FIRST_PERSON.test(summary)) problems.push(`${label} uses first person`);
  return problems;
}

export function decodeHtml(text) {
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function vendorsFromHtml(html) {
  const vendors = [];
  const re = /<details\b[^>]*\bdata-categories="([^"]*)"[^>]*>([\s\S]*?)<\/details>/gi;
  let match;
  while ((match = re.exec(html))) {
    const categories = match[1].split("|").map((item) => item.trim()).filter(Boolean);
    const title = /<span class="card-title">([\s\S]*?)<\/span>/i.exec(match[2]);
    const desc = /<p class="card-desc">([\s\S]*?)<\/p>/i.exec(match[2]);
    if (!title) throw new Error("vendor card is missing a title");
    vendors.push({
      name: decodeHtml(title[1]).replace(/\s+/g, " ").trim(),
      categories,
      summary: desc ? decodeHtml(desc[1]).replace(/\s+/g, " ").trim() : "",
    });
  }
  return vendors;
}

function publicVendor({ name, category, countries, summary }) {
  const record = { name, category };
  if (countries) record.countries = countries;
  if (summary) record.summary = summary;
  record.quote_request_url = QUOTE_URL;
  return record;
}

function assertCountries(countries, label) {
  if (!Array.isArray(countries) || countries.length === 0) {
    throw new Error(`${label} needs a countries array of US and/or CA`);
  }
  for (const country of countries) {
    if (country !== "US" && country !== "CA") throw new Error(`${label} has unknown country ${country}`);
  }
}

export function loadKnowledge(dir = root) {
  const json = JSON.parse(readFileSync(join(dir, KNOWLEDGE), "utf8"));
  if (!Array.isArray(json.vendors)) throw new Error(`${KNOWLEDGE} has no vendors array`);
  const forbidden = ["plans", "prices", "promos", "setup", "discovery", "sources", "sla", "note"];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(json, key)) {
      throw new Error(`${KNOWLEDGE} still has top-level ${key}`);
    }
  }
  for (const vendor of json.vendors) {
    for (const key of forbidden) {
      if (Object.prototype.hasOwnProperty.call(vendor, key)) {
        throw new Error(`${KNOWLEDGE} vendor ${vendor.id || vendor.name} still has ${key}`);
      }
    }
    const hits = findBanned(JSON.stringify(vendor));
    if (hits.length) throw new Error(`${KNOWLEDGE} vendor ${vendor.id || vendor.name} contains ${hits.join(", ")}`);
    const summaryHits = summaryProblems(vendor.summary, `${vendor.id || vendor.name} summary`);
    if (summaryHits.length) throw new Error(`${KNOWLEDGE} ${summaryHits.join("; ")}`);
    assertCountries(vendor.countries, vendor.id || vendor.name);
    if (!PAGE_NAME[vendor.id]) throw new Error(`${KNOWLEDGE} vendor ${vendor.id} has no /telecom name`);
  }
  return json;
}

export function buildCatalog(dir = root) {
  const knowledge = loadKnowledge(dir);
  const page = vendorsFromHtml(readFileSync(join(dir, PAGE), "utf8"));
  const byPageName = new Map(
    knowledge.vendors.map((vendor) => [PAGE_NAME[vendor.id].toLowerCase(), vendor]),
  );
  const used = new Set();
  const vendors = [];

  for (const card of page) {
    const known = byPageName.get(card.name.toLowerCase());
    if (known) {
      used.add(known.id);
      vendors.push(publicVendor({
        name: card.name,
        category: known.category,
        countries: [...known.countries],
        summary: known.summary,
      }));
      continue;
    }
    const summary = PAGE_SUMMARY[card.name];
    if (!summary) throw new Error(`missing public summary for ${card.name}`);
    vendors.push(publicVendor({
      name: card.name,
      category: card.categories.join(", "),
      summary,
    }));
  }

  for (const vendor of knowledge.vendors) {
    if (used.has(vendor.id)) continue;
    vendors.push(publicVendor({
      name: PAGE_NAME[vendor.id],
      category: vendor.category,
      countries: [...vendor.countries],
      summary: vendor.summary,
    }));
  }

  return {
    name: "Peak Signal telecom catalog",
    url: "https://getpeaksignal.com/telecom",
    area_served: ["US", "CA"],
    availability: "Availability is checked per service address.",
    quote_request_url: QUOTE_URL,
    vendors,
  };
}

export function catalogJson(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

function walkKeys(value, path, problems) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkKeys(item, `${path}[${index}]`, problems));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.includes(key.toLowerCase())) problems.push(`${path}.${key} is not a public field`);
    walkKeys(value[key], `${path}.${key}`, problems);
  }
}

export function catalogProblems(catalog) {
  const problems = [];
  const hits = findBanned(JSON.stringify(catalog));
  if (hits.length) problems.push(`catalog contains ${hits.join(", ")}`);
  walkKeys(catalog, "catalog", problems);
  if (catalog.quote_request_url !== QUOTE_URL) problems.push("catalog quote_request_url is not the contact page");
  if (!Array.isArray(catalog.vendors) || catalog.vendors.length === 0) problems.push("catalog has no vendors");
  const names = new Set();
  for (const vendor of catalog.vendors ?? []) {
    const extra = Object.keys(vendor).filter((key) => !VENDOR_KEYS.has(key));
    if (extra.length) problems.push(`${vendor.name || "vendor"} has extra fields ${extra.join(", ")}`);
    if (!vendor.name) problems.push("vendor is missing a name");
    if (!vendor.category) problems.push(`${vendor.name || "vendor"} is missing a category`);
    if (vendor.quote_request_url !== QUOTE_URL) problems.push(`${vendor.name} quote_request_url is not the contact page`);
    if (names.has(vendor.name)) problems.push(`duplicate vendor ${vendor.name}`);
    names.add(vendor.name);
    if (vendor.countries) {
      if (!Array.isArray(vendor.countries) || vendor.countries.some((country) => country !== "US" && country !== "CA")) {
        problems.push(`${vendor.name} countries must be US and/or CA`);
      }
    }
    if (vendor.summary && findBanned(vendor.summary).length) {
      problems.push(`${vendor.name} summary contains ${findBanned(vendor.summary).join(", ")}`);
    }
    for (const problem of summaryProblems(vendor.summary, `${vendor.name || "vendor"} summary`)) {
      problems.push(problem);
    }
  }
  return problems;
}

export function extractJsonLd(html) {
  const blocks = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    blocks.push(JSON.parse(match[1]));
  }
  return blocks;
}

function nodesOf(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) nodesOf(item, found);
    return found;
  }
  if (!value || typeof value !== "object") return found;
  found.push(value);
  for (const child of Object.values(value)) nodesOf(child, found);
  return found;
}

function typeNames(node) {
  const value = node["@type"];
  return Array.isArray(value) ? value : value ? [value] : [];
}

function hasCountry(node, code) {
  const areas = [].concat(node.areaServed ?? []);
  return areas.some((area) => {
    if (typeof area === "string") return area === code || area.includes(code);
    if (!area || typeof area !== "object") return false;
    return [area.name, area.identifier, area.alternateName].includes(code);
  });
}

export function jsonLdProblems(html) {
  const problems = [];
  let blocks;
  try {
    blocks = extractJsonLd(html);
  } catch (err) {
    return [`JSON-LD did not parse: ${err.message}`];
  }
  if (blocks.length !== 1) problems.push(`expected one JSON-LD block, found ${blocks.length}`);
  const nodes = blocks.flatMap((block) => nodesOf(block));
  const ofType = (type) => nodes.filter((node) => typeNames(node).includes(type));

  const orgs = ofType("Organization");
  const org = orgs[0];
  if (!org) problems.push("missing Organization");
  else {
    if (org.name !== "Peak Signal") problems.push("Organization name is not Peak Signal");
    if (org.url !== "https://getpeaksignal.com/") problems.push("Organization url is missing");
    if (org.logo !== "https://getpeaksignal.com/images/peak-signal-logo.svg") problems.push("Organization logo URL is missing");
    if (org.telephone !== "+1-970-660-5088") problems.push("Organization telephone is missing");
    if (!hasCountry(org, "US") || !hasCountry(org, "CA")) problems.push("Organization areaServed must include US and CA");
  }

  const point = ofType("ContactPoint")[0];
  if (!point) problems.push("missing ContactPoint");
  else {
    if (point.contactType !== "sales") problems.push("ContactPoint contactType is not sales");
    if (point.telephone !== "+1-970-660-5088") problems.push("ContactPoint telephone is missing");
    if (!hasCountry(point, "US") || !hasCountry(point, "CA")) problems.push("ContactPoint areaServed must include US and CA");
    const language = point.availableLanguage;
    const langText = typeof language === "string" ? language : JSON.stringify(language ?? "");
    if (!/\ben\b|English/i.test(langText)) problems.push("ContactPoint availableLanguage is not en");
    const hours = point.hoursAvailable ?? {};
    const hourText = JSON.stringify(hours);
    const days = [].concat(hours.dayOfWeek ?? []);
    const allWeek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].every((day) =>
      days.some((item) => String(item).endsWith(day)),
    );
    if (!(hourText.includes("24/7") || (hours.opens === "00:00" && hours.closes === "23:59" && allWeek))) {
      problems.push("ContactPoint hours are not 24/7");
    }
  }

  const service = ofType("Service").find((node) => node["@type"] === "Service" && node.url === "https://getpeaksignal.com/telecom")
    || ofType("Service")[0];
  if (!service) problems.push("missing Service");
  else {
    if (!hasCountry(service, "US") || !hasCountry(service, "CA")) problems.push("Service areaServed must include US and CA");
    const catalog = service.hasOfferCatalog;
    if (!catalog || !typeNames(catalog).includes("OfferCatalog")) problems.push("Service is missing an OfferCatalog");
    else {
      const items = catalog.itemListElement ?? [];
      const names = items.map((item) => item?.itemOffered?.name || item?.name).filter(Boolean);
      for (const category of OFFER_CATEGORIES) {
        if (!names.includes(category)) problems.push(`OfferCatalog is missing ${category}`);
      }
      if (names.length !== OFFER_CATEGORIES.length) problems.push(`OfferCatalog has ${names.length} entries, expected ${OFFER_CATEGORIES.length}`);
    }
    const action = service.potentialAction;
    const actions = [].concat(action ?? []);
    const communicate = actions.find((item) => typeNames(item).includes("CommunicateAction"));
    if (!communicate) problems.push("missing CommunicateAction");
    else {
      const target = communicate.target;
      const targets = [].concat(target ?? []);
      const entry = targets.find((item) => item && typeNames(item).includes("EntryPoint"));
      const url = entry?.urlTemplate || entry?.url || (typeof target === "string" ? target : "");
      if (url !== "https://getpeaksignal.com/telecom/quote") problems.push("CommunicateAction EntryPoint is not the quote URL");
    }
  }

  const raw = JSON.stringify(blocks);
  if (raw.includes("$") || /"price"\s*:/.test(raw)) problems.push("JSON-LD contains a price");
  const banned = findBanned(raw).filter((hit) => hit !== "price");
  if (banned.length) problems.push(`JSON-LD contains ${banned.join(", ")}`);
  return problems;
}

const LLMS_REQUIRED = [
  "technology agent and AI studio",
  "Evergreen, Colorado",
  "UCaaS",
  "internet",
  "fiber",
  "wireless",
  "satellite",
  "United States",
  "Canada",
  "per service address",
  "https://getpeaksignal.com/telecom/quote",
  "https://getpeaksignal.com/api/telecom/quote-request",
  "may not be live yet",
  "https://getpeaksignal.com/contact",
  "Peak Signal",
  "appointment",
  "(970) 660-5088",
  "https://getpeaksignal.com/telecom/catalog.json",
  "https://getpeaksignal.com/openapi.json",
];

export function llmsProblems(text, { full = false } = {}) {
  const problems = [];
  for (const phrase of LLMS_REQUIRED) {
    if (!text.includes(phrase)) problems.push(`missing ${JSON.stringify(phrase)}`);
  }
  if (full) {
    for (const phrase of [
      "AI-first website",
      "voice agent",
      "drafts replies",
      "AI Harness",
      "https://getpeaksignal.com/",
    ]) {
      if (!text.includes(phrase)) problems.push(`full index missing ${JSON.stringify(phrase)}`);
    }
  }
  const hits = findBanned(text);
  if (hits.length) problems.push(`contains ${hits.join(", ")}`);
  if (/partnership|distribution agreement|\bWatson\b|Colorado Hot Tub/i.test(text)) {
    problems.push("contains a client name, a last name, or a partnership claim");
  }
  return problems;
}

export function checkRepo(dir = root) {
  const problems = [];
  const catalog = buildCatalog(dir);
  const built = catalogJson(catalog);
  const catalogPath = join(dir, CATALOG);
  if (!existsSync(catalogPath)) problems.push(`${CATALOG} is missing`);
  else if (readFileSync(catalogPath, "utf8") !== built) problems.push(`${CATALOG} is out of date; run node scripts/telecom-agent.mjs --write`);
  problems.push(...catalogProblems(catalog).map((item) => `catalog: ${item}`));

  const html = readFileSync(join(dir, PAGE), "utf8");
  if (!html.includes('rel="alternate"') || !html.includes('type="application/json"') || !html.includes('href="/telecom/catalog.json"')) {
    problems.push("/telecom is missing the catalog alternate link");
  }
  problems.push(...jsonLdProblems(html).map((item) => `jsonld: ${item}`));

  const llms = readFileSync(join(dir, "static-site/llms.txt"), "utf8");
  const full = readFileSync(join(dir, "static-site/llms-full.txt"), "utf8");
  problems.push(...llmsProblems(llms).map((item) => `llms.txt: ${item}`));
  problems.push(...llmsProblems(full, { full: true }).map((item) => `llms-full.txt: ${item}`));
  if (!existsSync(join(dir, "static-site/images/peak-signal-logo.svg"))) {
    problems.push("logo svg is missing");
  }
  return problems;
}

function main() {
  if (process.argv.includes("--write")) {
    const catalog = buildCatalog(root);
    const problems = catalogProblems(catalog);
    if (problems.length) {
      for (const problem of problems) console.error(problem);
      process.exitCode = 1;
      return;
    }
    const dest = join(root, CATALOG);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, catalogJson(catalog));
    console.log(`Wrote ${CATALOG} (${catalog.vendors.length} vendors).`);
    return;
  }

  const problems = checkRepo(root);
  if (problems.length) {
    for (const problem of problems) console.error(problem);
    process.exitCode = 1;
    return;
  }
  const catalog = JSON.parse(readFileSync(join(root, CATALOG), "utf8"));
  console.log(`OK: catalog ${catalog.vendors.length} vendors, /telecom JSON-LD parses, llms.txt and llms-full.txt match the brief.`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
