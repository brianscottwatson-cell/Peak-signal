import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCatalog,
  catalogJson,
  catalogProblems,
  checkRepo,
  extractJsonLd,
  findBanned,
  jsonLdProblems,
  summaryProblems,
} from "./telecom-agent.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("committed catalog matches the generator and stays public", () => {
  const problems = checkRepo(root);
  assert.deepEqual(problems, []);
  const catalog = buildCatalog(root);
  assert.equal(readFileSync(join(root, "static-site/telecom/catalog.json"), "utf8"), catalogJson(catalog));
  assert.equal(catalogProblems(catalog).length, 0);
  assert.ok(catalog.vendors.length >= 42);
  const ring = catalog.vendors.find((vendor) => vendor.name === "RingCentral");
  assert.deepEqual(ring.countries, ["US", "CA"]);
  const rogers = catalog.vendors.find((vendor) => vendor.name === "Rogers");
  assert.equal(rogers.countries, undefined);
  assert.equal(rogers.category, "Network");
  assert.equal(Object.hasOwn(catalog, "note"), false);
  const wow = catalog.vendors.find((vendor) => vendor.name === "WOW! Business");
  assert.equal(wow.summary, "WOW! Business offers business internet, phone, and cable television.");
  const breezeline = catalog.vendors.find((vendor) => vendor.name === "Breezeline");
  assert.equal(breezeline.summary, "Breezeline offers business internet.");
  const cox = catalog.vendors.find((vendor) => vendor.name === "Cox");
  assert.equal(cox.summary, "Cox offers business internet, dedicated connectivity, and voice.");
  for (const vendor of catalog.vendors) {
    assert.deepEqual(summaryProblems(vendor.summary, vendor.name), [], vendor.name);
    assert.ok(vendor.summary.length <= 200, vendor.name);
    assert.doesNotMatch(vendor.summary, /\b(we|our|ours|us)\b/i);
  }
});

test("catalog check fails on a price, promo text, Pax8, loc8, or commission", () => {
  const catalog = buildCatalog(root);
  const samples = [
    ["$", (copy) => { copy.vendors[0].summary = "From $20 a month"; }],
    ["price", (copy) => { copy.vendors[0].summary = "Published list price on request"; }],
    ["promo", (copy) => { copy.vendors[0].summary = "Switcher promo ends this month"; }],
    ["Pax8", (copy) => { copy.vendors[0].name = "Pax8"; }],
    ["loc8", (copy) => { copy.vendors[0].summary = "Sold through loc8"; }],
    ["commission", (copy) => { copy.vendors[0].summary = "A commission applies"; }],
  ];
  for (const [label, edit] of samples) {
    const copy = structuredClone(catalog);
    edit(copy);
    const problems = catalogProblems(copy);
    assert.ok(problems.length > 0, label);
    assert.ok(findBanned(JSON.stringify(copy)).length > 0, label);
  }
});

test("catalog check fails on first person or a summary over 200 characters", () => {
  const catalog = buildCatalog(root);
  const samples = [
    (copy) => { copy.vendors[0].summary = "We offer cloud phone."; },
    (copy) => { copy.vendors[0].summary = "Our network is available."; },
    (copy) => { copy.vendors[0].summary = "Call us about business internet."; },
    (copy) => { copy.vendors[0].summary = `${"Business internet and voice. ".repeat(12)}Done.`; },
  ];
  for (const edit of samples) {
    const copy = structuredClone(catalog);
    edit(copy);
    assert.ok(copy.vendors[0].summary.length > 200 || /\b(we|our|ours|us)\b/i.test(copy.vendors[0].summary));
    assert.ok(catalogProblems(copy).length > 0);
  }
  assert.deepEqual(summaryProblems("Comcast offers business internet and dedicated fiber, voice, and mobile."), []);
});

test("/telecom JSON-LD parses and describes the quote action", () => {
  const html = readFileSync(join(root, "static-site/telecom.html"), "utf8");
  const [block] = extractJsonLd(html);
  assert.equal(jsonLdProblems(html).length, 0);
  assert.equal(block["@context"], "https://schema.org");
  assert.equal(block.provider["@type"], "Organization");
  assert.equal(block.provider.contactPoint["@type"], "ContactPoint");
  assert.equal(block.hasOfferCatalog["@type"], "OfferCatalog");
  assert.equal(block.hasOfferCatalog.itemListElement.length, 4);
  assert.equal(block.potentialAction.target["@type"], "EntryPoint");
  assert.equal(block.potentialAction.target.urlTemplate, "https://getpeaksignal.com/telecom/quote");
  assert.equal(JSON.stringify(block).includes("$"), false);
});
