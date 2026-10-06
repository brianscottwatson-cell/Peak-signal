/**
 * Public pages for the content guardrail and the feature map.
 *
 * Pages:
 *   - static-site/*.html, except the Google Search Console verification token
 *   - seo/landers/*.html
 *   - HTML files named by vercel.json rewrites
 *   - a root twin (index.html, contact.html, ...) only when that file exists
 *
 * Non-page routes, when the files exist:
 *   - /sitemap.xml from seo/sitemap.xml
 *   - /robots.txt from static-site/robots.txt (seo/robots.txt is the other copy)
 *
 * Ops pages, voice prompts, and markdown are not public marketing routes.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

export function listPublicRoutes(root) {
  const map = new Map();

  function add(route, file, kind) {
    if (!route || !file) return;
    const abs = join(root, file);
    if (!existsSync(abs)) return;
    if (kind === "page" && !isContentPage(abs)) return;
    let entry = map.get(route);
    if (!entry) {
      entry = { route, kind, files: [] };
      map.set(route, entry);
    }
    if (kind === "page") entry.kind = "page";
    if (!entry.files.includes(file)) entry.files.push(file);
  }

  const staticDir = join(root, "static-site");
  if (existsSync(staticDir)) {
    for (const name of readdirSync(staticDir).sort()) {
      if (!name.endsWith(".html")) continue;
      const base = basename(name, ".html");
      add(base === "index" ? "/" : `/${base}`, `static-site/${name}`, "page");
    }
  }

  const landerDir = join(root, "seo", "landers");
  if (existsSync(landerDir)) {
    for (const name of readdirSync(landerDir).sort()) {
      if (!name.endsWith(".html")) continue;
      add(`/${basename(name, ".html")}`, `seo/landers/${name}`, "page");
    }
  }

  const vercelPath = join(root, "vercel.json");
  if (existsSync(vercelPath)) {
    const vercel = JSON.parse(readFileSync(vercelPath, "utf8"));
    for (const rule of vercel.rewrites ?? []) {
      if (typeof rule?.source !== "string" || typeof rule?.destination !== "string") continue;
      if (!rule.destination.endsWith(".html")) continue;
      const file = rule.destination.replace(/^\//, "");
      add(prettyRoute(rule.source), file, "page");
    }
  }

  if (existsSync(join(root, "index.html"))) add("/", "index.html", "page");

  for (const entry of map.values()) {
    if (entry.kind !== "page") continue;
    const twin = entry.route === "/" ? "index.html" : `${entry.route.slice(1)}.html`;
    if (twin.includes("/")) continue;
    add(entry.route, twin, "page");
  }

  if (existsSync(join(root, "seo", "sitemap.xml"))) {
    add("/sitemap.xml", "seo/sitemap.xml", "file");
  }
  if (existsSync(join(root, "static-site", "robots.txt"))) {
    add("/robots.txt", "static-site/robots.txt", "file");
  } else if (existsSync(join(root, "seo", "robots.txt"))) {
    add("/robots.txt", "seo/robots.txt", "file");
  }

  return [...map.values()]
    .map(decorate)
    .sort((a, b) => a.route.localeCompare(b.route));
}

export function contentFiles(routes) {
  const files = [];
  for (const route of routes) {
    if (route.kind !== "page") continue;
    for (const file of route.files) {
      if (file.endsWith(".html") && !files.includes(file)) files.push(file);
    }
  }
  return files.sort();
}

export function loadPriceAllowlist(root) {
  const rel = "scripts/guardrails.config.json";
  const path = join(root, rel);
  if (!existsSync(path)) return [];
  let json;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    const error = new Error(`${rel} is not valid JSON (${err.message})`);
    error.rule = "config";
    throw error;
  }
  const list = json.priceAllowlist ?? [];
  if (!Array.isArray(list) || list.some((item) => typeof item !== "string")) {
    const error = new Error(`${rel} priceAllowlist must be an array of strings`);
    error.rule = "config";
    throw error;
  }
  return list;
}

/**
 * Walk one HTML document.
 * Inline script and style bodies are omitted. JSON-LD script bodies are kept.
 * A Cloudflare Web Analytics beacon tag is omitted, attributes included.
 */
export function inspectHtml(html) {
  const regions = [];
  const h1s = [];
  const forms = [];
  const titles = [];
  const descriptions = [];
  const lines = lineStarts(html);
  const lineOf = (index) => lineAt(lines, index);
  let i = 0;

  while (i < html.length) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }

    if (html[i] === "<") {
      const tagEnd = findTagEnd(html, i);
      if (tagEnd <= i) {
        i += 1;
        continue;
      }
      const tag = html.slice(i, tagEnd);
      const parsed = parseTagName(tag);
      if (!parsed) {
        i = tagEnd;
        continue;
      }
      const { name, isClose } = parsed;

      if (!isClose && name === "script") {
        const close = findClose(html, tagEnd, "script");
        const src = getAttr(tag, "src") || "";
        const type = getAttr(tag, "type") || "";
        const beacon = /cloudflareinsights\.com/i.test(src) || /data-cf-beacon/i.test(tag);
        if (!beacon && /ld\+json/i.test(type)) {
          regions.push({
            kind: "jsonld",
            text: html.slice(tagEnd, close.start),
            index: tagEnd,
          });
        }
        i = close.end;
        continue;
      }

      if (!isClose && name === "style") {
        i = findClose(html, tagEnd, "style").end;
        continue;
      }

      if (!isClose && name === "title") {
        const close = findClose(html, tagEnd, "title");
        const text = html.slice(tagEnd, close.start);
        regions.push({ kind: "meta", text, index: tagEnd });
        titles.push({ text: visibleText(text), line: lineOf(i) });
        i = close.end;
        continue;
      }

      if (!isClose && name === "meta") {
        const content = getAttr(tag, "content");
        if (content != null) {
          regions.push({
            kind: "meta",
            text: content,
            index: attrIndex(html, i, tag, content),
          });
          const metaName = (getAttr(tag, "name") || "").toLowerCase();
          if (metaName === "description") {
            descriptions.push({ text: content, line: lineOf(i) });
          }
        }
        i = tagEnd;
        continue;
      }

      if (!isClose && name === "form") {
        forms.push({ action: getAttr(tag, "action"), line: lineOf(i) });
      }

      if (!isClose && name === "h1") {
        const close = findClose(html, tagEnd, "h1");
        h1s.push({
          text: visibleText(html.slice(tagEnd, close.start)),
          line: lineOf(i),
        });
        i = tagEnd;
        continue;
      }

      if (!isClose && (name === "input" || name === "option" || name === "button" || name === "textarea")) {
        const value = getAttr(tag, "value");
        if (value != null && value.trim()) {
          regions.push({
            kind: "form-value",
            text: value,
            index: attrIndex(html, i, tag, value),
          });
        }
      }

      if (!isClose) {
        for (const attr of ["alt", "aria-label", "placeholder", "title"]) {
          const value = getAttr(tag, attr);
          if (value != null && value.trim()) {
            regions.push({
              kind: "text",
              text: value,
              index: attrIndex(html, i, tag, value),
            });
          }
        }
      }

      i = tagEnd;
      continue;
    }

    const next = html.indexOf("<", i);
    const end = next === -1 ? html.length : next;
    const text = html.slice(i, end);
    if (text.trim()) regions.push({ kind: "text", text, index: i });
    i = end;
  }

  return { regions, h1s, forms, titles, descriptions, lineOf };
}

export function visibleText(fragment) {
  const noComments = fragment.replace(/<!--[\s\S]*?-->/g, " ");
  const noTags = noComments.replace(/<[^>]+>/g, " ");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

export function normalizeLabel(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decorate(entry) {
  const sourceFile =
    entry.files.find((file) => file.startsWith("static-site/")) ||
    entry.files.find((file) => file.startsWith("seo/")) ||
    entry.files[0];
  const vercelFile = entry.files.find((file) => file !== sourceFile && !file.includes("/")) || null;
  return { ...entry, sourceFile, vercelFile };
}

function prettyRoute(source) {
  if (source === "/" || source === "/index.html") return "/";
  if (source.endsWith(".html")) {
    const base = source.slice(1, -".html".length);
    return base === "index" ? "/" : `/${base}`;
  }
  return source.startsWith("/") ? source : `/${source}`;
}

function isContentPage(absPath) {
  const name = basename(absPath);
  if (/^google[0-9a-f]+\.html$/i.test(name)) return false;
  const head = readFileSync(absPath, "utf8").slice(0, 400);
  if (/google-site-verification\s*:/i.test(head) && !/<html[\s>]/i.test(head)) return false;
  return /<!doctype\s+html|<html[\s>]/i.test(head);
}

function parseTagName(tag) {
  const match = /^<\s*(\/)?\s*([a-zA-Z][\w:-]*)/.exec(tag);
  if (!match) return null;
  return { isClose: Boolean(match[1]), name: match[2].toLowerCase() };
}

function findTagEnd(html, start) {
  let quote = null;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") return i + 1;
  }
  return html.length;
}

function findClose(html, from, name) {
  const re = new RegExp(`</${name}\\s*>`, "ig");
  re.lastIndex = from;
  const match = re.exec(html);
  if (!match) return { start: html.length, end: html.length };
  return { start: match.index, end: match.index + match[0].length };
}

function getAttr(tag, name) {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, "i");
  const match = re.exec(tag);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3];
}

function attrIndex(html, tagStart, tag, value) {
  const at = tag.indexOf(value);
  return at === -1 ? tagStart : tagStart + at;
}

function lineStarts(html) {
  const starts = [0];
  for (let i = 0; i < html.length; i++) {
    if (html[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function lineAt(starts, index) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => fromCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => fromCode(parseInt(n, 16)))
    .replace(/&amp;/gi, "&");
}

function fromCode(n) {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

export function formatFailures(failures) {
  const lines = [];
  const seen = new Set();
  const sorted = [...failures].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.rule.localeCompare(b.rule) ||
      a.message.localeCompare(b.message),
  );
  for (const failure of sorted) {
    const line = `${failure.file}:${failure.line} [${failure.rule}] ${failure.message}`;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines;
}
