#!/usr/bin/env node
/**
 * The public pages use a committed Tailwind file, not the Play CDN.
 * A class that is not in that file and not a local style hook fails.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "static-site/tailwind.css"), "utf8");
const failures = [];

/** Class names that are hooks in page CSS or scripts, not Tailwind utilities. */
const localOnly = new Set(["card-tags", "more-card"]);

function escapeClass(value) {
  // Tailwind prints a comma as the CSS escape \2c followed by a space.
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => (ch === "," ? "\\2c " : "\\" + ch));
}

function classesIn(html) {
  const found = new Set();
  for (const match of html.matchAll(/class="([^"]*)"/g)) {
    for (const token of match[1].split(/\s+/)) {
      if (token) found.add(token);
    }
  }
  return found;
}

function styledLocally(html) {
  const names = new Set();
  for (const block of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const match of block[1].matchAll(/\.(-?[_a-zA-Z]+[\w-]*)/g)) names.add(match[1]);
  }
  return names;
}

const pages = readdirSync(join(root, "static-site")).filter((name) => name.endsWith(".html") && name !== "google166e848c42566a74.html");
for (const name of pages) {
  const html = readFileSync(join(root, "static-site", name), "utf8");
  if (html.includes("cdn.tailwindcss.com")) failures.push(`${name} still loads the Tailwind CDN`);
  if (!html.includes('href="/tailwind.css"')) failures.push(`${name} does not link /tailwind.css`);
  const local = styledLocally(html);
  for (const token of classesIn(html)) {
    if (token.startsWith("fa-") || token === "fas" || token === "fab" || token === "far") continue;
    if (local.has(token) || localOnly.has(token)) continue;
    if (!css.includes(escapeClass(token))) failures.push(`${name} class ${token} is missing from static-site/tailwind.css`);
  }
}

if (failures.length) {
  console.error(`Tailwind check failed (${failures.length}):`);
  for (const line of failures) console.error(`- ${line}`);
  process.exit(1);
}
console.log(`OK: ${pages.length} pages use /tailwind.css, ${css.length} bytes, CDN absent.`);
