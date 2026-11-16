#!/usr/bin/env node
/**
 * Content guardrail for public HTML pages.
 *
 * Fails if a public page contains a banned term or retired product name,
 * a price that is not on the allowlist, more or fewer than one <h1>,
 * an empty title, or a missing meta description.
 * Also fails on a case-insensitive "Brian" in public HTML, llms files,
 * the catalog JSON, and served JSON-LD. The one exact from-line string in
 * brianAllowlist is allowed only in privacy.html and terms.html.
 * llms files, catalog.json, the sitemap, and static-site HTML also fail
 * when they name /openapi.json, /telecom/quote, or /api/telecom/quote-request
 * before that exact route is served, or when they contain "may not be live yet"
 * or "separate change".
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
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
 * Vendor-name and writer-note hits use a generic message.
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
    { term: "Pax8", message: "banned vendor name" },
    { term: "No invented", message: "writer-note phrase" },
    { term: "No fake", message: "writer-note phrase" },
    { term: "Realistic flows only", message: "writer-note phrase" },
    { term: "invented package prices", message: "writer-note phrase" },
    { term: "fake case-study", message: "writer-note phrase" },
    { term: "ai education", message: "writer-note phrase" },
    { term: "never answer the phone", message: "writer-note phrase" },
  ],
  retiredOffers: [
    { term: "Capture", message: "'Capture' is a retired product name" },
    { term: "Answer", message: "'Answer' is a retired product name" },
    { term: "Keep", message: "'Keep' is a retired product name" },
  ],
};

const PRICE = /\$\d[\d,]*(?:\.\d+)?/g;
const BRIAN = /\bBrian\b/gi;
const FROM_LINE = "Brian at Peak Signal";
const FROM_LINE_FILES = new Set([
  "static-site/privacy.html",
  "static-site/terms.html",
]);

const ABSENT_ROUTES = [
  { path: "/openapi.json", re: /\/openapi\.json(?![\w])/gi },
  { path: "/telecom/quote", re: /\/telecom\/quote(?![\w/-])/gi },
  { path: "/api/telecom/quote-request", re: /\/api\/telecom\/quote-request(?![\w/-])/gi },
];

const WRITER_NOTES = [
  { phrase: "may not be live yet", re: /may not be live yet/gi },
  { phrase: "separate change", re: /separate change/gi },
];

function main() {
  const allow = new Set(loadPriceAllowlist(root));
  const brianAllow = loadBrianAllowlist(root);
  const files = contentFiles(listPublicRoutes(root));
  const failures = [];

  for (const file of files) {
    const html = readFileSync(join(root, file), "utf8");
    checkFile(file, html, allow, failures);
    checkBrian(file, html, brianAllow, failures);
  }

  for (const file of extraPublicFiles(root)) {
    checkBrian(file, readFileSync(join(root, file), "utf8"), brianAllow, failures);
  }

  const served = servedRoutes(root);
  for (const file of agentPublicFiles(root)) {
    checkAbsentCopy(file, readFileSync(join(root, file), "utf8"), served, failures);
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

function agentPublicFiles(dir) {
  const files = [];
  function add(rel) {
    if (!files.includes(rel) && existsSync(join(dir, rel))) files.push(rel);
  }

  const staticDir = join(dir, "static-site");
  if (existsSync(staticDir)) {
    for (const name of readdirSync(staticDir).sort()) {
      if (name.endsWith(".html") || /^llms/i.test(name)) add(`static-site/${name}`);
    }
  }
  add("static-site/telecom/catalog.json");
  add("static-site/sitemap.xml");
  add("seo/sitemap.xml");

  const seoDir = join(dir, "seo");
  if (existsSync(seoDir)) {
    for (const name of readdirSync(seoDir).sort()) {
      if (/^llms/i.test(name)) add(`seo/${name}`);
    }
  }
  return files;
}

function servedRoutes(dir) {
  const served = new Set();
  for (const route of ABSENT_ROUTES) {
    if (routeIsServed(dir, route.path)) served.add(route.path);
  }
  return served;
}

function routeIsServed(dir, routePath) {
  return vercelServes(dir, routePath) || routerServes(dir, routePath);
}

function vercelServes(dir, routePath) {
  const path = join(dir, "vercel.json");
  if (!existsSync(path)) return false;
  let json;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return false;
  }
  const rules = [...(json.rewrites ?? []), ...(json.redirects ?? [])];
  return rules.some((rule) => ruleServes(dir, rule, routePath));
}

function ruleServes(dir, rule, routePath) {
  if (!rule || rule.source !== routePath) return false;
  const dest = rule.destination;
  if (typeof dest !== "string" || dest.length === 0) return false;
  if (/[()*:]/.test(dest)) return false;
  if (rule.statusCode) return true;
  if (/^https?:\/\//i.test(dest)) return true;
  return existsSync(join(dir, dest.replace(/^\//, "")));
}

function routerServes(dir, routePath) {
  const routers = [
    "static-site/static-site-router.ts",
    "seo/seo-landers-router.ts",
  ];
  const needles = [`.get("${routePath}"`, `.get('${routePath}'`];
  for (const rel of routers) {
    const abs = join(dir, rel);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    if (needles.some((needle) => text.includes(needle))) return true;
  }
  return false;
}

function checkAbsentCopy(file, text, served, failures) {
  for (const route of ABSENT_ROUTES) {
    if (served.has(route.path)) continue;
    for (const hit of findAll(text, route.re)) {
      failures.push({
        file,
        line: lineAt(text, hit.index),
        rule: "absent-url",
        message: `'${route.path}' is not a live route`,
      });
    }
  }
  for (const note of WRITER_NOTES) {
    for (const hit of findAll(text, note.re)) {
      failures.push({
        file,
        line: lineAt(text, hit.index),
        rule: "writer-note",
        message: `'${note.phrase}' is not public copy`,
      });
    }
  }
}

function extraPublicFiles(dir) {
  const extras = [
    "static-site/llms.txt",
    "static-site/llms-full.txt",
    "static-site/telecom/catalog.json",
    "static-site/robots.txt",
    "seo/robots.txt",
    "seo/sitemap.xml",
  ];
  return extras.filter((file) => existsSync(join(dir, file)));
}

function loadBrianAllowlist(dir) {
  const rel = "scripts/guardrails.config.json";
  const path = join(dir, rel);
  if (!existsSync(path)) return [FROM_LINE];
  let json;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    const error = new Error(`${rel} is not valid JSON (${err.message})`);
    error.rule = "config";
    throw error;
  }
  if (!Object.hasOwn(json, "brianAllowlist")) return [FROM_LINE];
  const list = json.brianAllowlist;
  if (!Array.isArray(list) || list.some((item) => typeof item !== "string") || list.length !== 1) {
    const error = new Error(`${rel} brianAllowlist must be one exact string`);
    error.rule = "config";
    throw error;
  }
  return list;
}

function checkBrian(file, text, allow, failures) {
  const copy = new RegExp(BRIAN.source, "gi");
  let match;
  while ((match = copy.exec(text))) {
    if (isExactFromLine(file, text, match.index, allow)) continue;
    failures.push({
      file,
      line: lineAt(text, match.index),
      rule: "brian",
      message: "personal name is not public copy",
    });
    if (match[0].length === 0) copy.lastIndex += 1;
  }
}

function isExactFromLine(file, text, index, allow) {
  if (!FROM_LINE_FILES.has(file)) return false;
  return allow.some((phrase) => {
    if (!text.startsWith(phrase, index)) return false;
    const next = text[index + phrase.length];
    return next == null || !/[A-Za-z0-9\s]/.test(next);
  });
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === "\n") line += 1;
  return line;
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
