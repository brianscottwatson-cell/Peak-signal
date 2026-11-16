#!/usr/bin/env node
/**
 * Submit sitemap URLs to IndexNow after a Replit publish.
 *
 * The key file is public on purpose. Do not run this from CI, and do not
 * import it from the site. Without --publish it prints the body and does
 * not open a connection.
 *
 *   node scripts/indexnow-ping.mjs --publish
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "getpeaksignal.com";
const ENDPOINT = "https://api.indexnow.org/indexnow";

export function indexNowKey() {
  const dir = join(root, "static-site");
  const names = readdirSync(dir).filter((name) => /^[a-f0-9]{8,128}\.txt$/.test(name));
  if (names.length !== 1) {
    throw new Error(`expected one IndexNow key file in static-site/, found ${names.length}`);
  }
  const key = names[0].slice(0, -4);
  const body = readFileSync(join(dir, names[0]), "utf8").trim();
  if (body !== key) throw new Error("IndexNow key file contents do not match its name");
  return key;
}

export function sitemapUrls() {
  const xml = readFileSync(join(root, "seo/sitemap.xml"), "utf8");
  const urls = [];
  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
    const loc = match[1].trim();
    const url = new URL(loc);
    if (url.hostname !== HOST) throw new Error(`sitemap URL is not on ${HOST}: ${loc}`);
    urls.push(url.origin + url.pathname + url.search);
  }
  if (!urls.length) throw new Error("sitemap has no URLs");
  return urls;
}

export function indexNowBody() {
  const key = indexNowKey();
  return {
    host: HOST,
    key,
    keyLocation: `https://${HOST}/${key}.txt`,
    urlList: sitemapUrls(),
  };
}

export async function main(argv = process.argv, deps = {}) {
  const publish = argv.includes("--publish");
  const log = deps.log ?? console.log;
  const body = indexNowBody();
  if (!publish) {
    log("IndexNow not sent. Pass --publish after the key URL returns 200.");
    log(JSON.stringify(body, null, 2));
    return { sent: false, body };
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  log(`IndexNow ${response.status} for ${body.urlList.length} URLs`);
  return { sent: true, status: response.status, body };
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
