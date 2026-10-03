/**
 * Run from the repo root:
 *   node --experimental-strip-types static-site/static-site-router.test.ts
 *
 * Requires the `express` package resolvable (voice/cht installs it).
 */
import { readFileSync } from "node:fs";
import http from "node:http";
import express from "express";
import { staticSiteRouter } from "./static-site-router.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function request(
  port: number,
  host: string,
  path: string,
): Promise<{ status: number; location?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: "GET", headers: { Host: host } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            location: res.headers.location,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const pages = [
  "static-site/index.html",
  "static-site/contact.html",
  "static-site/privacy.html",
  "static-site/terms.html",
  "index.html",
  "contact.html",
  "privacy.html",
  "terms.html",
];

for (const page of pages) {
  const html = readFileSync(page, "utf8");
  assert(html.includes("REPLACE_WITH_CLOUDFLARE_WEB_ANALYTICS_TOKEN"), `${page} missing token placeholder`);
  assert(html.includes('token.indexOf("REPLACE_WITH_") === 0'), `${page} missing placeholder guard`);
  assert(
    !html.includes('<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js"'),
    `${page} loads the beacon before the token is set`,
  );
}

const privacyLine = "Page views are counted with Cloudflare Web Analytics.";
assert(readFileSync("static-site/privacy.html", "utf8").includes(privacyLine), "static-site privacy paragraph");
assert(readFileSync("privacy.html", "utf8").includes(privacyLine), "root privacy paragraph");

const app = express();
app.use(staticSiteRouter);
app.use((_req, res) => {
  res.status(404).type("text").send("fallthrough");
});

const server = http.createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const port = (server.address() as { port: number }).port;

try {
  const wwwContact = await request(port, "www.getpeaksignal.com", "/contact?utm=outreach");
  assert(wwwContact.status === 301, `www contact status ${wwwContact.status}`);
  assert(
    wwwContact.location === "https://getpeaksignal.com/contact?utm=outreach",
    `www contact location ${wwwContact.location}`,
  );

  const wwwRoot = await request(port, "www.getpeaksignal.com", "/");
  assert(wwwRoot.status === 301, `www root status ${wwwRoot.status}`);
  assert(wwwRoot.location === "https://getpeaksignal.com/", `www root location ${wwwRoot.location}`);

  const wwwApi = await request(port, "www.getpeaksignal.com", "/api/voice?x=1");
  assert(wwwApi.status === 301, `www api status ${wwwApi.status}`);
  assert(
    wwwApi.location === "https://getpeaksignal.com/api/voice?x=1",
    `www api location ${wwwApi.location}`,
  );

  const wwwPort = await request(port, "WWW.GetPeakSignal.com:443", "/terms");
  assert(wwwPort.status === 301, `www port status ${wwwPort.status}`);
  assert(wwwPort.location === "https://getpeaksignal.com/terms", `www port location ${wwwPort.location}`);

  const wwwDot = await request(port, "www.getpeaksignal.com.", "/privacy?x=1");
  assert(wwwDot.status === 301, `www trailing-dot status ${wwwDot.status}`);
  assert(
    wwwDot.location === "https://getpeaksignal.com/privacy?x=1",
    `www trailing-dot location ${wwwDot.location}`,
  );

  const apex = await request(port, "getpeaksignal.com", "/");
  assert(apex.status === 200, `apex status ${apex.status}`);
  assert(!apex.location, "apex must not redirect");
  assert(apex.body.includes("REPLACE_WITH_CLOUDFLARE_WEB_ANALYTICS_TOKEN"), "apex home missing beacon guard");

  const replitHome = await request(port, "peak-signal.replit.app", "/contact");
  assert(replitHome.status === 200, `replit contact status ${replitHome.status}`);
  assert(!replitHome.location, "replit.app must not redirect");
  assert(replitHome.body.includes("Book an assessment") || replitHome.body.includes("Book your assessment"), "replit contact body");

  const replitApi = await request(port, "peak-signal.replit.app", "/api/voice?x=1");
  assert(replitApi.status === 404, `replit api status ${replitApi.status}`);
  assert(replitApi.body === "fallthrough", `replit api body ${replitApi.body}`);
  assert(!replitApi.location, "replit /api must not redirect");

  const lookalike = await request(port, "www.getpeaksignal.com.evil.com", "/");
  assert(lookalike.status === 200, `lookalike status ${lookalike.status}`);
  assert(!lookalike.location, "lookalike host must not redirect");

  const privacy = await request(port, "getpeaksignal.com", "/privacy");
  assert(privacy.status === 200, `privacy status ${privacy.status}`);
  assert(privacy.body.includes(privacyLine), "served privacy paragraph");
} finally {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

console.log("static-site-router tests passed");
