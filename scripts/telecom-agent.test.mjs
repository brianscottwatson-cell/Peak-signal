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
  assert.match(wow.summary, /reliable business internet/);
  assert.doesNotMatch(wow.summary, /affordable/);
  const breezeline = catalog.vendors.find((vendor) => vendor.name === "Breezeline");
  assert.match(breezeline.summary, /high-speed internet/);
  assert.doesNotMatch(breezeline.summary, /savings/);
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
