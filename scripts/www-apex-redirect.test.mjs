import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { wwwApexRedirect, wwwRedirectTarget } from "../static-site/www-apex-redirect.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apex = "https://getpeaksignal.com";

function run(host, method, originalUrl, headers = {}) {
  const req = {
    headers: { host, ...headers },
    method,
    originalUrl,
    url: originalUrl,
  };
  const result = { status: null, location: null, next: false, ended: false };
  const res = {
    statusCode: 200,
    redirect(code, location) {
      result.status = code;
      result.location = location;
    },
    setHeader(name, value) {
      if (name.toLowerCase() === "location") result.location = value;
    },
    end() {
      result.ended = true;
      if (result.status == null) result.status = this.statusCode;
    },
  };
  wwwApexRedirect(req, res, () => {
    result.next = true;
  });
  return result;
}

test("www GET and HEAD redirect to the apex with the same path and query", () => {
  assert.equal(
    wwwRedirectTarget({ host: "www.getpeaksignal.com", method: "GET", originalUrl: "/telecom?plan=voice" }),
    `${apex}/telecom?plan=voice`,
  );
  assert.equal(
    wwwRedirectTarget({ host: "www.getpeaksignal.com:443", method: "HEAD", originalUrl: "/" }),
    `${apex}/`,
  );
  assert.equal(
    wwwRedirectTarget({ host: "WWW.GetPeakSignal.com", method: "GET", originalUrl: "/about?x=1&y=2" }),
    `${apex}/about?x=1&y=2`,
  );
  const viaMiddleware = run("www.getpeaksignal.com", "GET", "/contact.html?qa=1");
  assert.equal(viaMiddleware.status, 301);
  assert.equal(viaMiddleware.location, `${apex}/contact.html?qa=1`);
  assert.equal(viaMiddleware.next, false);
});

test("apex, localhost, replit, and Vercel hosts are not redirected", () => {
  const hosts = [
    "getpeaksignal.com",
    "getpeaksignal.com:443",
    "localhost",
    "localhost:5000",
    "127.0.0.1",
    "127.0.0.1:8080",
    "peak-signal.replit.app",
    "abc123.replit.app",
    "peak-signal.vercel.app",
    "peak-signal-git-cursor-www-apex-lastmod-18b5.vercel.app",
    "preview-branch.vercel.app",
    "",
    undefined,
  ];
  for (const host of hosts) {
    assert.equal(
      wwwRedirectTarget({ host, method: "GET", originalUrl: "/telecom" }),
      null,
      `host ${host}`,
    );
    if (host) {
      const result = run(host, "GET", "/telecom");
      assert.equal(result.next, true, host);
      assert.equal(result.location, null, host);
    }
  }
});

test("POST, other methods, /api, and websocket upgrades are left alone", () => {
  assert.equal(
    wwwRedirectTarget({ host: "www.getpeaksignal.com", method: "POST", originalUrl: "/api/voice" }),
    null,
  );
  assert.equal(
    wwwRedirectTarget({ host: "www.getpeaksignal.com", method: "POST", originalUrl: "/contact" }),
    null,
  );
  assert.equal(
    wwwRedirectTarget({ host: "www.getpeaksignal.com", method: "PUT", originalUrl: "/telecom" }),
    null,
  );
  assert.equal(
    wwwRedirectTarget({ host: "www.getpeaksignal.com", method: "GET", originalUrl: "/api/voice" }),
    null,
  );
  assert.equal(
    wwwRedirectTarget({
      host: "www.getpeaksignal.com",
      method: "GET",
      originalUrl: "/api/voice/outbound/stream/CA123?token=abc",
    }),
    null,
  );
  assert.equal(
    wwwRedirectTarget({ host: "www.getpeaksignal.com", method: "GET", originalUrl: "/API/voice" }),
    null,
  );
  assert.equal(
    wwwRedirectTarget({
      host: "www.getpeaksignal.com",
      method: "GET",
      originalUrl: "/telecom",
      upgrade: "websocket",
    }),
    null,
  );
  const post = run("www.getpeaksignal.com", "POST", "/api/voice");
  assert.equal(post.next, true);
  assert.equal(post.location, null);
  const socket = run("www.getpeaksignal.com", "GET", "/api/voice/stream", { upgrade: "websocket" });
  assert.equal(socket.next, true);
});

test("a www redirect cannot be aimed at another origin", () => {
  assert.equal(
    wwwRedirectTarget({ host: "www.getpeaksignal.com", method: "GET", originalUrl: "//evil.example/phish" }),
    null,
  );
  assert.equal(
    wwwRedirectTarget({ host: "www.getpeaksignal.com", method: "GET", originalUrl: "/\\evil.example" }),
    null,
  );
  assert.equal(
    wwwRedirectTarget({ host: "www.getpeaksignal.com", method: "GET", originalUrl: "https://evil.example/" }),
    null,
  );
});

test("every sitemap URL has a lastmod date", () => {
  const xml = readFileSync(join(root, "seo/sitemap.xml"), "utf8");
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  assert.ok(blocks.length >= 10, `expected the public URLs, got ${blocks.length}`);
  for (const block of blocks) {
    const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/);
    const lastmod = block.match(/<lastmod>\s*(\d{4}-\d{2}-\d{2})\s*<\/lastmod>/);
    assert.ok(loc, block);
    assert.ok(lastmod, `missing lastmod for ${loc?.[1]}`);
    assert.equal(new URL(loc[1]).hostname, "getpeaksignal.com");
  }
});
