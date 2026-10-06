#!/usr/bin/env node
/**
 * Check getpeaksignal.com public pages the way the Replit routers serve them.
 *
 * Routes match static-site/static-site-router.ts and seo/seo-landers-router.ts.
 * The script serves those files over HTTP, then:
 *   (a) fails if removed writer-note phrases appear in served HTML
 *       (including JSON-LD)
 *   (b) fails if an internal href 404s, or a #fragment has no matching id
 *   (c) fails if vercel.json does not serve those same files, proxy /api to
 *       Replit, or 301 www to the apex
 *   (d) fails if .vercelignore drops a public file or uploads a private one
 *   (e) fails unless each public HTML page has the Cloudflare beacon once
 *
 * Usage: node scripts/check-public-links.mjs
 */
import http from "node:http";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://getpeaksignal.com";

/** pathname -> repo file. Clean routes the Express routers serve as 200. */
const routes = {
  "/": "static-site/index.html",
  "/contact": "static-site/contact.html",
  "/privacy": "static-site/privacy.html",
  "/terms": "static-site/terms.html",
  "/about": "static-site/about.html",
  "/robots.txt": "static-site/robots.txt",
  "/google166e848c42566a74.html": "static-site/google166e848c42566a74.html",
  "/images/cht-before-after.webp": "static-site/images/cht-before-after.webp",
  "/sitemap.xml": "seo/sitemap.xml",
  "/ai-websites-evergreen-co": "seo/landers/ai-websites-evergreen-co.html",
  "/ai-automation-evergreen-colorado": "seo/landers/ai-automation-evergreen-colorado.html",
  "/ai-agents-small-business-evergreen": "seo/landers/ai-agents-small-business-evergreen.html",
};

/** Duplicate .html URLs. 301 to the clean path. Query strings stay on the target. */
const htmlRedirects = {
  "/index.html": "/",
  "/about.html": "/about",
  "/contact.html": "/contact",
  "/privacy.html": "/privacy",
  "/terms.html": "/terms",
  "/ai-websites-evergreen-co.html": "/ai-websites-evergreen-co",
  "/ai-automation-evergreen-colorado.html": "/ai-automation-evergreen-colorado",
  "/ai-agents-small-business-evergreen.html": "/ai-agents-small-business-evergreen",
};

const publicPages = [
  "/",
  "/contact",
  "/privacy",
  "/terms",
  "/about",
  "/ai-websites-evergreen-co",
  "/ai-automation-evergreen-colorado",
  "/ai-agents-small-business-evergreen",
];

/** Phrases removed from live copy. Matched case-insensitively. */
const banned = [
  "no invented package prices",
  "no invented",
  "no fake",
  "realistic flows only",
  "ai education",
  "competitors who never answer the phone",
  "#signal-site",
  "#voice-signal",
  "#loop-signal",
];

const beacon = "6a067e22aec645c6b9e360ce149ae7ad";
const staleRootCopies = ["index.html", "contact.html", "privacy.html", "terms.html"];

const failures = [];

function fail(message) {
  failures.push(message);
}

function contentType(file) {
  if (file.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (file.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (file.endsWith(".webp")) return "image/webp";
  return "text/html; charset=utf-8";
}

function extractAttrs(html, tagName, attr) {
  const values = [];
  const tagRe = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  const attrRe = new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  let tag;
  while ((tag = tagRe.exec(html))) {
    const match = attrRe.exec(tag[0]);
    if (match) values.push(match[1] ?? match[2]);
  }
  return values;
}

function extractIds(html) {
  return new Set(extractAttrs(html, "[a-zA-Z0-9:-]+", "id"));
}

function sitemapPaths(xml) {
  const paths = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match;
  while ((match = re.exec(xml))) {
    const loc = match[1].trim();
    let url;
    try {
      url = new URL(loc);
    } catch {
      fail(`sitemap loc is not a URL: ${loc}`);
      continue;
    }
    if (url.hostname !== "getpeaksignal.com") {
      fail(`sitemap loc is not on getpeaksignal.com: ${loc}`);
      continue;
    }
    paths.push(url.pathname || "/");
  }
  return paths;
}

function classifyHref(href, pagePath) {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:") || trimmed.startsWith("javascript:")) {
    return { kind: "skip" };
  }
  let url;
  try {
    url = new URL(trimmed, `${SITE}${pagePath}`);
  } catch {
    return { kind: "bad", href: trimmed };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { kind: "skip" };
  if (url.hostname !== "getpeaksignal.com" && url.hostname !== "www.getpeaksignal.com") {
    return { kind: "external" };
  }
  return {
    kind: "internal",
    path: url.pathname || "/",
    fragment: decodeURIComponent(url.hash.replace(/^#/, "")),
    href: trimmed,
  };
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function get(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  const body = await res.text();
  return { status: res.status, body };
}

function checkBanned(label, body) {
  const lower = body.toLowerCase();
  for (const phrase of banned) {
    if (lower.includes(phrase)) fail(`${label} still contains "${phrase}"`);
  }
}

function assertVercelConfig() {
  const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  if (config.cleanUrls === true) fail("vercel.json cleanUrls is on, so .html URLs would redirect");
  if (config.trailingSlash === true) fail("vercel.json trailingSlash is on");

  const rewrites = config.rewrites ?? [];
  const redirects = config.redirects ?? [];
  for (const [path, file] of Object.entries(routes)) {
    const rule = rewrites.find((item) => item.source === path);
    if (!rule) {
      fail(`vercel.json has no rewrite for ${path}`);
      continue;
    }
    const destFile = String(rule.destination || "").replace(/^\//, "");
    if (destFile !== file) fail(`vercel.json ${path} rewrites to /${destFile}, expected /${file}`);
  }
  for (const [source, destination] of Object.entries(htmlRedirects)) {
    if (rewrites.some((item) => item.source === source)) {
      fail(`vercel.json still rewrites ${source}; it must 301 to ${destination}`);
    }
    const rule = redirects.find((item) => item.source === source);
    if (!rule) {
      fail(`vercel.json has no redirect for ${source}`);
      continue;
    }
    if (rule.destination !== destination) {
      fail(`vercel.json ${source} redirects to ${rule.destination}, expected ${destination}`);
    }
    if (rule.permanent !== true || rule.statusCode !== 301) {
      fail(`vercel.json ${source} must be a permanent 301`);
    }
  }

  const api = rewrites.find((item) => item.source === "/api/(.*)");
  if (!api || api.destination !== "https://peak-signal.replit.app/api/$1") {
    fail("vercel.json must proxy /api/(.*) to https://peak-signal.replit.app/api/$1");
  }

  const www = (config.redirects ?? []).find(
    (item) =>
      item.source === "/:path*" &&
      item.destination === "https://getpeaksignal.com/:path*" &&
      item.statusCode === 301 &&
      Array.isArray(item.has) &&
      item.has.some((has) => has.type === "host" && has.value === "www.getpeaksignal.com"),
  );
  if (!www) fail("vercel.json is missing the www.getpeaksignal.com 301");

  for (const file of staleRootCopies) {
    if (existsSync(join(root, file))) fail(`stale Vercel root copy still present: ${file}`);
  }

  assertVercelIgnore();
}

function ignoredByVercelIgnore(files) {
  const dir = mkdtempSync(join(tmpdir(), "vercelignore-"));
  writeFileSync(join(dir, ".gitignore"), readFileSync(join(root, ".vercelignore")));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  for (const file of files) {
    mkdirSync(join(dir, dirname(file)), { recursive: true });
    writeFileSync(join(dir, file), "");
  }
  try {
    const out = execFileSync("git", ["check-ignore", "--stdin"], {
      cwd: dir,
      input: files.join("\n") + "\n",
      encoding: "utf8",
    });
    return new Set(out.split("\n").filter(Boolean));
  } catch (err) {
    if (err && err.status === 1) return new Set();
    throw err;
  }
}

function assertVercelIgnore() {
  const hidden = [
    "voice/ara-prompt.md",
    "spine.md",
    "business-plan.md",
    "static-site/static-site-router.ts",
    "seo/seo-landers-router.ts",
    "ops/ops.html",
  ];
  const ignored = ignoredByVercelIgnore([...new Set([...Object.values(routes), ...hidden])]);
  for (const file of new Set(Object.values(routes))) {
    if (ignored.has(file)) fail(`.vercelignore excludes public file ${file}`);
  }
  for (const file of hidden) {
    if (!ignored.has(file)) fail(`.vercelignore still uploads ${file}`);
  }
}

async function main() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    const redirectTo = htmlRedirects[path];
    if (redirectTo) {
      res.writeHead(301, { Location: redirectTo + url.search });
      res.end();
      return;
    }
    const file = routes[path];
    if (!file) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": contentType(file) });
    res.end(readFileSync(join(root, file)));
  });

  const port = await listen(server);
  try {
    const pages = new Map();
    for (const path of publicPages) {
      const res = await get(port, path);
      if (res.status !== 200) fail(`${path} returned ${res.status}`);
      pages.set(path, res.body);
      checkBanned(path, res.body);
      const count = res.body.split(beacon).length - 1;
      if (count !== 1) fail(`${path} has the Cloudflare beacon ${count} times`);
    }

    assertVercelConfig();

    for (const [source, destination] of Object.entries(htmlRedirects)) {
      const redirected = await fetch(`http://127.0.0.1:${port}${source}?qa=1`, { redirect: "manual" });
      const location = redirected.headers.get("location") || "";
      if (redirected.status !== 301 || location !== `${destination}?qa=1`) {
        fail(`${source} returned ${redirected.status} Location ${location}, expected 301 ${destination}?qa=1`);
      }
      const clean = await get(port, destination);
      if (clean.status !== 200) fail(`${destination} returned ${clean.status}`);
    }

    const home = pages.get("/");
    for (const id of ["system", "offers", "how"]) {
      if (!extractIds(home).has(id)) fail(`home page is missing id="${id}"`);
    }
    const homeHrefs = extractAttrs(home, "a", "href");
    for (const id of ["system", "offers", "how"]) {
      const wanted = [`#${id}`, `/#${id}`];
      if (!homeHrefs.some((href) => wanted.includes(href.trim()))) {
        fail(`home page has no link to #${id}`);
      }
    }

    const sitemap = await get(port, "/sitemap.xml");
    if (sitemap.status !== 200) fail(`/sitemap.xml returned ${sitemap.status}`);
    const sitemapLocs = sitemapPaths(sitemap.body);
    for (const path of sitemapLocs) {
      const res = await get(port, path);
      if (res.status !== 200) fail(`sitemap URL ${path} returned ${res.status}`);
    }
    const expected = new Set(publicPages);
    for (const path of sitemapLocs) expected.add(path);

    const checked = [];
    for (const pagePath of expected) {
      const html = pages.get(pagePath) ?? (await get(port, pagePath)).body;
      if (!pages.has(pagePath)) pages.set(pagePath, html);
      const canonicals = [];
      const linkRe = /<link\b[^>]*>/gi;
      let linkTag;
      while ((linkTag = linkRe.exec(html))) {
        if (!/\brel\s*=\s*(?:"canonical"|'canonical')/i.test(linkTag[0])) continue;
        const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(linkTag[0]);
        if (href) canonicals.push(href[1] ?? href[2]);
      }
      const allHrefs = [...extractAttrs(html, "a", "href"), ...canonicals];
      for (const href of allHrefs) {
        const link = classifyHref(href, pagePath);
        if (link.kind === "skip" || link.kind === "external") continue;
        if (link.kind === "bad") {
          fail(`${pagePath} has an unparseable href: ${href}`);
          continue;
        }
        const target = await get(port, link.path);
        if (target.status !== 200) {
          fail(`${pagePath} → ${href} (${link.path}) returned ${target.status}`);
          continue;
        }
        if (link.fragment) {
          const ids = extractIds(target.body);
          if (!ids.has(link.fragment)) {
            fail(`${pagePath} → ${href} fragment "#${link.fragment}" is missing on ${link.path}`);
          }
        }
        checked.push(`${pagePath} → ${link.path}${link.fragment ? "#" + link.fragment : ""}`);
      }
    }

    if (failures.length) {
      console.error(`Public link check failed (${failures.length}):`);
      for (const item of failures) console.error(`- ${item}`);
      process.exitCode = 1;
      return;
    }

    console.log(`OK: ${pages.size} public pages, ${sitemapLocs.length} sitemap URLs, ${checked.length} internal hrefs.`);
    console.log("Banned phrases absent. Cloudflare beacon once per page.");
    console.log("vercel.json serves static-site/ and seo/, proxies /api/(.*) to Replit, and 301s www to the apex.");
    console.log("Home #system, #offers, and #how resolve.");
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
