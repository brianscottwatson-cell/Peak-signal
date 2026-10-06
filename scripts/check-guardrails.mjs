#!/usr/bin/env node
/**
 * Content guardrail for public HTML pages.
 *
 * Fails if a public page contains a banned term or retired product name,
 * a price that is not on the allowlist, more or fewer than one <h1>,
 * an empty title, or a missing meta description.
 *
 * Each failure is one line:
 *   <file>:<line> [rule-id] message
 *
 * Usage:
 *   node scripts/check-guardrails.mjs [root]
 *
 * Prices: any "$" followed by a digit fails unless that exact token
 * ($52, $1,200, $49.00) is listed in scripts/guardrails.config.json
 * under priceAllowlist. An empty list allows nothing. A missing config
 * file is treated as an empty list.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contentFiles, formatFailures, inspectHtml, listPublicRoutes, loadPriceAllowlist } from "./public-html.mjs";

const root = process.argv[2]
  ? resolve(process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Edit this list. Both groups use rule id banned-term.
 *
 * bannedTerms: case-insensitive whole phrases, in visible text and in head
 * metadata (title, meta, Open Graph, Twitter) and JSON-LD.
 * retiredOffers: capitalized standalone words, also matched in form option
 * labels and values. Lowercase verbs ("answers", "keeps") do not match.
 * Inside FAQPage JSON-LD, schema.org "@type": "Answer" and the
 * acceptedAnswer key do not match.
 *
 * Inline <script> bodies are ignored for these checks, except JSON-LD.
 * The Cloudflare Web Analytics beacon is ignored.
 */
const CONTENT_RULES = {
  bannedTerms: [
    { term: "Skimmer", message: "'Skimmer' is a banned term" },
    { term: "Watson", message: "'Watson' is a banned term" },
    { term: "AI receptionist", message: "'AI receptionist' is a banned term" },
    { term: "Signal Site", message: "'Signal Site' is a retired product name" },
    { term: "Voice Signal", message: "'Voice Signal' is a retired product name" },
    { term: "Loop Signal", message: "'Loop Signal' is a retired product name" },
  ],
  retiredOffers: [
    { term: "Capture", message: "'Capture' is a retired product name" },
    { term: "Answer", message: "'Answer' is a retired product name" },
    { term: "Keep", message: "'Keep' is a retired product name" },
  ],
};

const PRICE = /\$\d[\d,]*(?:\.\d+)?/g;

function main() {
  const allow = new Set(loadPriceAllowlist(root));
  const files = contentFiles(listPublicRoutes(root));
  const failures = [];

  for (const file of files) {
    const html = readFileSync(join(root, file), "utf8");
    checkFile(file, html, allow, failures);
  }

  if (failures.length) {
    for (const line of formatFailures(failures)) console.error(line);
    process.exitCode = 1;
    return;
  }

  console.log(`OK: ${files.length} public HTML files, price allowlist ${allow.size}.`);
}

function checkFile(file, html, allow, failures) {
  const doc = inspectHtml(html);
  const fail = (line, rule, message) => failures.push({ file, line, rule, message });

  if (!doc.titles.some((title) => title.text.trim())) {
    const empty = doc.titles[0];
    fail(empty?.line || headLine(html), "title", empty ? "empty <title>" : "missing <title>");
  }

  if (!doc.descriptions.some((meta) => meta.text.trim())) {
    const empty = doc.descriptions[0];
    fail(
      empty?.line || headLine(html),
      "meta-description",
      empty ? "empty <meta name=\"description\">" : "missing <meta name=\"description\">",
    );
  }

  if (doc.h1s.length !== 1) {
    const line = doc.h1s.length > 1 ? doc.h1s[1].line : headLine(html);
    fail(line, "h1-count", `expected exactly one <h1>, found ${doc.h1s.length}`);
  }

  for (const region of doc.regions) {
    const haystack = region.kind === "jsonld" ? maskFaqSchema(region.text) : region.text;
    for (const rule of CONTENT_RULES.bannedTerms) {
      for (const hit of findAll(region.text, phrasePattern(rule.term, true))) {
        fail(doc.lineOf(region.index + hit.index), "banned-term", rule.message);
      }
    }
    for (const rule of CONTENT_RULES.retiredOffers) {
      for (const hit of findAll(haystack, phrasePattern(rule.term, false))) {
        fail(doc.lineOf(region.index + hit.index), "banned-term", rule.message);
      }
    }
    for (const hit of findAll(region.text, PRICE)) {
      if (allow.has(hit.match)) continue;
      fail(doc.lineOf(region.index + hit.index), "price", `'${hit.match}' is not on the price allowlist`);
    }
  }
}

function maskFaqSchema(json) {
  if (!/"@type"\s*:\s*"FAQPage"/.test(json)) return json;
  return json
    .replace(/"@type"\s*:\s*"Answer"/g, (match) => " ".repeat(match.length))
    .replace(/"acceptedAnswer"/g, (match) => " ".repeat(match.length));
}

function phrasePattern(term, caseInsensitive) {
  const body = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${body}\\b`, caseInsensitive ? "gi" : "g");
}

function findAll(text, re) {
  const copy = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  const hits = [];
  let match;
  while ((match = copy.exec(text))) {
    hits.push({ index: match.index, match: match[0] });
    if (match[0].length === 0) copy.lastIndex += 1;
  }
  return hits;
}

function headLine(html) {
  const match = /<head\b/i.exec(html);
  if (!match) return 1;
  let line = 1;
  for (let i = 0; i < match.index; i++) if (html[i] === "\n") line += 1;
  return line;
}

try {
  main();
} catch (err) {
  const rule = err.rule || "config";
  console.error(`scripts/guardrails.config.json:1 [${rule}] ${err.message}`);
  process.exitCode = 1;
}
