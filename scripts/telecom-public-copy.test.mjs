import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const ALLOWED_BRIAN = [
  "The from-line is Brian at Peak Signal.",
  "From-line on texts: Brian at Peak Signal.",
  "From-line: Brian at Peak Signal.",
];

function filesUnder(dir, suffixes) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === "images") continue;
      out.push(...filesUnder(path, suffixes));
      continue;
    }
    if (suffixes.some((suffix) => name.endsWith(suffix))) out.push(path);
  }
  return out;
}

function publicFiles() {
  return [
    ...filesUnder(join(root, "static-site"), [".html", ".txt", ".json", ".js", ".mjs"]),
    ...filesUnder(join(root, "seo"), [".html", ".txt", ".xml"]),
    join(root, "telecom/quote.html"),
    join(root, "telecom/openapi.json"),
    join(root, "static-site/telecom-chat.js"),
    join(root, "static-site/telecom-visitor-copy.mjs"),
    join(root, "static-site/telecom-carrier-rules.mjs"),
  ];
}

function withoutFromLine(text) {
  let rest = text;
  for (const phrase of ALLOWED_BRIAN) rest = rest.split(phrase).join("");
  return rest;
}

test("public pages and chat strings do not name Brian, except the texting from-line", () => {
  const hits = [];
  for (const file of publicFiles()) {
    const text = readFileSync(file, "utf8");
    if (/\bBrian\b/.test(withoutFromLine(text))) hits.push(file.slice(root.length + 1));
  }
  assert.deepEqual(hits, []);
});

test("the texting from-line is the only public Brian wording, and it stays in privacy and terms", () => {
  const privacy = readFileSync(join(root, "static-site/privacy.html"), "utf8");
  const terms = readFileSync(join(root, "static-site/terms.html"), "utf8");
  assert.match(privacy, /The from-line is Brian at Peak Signal\./);
  assert.match(privacy, /From-line on texts: Brian at Peak Signal\./);
  assert.match(terms, /From-line: Brian at Peak Signal\./);
  assert.equal(/\bBrian\b/.test(withoutFromLine(privacy)), false);
  assert.equal(/\bBrian\b/.test(withoutFromLine(terms)), false);
});

test("public chat files do not name a partner portal or quote a price", () => {
  const chatFiles = [
    "static-site/telecom-chat.js",
    "static-site/telecom-visitor-copy.mjs",
    "static-site/telecom-carrier-rules.mjs",
    "telecom/quote.html",
    "telecom/openapi.json",
  ];
  const banned = [/loc8/i, /pax8/i, /\bLocate\b/, /\$\d/];
  for (const file of chatFiles) {
    const text = readFileSync(join(root, file), "utf8");
    for (const pattern of banned) assert.doesNotMatch(text, pattern, file);
  }
});

test("/contact stays a general inquiry form and sends telecom quotes to /telecom", () => {
  const html = readFileSync(join(root, "static-site/contact.html"), "utf8");
  const forms = [...html.matchAll(/<form\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(forms.length, 1);
  assert.match(forms[0], /action="https:\/\/formspree\.io\/f\/mgobgrlr" method="POST"/);
  assert.doesNotMatch(html, /\/api\/telecom/);
  const names = new Set([...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"/g)].map((match) => match[1]));
  for (const name of ["name", "business_name", "email", "phone", "interest", "problem", "timeline", "team_size", "source", "message", "consent", "sms_consent"]) {
    assert.ok(names.has(name), `contact form is missing ${name}`);
  }
  for (const interest of ["Website", "Voice", "Email", "Quoting", "Integrations", "Not sure yet"]) {
    assert.match(html, new RegExp(`name="interest" value="${interest}"`), interest);
  }
  for (const name of ["service_address", "street", "suite", "suite_not_needed", "country", "path", "speeds", "access_type",
    "term", "bandwidth", "connection_type", "contract_end", "budget", "roe"]) {
    assert.equal(names.has(name), false, `contact form should not collect ${name}`);
  }
  assert.doesNotMatch(html, />(Service address|Term|Bandwidth in Mbps|Fiber or broadband)</);
  assert.match(html, /<h1[^>]*>Book a call<\/h1>/);
  assert.match(html, /calendly\.com\/hello-peaksignal\/30min/);
  assert.match(html, /Need a quote for business phone, internet, or connectivity\? Use the <a href="\/telecom#quote"[^>]*>telecom quote form<\/a>\./);
  for (const banned of [/loc8/i, /pax8/i, /\bLocate\b/, /\bBrian\b/, /\$\d/]) {
    assert.doesNotMatch(html, banned);
  }
});
