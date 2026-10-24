/**
 * CVE-2026-111497: a br-encoded POST is rejected with 415 before the JSON
 * parser runs. A normal JSON POST still parses.
 * Run from voice/cht: node --experimental-strip-types brotli-guard.test.ts
 */
import http from "node:http";
import { installBrotliMitigation, rejectBrotliContentEncoding } from "../brotli-guard.ts";

installBrotliMitigation(import.meta.url);

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

let middlewareNext = false;
const middlewareRes = {
  headersSent: false,
  writableEnded: false,
  statusCode: 0,
  writeHead(status: number) {
    this.statusCode = status;
  },
  end() {
    this.writableEnded = true;
  },
};
rejectBrotliContentEncoding(
  { headers: { "content-encoding": "br" }, resume() {} },
  middlewareRes,
  () => {
    middlewareNext = true;
  },
);
assert(middlewareRes.statusCode === 415 && middlewareRes.writableEnded && !middlewareNext, "middleware did not reject br");

let passed = false;
rejectBrotliContentEncoding({ headers: {} }, middlewareRes, () => {
  passed = true;
});
assert(passed, "middleware blocked a request with no Content-Encoding");

const { default: express } = await import("express");

const app = express();
app.use(rejectBrotliContentEncoding);
app.use(express.json());
let hits = 0;
app.post("/echo", (req, res) => {
  hits += 1;
  res.json({ ok: true, body: req.body });
});
app.use((err, _req, res, _next) => {
  const status = typeof err === "object" && err && "status" in err && typeof err.status === "number" ? err.status : 400;
  res.status(status).type("text/plain").send("parser error");
});

const server = await new Promise<http.Server>((resolve) => {
  const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
});
const addr = server.address();
const port = typeof addr === "object" && addr ? addr.port : 0;

async function post(headers: Record<string, string>, body: string) {
  const res = await fetch(`http://127.0.0.1:${port}/echo`, { method: "POST", headers, body });
  const text = await res.text();
  return { status: res.status, text };
}

const br = await post(
  { "Content-Type": "application/json", "Content-Encoding": "br" },
  JSON.stringify({ pwned: true }),
);
assert(br.status === 415, `br status ${br.status} ${br.text}`);
assert(br.text.includes("Unsupported Content-Encoding"), br.text);
assert(!br.text.includes("pwned"), br.text);
assert(hits === 0, `br POST reached the handler (${hits})`);

const mixed = await post(
  { "Content-Type": "application/json", "Content-Encoding": "gzip, br" },
  JSON.stringify({ pwned: true }),
);
assert(mixed.status === 415, `gzip, br status ${mixed.status} ${mixed.text}`);
assert(hits === 0, `mixed encoding reached the handler (${hits})`);

const upper = await post(
  { "Content-Type": "application/json", "Content-Encoding": "BR" },
  "{}",
);
assert(upper.status === 415, `BR status ${upper.status} ${upper.text}`);

const brotliWord = await post(
  { "Content-Type": "application/json", "Content-Encoding": "brotli" },
  "{}",
);
assert(brotliWord.status === 415, `brotli status ${brotliWord.status} ${brotliWord.text}`);
assert(hits === 0, `brotli token reached the handler (${hits})`);

const ok = await post({ "Content-Type": "application/json" }, JSON.stringify({ hello: "world" }));
assert(ok.status === 200, `json status ${ok.status} ${ok.text}`);
const parsed = JSON.parse(ok.text) as { ok: boolean; body: { hello: string } };
assert(parsed.ok === true && parsed.body.hello === "world", ok.text);
assert(hits === 1, `json hits ${hits}`);

const gzip = await post(
  { "Content-Type": "application/json", "Content-Encoding": "gzip" },
  JSON.stringify({ hello: "nope" }),
);
assert(gzip.status !== 415, `gzip was rejected as brotli ${gzip.status} ${gzip.text}`);
assert(hits === 1, `gzip body was parsed (${hits})`);

const seen: string[] = [];
const probe = http.createServer((req, res) => {
  seen.push(String(req.headers["accept-encoding"] || ""));
  res.end("ok");
});
await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", () => resolve()));
const probeAddr = probe.address();
const probePort = typeof probeAddr === "object" && probeAddr ? probeAddr.port : 0;
const outbound = await fetch(`http://127.0.0.1:${probePort}/out`, {
  headers: { "Accept-Encoding": "br, gzip" },
});
assert(outbound.status === 200, `outbound probe ${outbound.status}`);
assert(seen[0] === "gzip, identity", `Accept-Encoding ${seen[0]}`);

await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
await new Promise<void>((resolve, reject) => probe.close((err) => (err ? reject(err) : resolve())));
console.log("brotli-guard.test.ts ok");
