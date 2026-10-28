#!/usr/bin/env node
/**
 * SEO consistency for indexed static pages and landers.
 *
 * Pages:
 *   static-site/index.html, about.html, ai-deployments.html, contact.html, privacy.html, terms.html
 *   seo/landers/*.html
 *
 * Fails when:
 *   (a) [title] <title> is missing or empty, or is not "<h1> | Peak Signal"
 *       after HTML entities and whitespace are normalized. A different title
 *       is allowed only by a commented entry in scripts/seo.config.json.
 *   (b) [h1-count] the page has zero <h1> elements or more than one.
 *   (c) [meta-description] the meta description is missing or empty.
 *       [canonical] the canonical link is missing or its href is empty.
 *   (d) [social-title] og:title or twitter:title is missing or differs from <title>.
 *   (e) [sitemap] a <loc> in seo/sitemap.xml does not map to a file in the repo.
 *
 * Each failure is one line:
 *   <file>:<line> [rule-id] message
 *
 * Usage:
 *   node scripts/check-seo.mjs [root]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatFailures, inspectHtml, listPublicRoutes, visibleText } from "./public-html.mjs";

const root = process.argv[2]
  ? resolve(process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), "..");

const STATIC_PAGES = ["index.html", "about.html", "ai-deployments.html", "contact.html", "privacy.html", "terms.html"];

function main() {
  const allow = loadTitleAllowlist(root);
  const files = indexedHtmlFiles(root);
  const failures = [];

  for (const file of files) {
    const html = readFileSync(join(root, file), "utf8");
    checkPage(file, html, allow, failures);
  }

  checkSitemap(root, failures);

  if (failures.length) {
    for (const line of formatFailures(failures)) console.error(line);
    process.exitCode = 1;
    return;
  }

  const urls = sitemapLocs(readFileSync(join(root, "seo", "sitemap.xml"), "utf8")).length;
  console.log(`OK: ${files.length} indexed pages, ${urls} sitemap URLs, title allowlist ${allow.size}.`);
}

function checkPage(file, html, allow, failures) {
  const doc = inspectHtml(html);
  const fail = (line, rule, message) => failures.push({ file, line, rule, message });
  const actual = doc.titles[0] ? doc.titles[0].text : "";
  const allowed = allow.has(file) ? visibleText(allow.get(file)) : null;
  const expected = allowed != null ? allowed : doc.h1s.length === 1 ? `${doc.h1s[0].text} | Peak Signal` : null;

  if (!doc.titles.length) {
    fail(headLine(html), "title", "missing <title>");
  } else if (!actual) {
    fail(doc.titles[0].line, "title", "empty <title>");
  } else if (expected != null && actual !== expected) {
    const via = allowed != null ? "allowlist says" : "expected";
    fail(doc.titles[0].line, "title", `title is "${actual}" but ${via} "${expected}"`);
  }

  if (doc.h1s.length !== 1) {
    const line = doc.h1s.length > 1 ? doc.h1s[1].line : headLine(html);
    fail(line, "h1-count", `expected exactly one <h1>, found ${doc.h1s.length}`);
  }

  if (!doc.descriptions.some((meta) => visibleText(meta.text))) {
    const empty = doc.descriptions[0];
    fail(
      empty?.line || headLine(html),
      "meta-description",
      empty ? "empty <meta name=\"description\">" : "missing <meta name=\"description\">",
    );
  }

  if (!doc.canonicals.some((link) => link.href)) {
    const empty = doc.canonicals[0];
    fail(
      empty?.line || headLine(html),
      "canonical",
      empty ? "empty canonical href" : "missing <link rel=\"canonical\">",
    );
  }

  checkSocial(doc, actual, fail);
}

function checkSocial(doc, actual, fail) {
  if (!doc.ogTitles.length) {
    fail(doc.titles[0]?.line || 1, "social-title", "missing og:title");
  }
  for (const og of doc.ogTitles) {
    const text = visibleText(og.text);
    if (text !== actual) {
      fail(og.line, "social-title", `og:title is "${text}" but <title> is "${actual}"`);
    }
  }

  if (!doc.twitterTitles.length) {
    fail(doc.titles[0]?.line || 1, "social-title", "missing twitter:title");
  }
  for (const card of doc.twitterTitles) {
    const text = visibleText(card.text);
    if (text !== actual) {
      fail(card.line, "social-title", `twitter:title is "${text}" but <title> is "${actual}"`);
    }
  }
}

function checkSitemap(root, failures) {
  const rel = "seo/sitemap.xml";
  const path = join(root, rel);
  if (!existsSync(path)) {
    failures.push({ file: rel, line: 1, rule: "sitemap", message: "missing sitemap.xml" });
    return;
  }

  const xml = readFileSync(path, "utf8");
  const routes = listPublicRoutes(root);
  for (const loc of sitemapLocs(xml)) {
    if (mapsToFile(routes, loc.loc)) continue;
    failures.push({
      file: rel,
      line: lineAt(xml, loc.index),
      rule: "sitemap",
      message: `sitemap URL ${loc.loc} does not map to a file`,
    });
  }
}

function indexedHtmlFiles(root) {
  const files = [];
  for (const name of STATIC_PAGES) {
    const rel = `static-site/${name}`;
    if (existsSync(join(root, rel))) files.push(rel);
  }
  const landerDir = join(root, "seo", "landers");
  if (existsSync(landerDir)) {
    for (const name of readdirSync(landerDir).sort()) {
      if (!name.endsWith(".html")) continue;
      files.push(`seo/landers/${name}`);
    }
  }
  return files;
}

function mapsToFile(routes, loc) {
  const path = pathnameOf(loc);
  if (!path) return false;
  const route = routes.find((item) => item.route === path);
  return Boolean(route && route.files.length);
}

function pathnameOf(loc) {
  let url;
  try {
    url = new URL(loc);
  } catch {
    return null;
  }
  let path = url.pathname || "/";
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path || "/";
}

function sitemapLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([^<]*?)\s*<\/loc>/gi;
  let match;
  while ((match = re.exec(xml))) {
    locs.push({
      loc: match[1].trim().replace(/&amp;/gi, "&"),
      index: match.index,
    });
  }
  return locs;
}

function loadTitleAllowlist(root) {
  const rel = "scripts/seo.config.json";
  const path = join(root, rel);
  if (!existsSync(path)) return new Map();
  const text = readFileSync(path, "utf8");
  let json;
  try {
    json = JSON.parse(stripJsonComments(text));
  } catch (err) {
    const error = new Error(`${rel} is not valid JSON (${err.message})`);
    error.rule = "config";
    throw error;
  }
  const list = json.titleAllowlist ?? {};
  if (list == null || typeof list !== "object" || Array.isArray(list)) {
    const error = new Error(`${rel} titleAllowlist must be an object of file paths to titles`);
    error.rule = "config";
    throw error;
  }
  assertCommentedEntries(text, list);
  const allow = new Map();
  for (const [file, title] of Object.entries(list)) {
    if (typeof title !== "string" || !visibleText(title)) {
      const error = new Error(`${rel} titleAllowlist entry "${file}" needs a non-empty title`);
      error.rule = "config";
      throw error;
    }
    allow.set(file.replace(/\\/g, "/"), title);
  }
  return allow;
}

function assertCommentedEntries(text, list) {
  const lines = text.split(/\n/);
  let inAllow = false;
  let sawComment = false;
  const commented = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inAllow) {
      if (/"titleAllowlist"\s*:/.test(trimmed)) inAllow = true;
      continue;
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      sawComment = true;
      continue;
    }
    if (!trimmed || trimmed === "{" || trimmed.startsWith("}")) continue;
    const key = /^"((?:\\.|[^"\\])*)"\s*:/.exec(trimmed);
    if (!key) continue;
    const file = jsonUnescape(key[1]);
    const sameLine = /\/\/|\/\*/.test(trimmed.slice(key[0].length));
    if (sawComment || sameLine) commented.add(file);
    sawComment = false;
  }
  for (const file of Object.keys(list)) {
    if (commented.has(file)) continue;
    const error = new Error(`titleAllowlist entry "${file}" needs a comment`);
    error.rule = "config";
    throw error;
  }
}

function jsonUnescape(value) {
  return JSON.parse(`"${value}"`);
}

function stripJsonComments(text) {
  let out = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function headLine(html) {
  const match = /<head\b/i.exec(html);
  if (!match) return 1;
  return lineAt(html, match.index);
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") line += 1;
  return line;
}

try {
  main();
} catch (err) {
  const rule = err.rule || "config";
  console.error(`scripts/seo.config.json:1 [${rule}] ${err.message}`);
  process.exitCode = 1;
}
