/**
 * CVE-2026-111497 mitigation until the Node runtime itself is patched.
 * Inbound: any Content-Encoding that contains "br" is rejected with 415
 * before body parsers or inflate middleware run.
 * Outbound: fetch, undici, and axios send Accept-Encoding: gzip, identity.
 * Response compression is left alone. This file never calls brotli decompress.
 *
 * Replit copy (then `cd artifacts/api-server && pnpm run build` before Republish):
 * - artifacts/api-server/src/brotli-guard.ts (cht-voice imports ../brotli-guard)
 * - artifacts/api-server/src/voice/brotli-guard.ts (voice-ara, peak, ops, static, seo)
 * If voice-ara.ts does not live in src/voice/, also place this file beside it.
 */
import { Server as HttpServer } from "node:http";
import { Server as HttpsServer } from "node:https";
import * as http2 from "node:http2";
import { createRequire, Module as NodeModule } from "node:module";
import { fileURLToPath } from "node:url";

export const SAFE_ACCEPT_ENCODING = "gzip, identity";
const UNSUPPORTED_BODY = "Unsupported Content-Encoding";

type Emit = (this: unknown, event: string | symbol, ...args: unknown[]) => boolean;
type Marked = { __brotliGuard?: boolean };
type ParserFactory = (this: unknown, options?: object) => (req: unknown, res: unknown, next: (err?: unknown) => void) => unknown;
type ExpressParsers = {
  json?: ParserFactory;
  urlencoded?: ParserFactory;
  raw?: ParserFactory;
  text?: ParserFactory;
};

/** True when a Content-Encoding header value contains the brotli token "br". */
export function contentEncodingIncludesBrotli(value: unknown): boolean {
  if (typeof value === "string") return value.toLowerCase().includes("br");
  if (Array.isArray(value)) return value.some((part) => contentEncodingIncludesBrotli(part));
  return false;
}

function endUnsupported(res: {
  headersSent?: boolean;
  writableEnded?: boolean;
  writeHead?: (status: number, headers: Record<string, string | number>) => void;
  end?: (body?: string | Buffer) => void;
  status?: (code: number) => { set: (k: string, v: string) => { type: (t: string) => { send: (b: string) => void } } };
}): void {
  if (res.writableEnded || res.headersSent) return;
  if (typeof res.writeHead === "function" && typeof res.end === "function") {
    const body = Buffer.from(UNSUPPORTED_BODY);
    res.writeHead(415, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": body.length,
      Connection: "close",
    });
    res.end(body);
    return;
  }
  if (typeof res.status === "function") {
    res.status(415).set("Connection", "close").type("text/plain").send(UNSUPPORTED_BODY);
  }
}

/**
 * Express middleware. Mount before express.json, express.urlencoded, and any inflate step.
 * Also installed on http(s) servers so an app-level parser registered first cannot inflate br.
 */
export function rejectBrotliContentEncoding(req: { headers?: { "content-encoding"?: unknown }; resume?: () => void }, res: Parameters<typeof endUnsupported>[0], next: (err?: unknown) => void): void {
  if (!contentEncodingIncludesBrotli(req?.headers?.["content-encoding"])) {
    next();
    return;
  }
  if (typeof req.resume === "function") req.resume();
  endUnsupported(res);
}

function patchServerEmit(proto: { emit: Emit }): void {
  const current = proto.emit;
  if ((current as Emit & Marked).__brotliGuard) return;
  const original = current;
  const guarded: Emit = function (this: unknown, event: string | symbol, ...args: unknown[]): boolean {
    if (event === "request") {
      const req = args[0] as { headers?: { "content-encoding"?: unknown }; resume?: () => void } | undefined;
      const res = args[1] as Parameters<typeof endUnsupported>[0] | undefined;
      if (req && res && contentEncodingIncludesBrotli(req.headers?.["content-encoding"])) {
        if (typeof req.resume === "function") req.resume();
        endUnsupported(res);
        return true;
      }
    }
    return original.call(this, event, ...args);
  };
  (guarded as Emit & Marked).__brotliGuard = true;
  proto.emit = guarded;
}

function applyAcceptEncoding(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("Accept-Encoding", SAFE_ACCEPT_ENCODING);
  return { ...init, headers };
}

function patchGlobalFetch(): void {
  const current = globalThis.fetch;
  if (!current || (current as typeof fetch & Marked).__brotliGuard) return;
  const guarded: typeof fetch = (input, init) => {
    if (typeof Request !== "undefined" && input instanceof Request) {
      const headers = new Headers(init?.headers ?? input.headers);
      headers.set("Accept-Encoding", SAFE_ACCEPT_ENCODING);
      return current(new Request(input, { ...init, headers }));
    }
    return current(input, applyAcceptEncoding(init));
  };
  (guarded as typeof fetch & Marked).__brotliGuard = true;
  globalThis.fetch = guarded;
}

function copyHeadersWithAcceptEncoding(headers: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "accept-encoding") continue;
    next[key] = value;
  }
  next["accept-encoding"] = SAFE_ACCEPT_ENCODING;
  return next;
}

function withUndiciAcceptEncoding(opts?: { headers?: unknown }): object {
  const options: { headers?: unknown } = opts ? { ...opts } : {};
  const headers = options.headers;
  if (!headers) {
    options.headers = { "accept-encoding": SAFE_ACCEPT_ENCODING };
    return options;
  }
  if (typeof (headers as { set?: unknown }).set === "function") {
    (headers as { set: (name: string, value: string) => void }).set("accept-encoding", SAFE_ACCEPT_ENCODING);
    return options;
  }
  if (Array.isArray(headers)) {
    const next: unknown[] = [];
    for (let i = 0; i < headers.length; i += 2) {
      if (String(headers[i]).toLowerCase() === "accept-encoding") continue;
      next.push(headers[i], headers[i + 1]);
    }
    next.push("accept-encoding", SAFE_ACCEPT_ENCODING);
    options.headers = next;
    return options;
  }
  if (typeof headers === "object") {
    options.headers = copyHeadersWithAcceptEncoding(headers as Record<string, unknown>);
    return options;
  }
  return options;
}

function patchUndici(exported: unknown): void {
  const mod = exported as { default?: { fetch?: unknown; request?: unknown; __brotliGuard?: boolean }; fetch?: unknown; request?: unknown; __brotliGuard?: boolean };
  const target = mod?.default && (typeof mod.default.fetch === "function" || typeof mod.default.request === "function") ? mod.default : mod;
  if (!target || target.__brotliGuard) return;
  let patched = false;
  if (typeof target.fetch === "function" && !(target.fetch as Marked).__brotliGuard) {
    const orig = target.fetch as (input: unknown, init?: RequestInit) => Promise<Response>;
    const wrapped = (input: unknown, init?: RequestInit) => orig(input, applyAcceptEncoding(init));
    (wrapped as Marked).__brotliGuard = true;
    target.fetch = wrapped;
    patched = true;
  }
  if (typeof target.request === "function" && !(target.request as Marked).__brotliGuard) {
    const orig = target.request as (url: unknown, opts?: { headers?: unknown }) => unknown;
    const wrapped = (url: unknown, opts?: { headers?: unknown }) => orig(url, withUndiciAcceptEncoding(opts));
    (wrapped as Marked).__brotliGuard = true;
    target.request = wrapped;
    patched = true;
  }
  if (patched) target.__brotliGuard = true;
}

function forceAxiosHeaders(config: { headers?: { set?: (name: string, value: string) => void; [key: string]: unknown } }): void {
  if (!config.headers) config.headers = {};
  if (typeof config.headers.set === "function") {
    config.headers.set("Accept-Encoding", SAFE_ACCEPT_ENCODING);
    return;
  }
  config.headers["Accept-Encoding"] = SAFE_ACCEPT_ENCODING;
}

type AxiosLike = ((...args: unknown[]) => unknown) & {
  __brotliGuard?: boolean;
  defaults?: { headers?: { common?: Record<string, unknown> } };
  interceptors?: { request?: { use?: (fn: (config: { headers?: { set?: (name: string, value: string) => void } }) => unknown) => void } };
  create?: ((config?: unknown) => unknown) & Marked;
};

function patchAxios(exported: unknown): void {
  const mod = exported as { default?: unknown };
  const candidate = typeof exported === "function" ? exported : mod?.default;
  if (typeof candidate !== "function") return;
  const axios = candidate as AxiosLike;
  if (axios.__brotliGuard) return;
  axios.__brotliGuard = true;
  const common = axios.defaults?.headers?.common;
  if (common) common["Accept-Encoding"] = SAFE_ACCEPT_ENCODING;
  axios.interceptors?.request?.use?.((config) => {
    forceAxiosHeaders(config);
    return config;
  });
  if (typeof axios.create === "function" && !axios.create.__brotliGuard) {
    const origCreate = axios.create.bind(axios);
    const wrappedCreate = (config?: unknown) => {
      const instance = origCreate(config);
      patchAxios(instance);
      return instance;
    };
    (wrappedCreate as Marked).__brotliGuard = true;
    axios.create = wrappedCreate as AxiosLike["create"];
  }
}

type ModuleLoad = ((this: unknown, request: string, parent: unknown, isMain: boolean) => unknown) & Marked;

function patchModuleLoads(): void {
  const runtime = NodeModule as unknown as { _load: ModuleLoad };
  const load = runtime._load;
  if (load.__brotliGuard) return;
  const wrapped: ModuleLoad = function (this: unknown, request: string, parent: unknown, isMain: boolean) {
    const exported = load.call(this, request, parent, isMain);
    if (request === "undici") patchUndici(exported);
    else if (request === "axios") patchAxios(exported);
    return exported;
  };
  wrapped.__brotliGuard = true;
  runtime._load = wrapped;
}

function wrapParser(factory: ParserFactory): ParserFactory {
  if ((factory as ParserFactory & Marked).__brotliGuard) return factory;
  const wrapped = function (this: unknown, options?: object) {
    const parser = factory.call(this, options);
    return (req: { headers?: { "content-encoding"?: unknown }; resume?: () => void }, res: Parameters<typeof endUnsupported>[0], next: (err?: unknown) => void) => {
      if (contentEncodingIncludesBrotli(req?.headers?.["content-encoding"])) {
        if (typeof req.resume === "function") req.resume();
        endUnsupported(res);
        return;
      }
      return parser(req, res, next);
    };
  } as ParserFactory;
  (wrapped as ParserFactory & Marked).__brotliGuard = true;
  return wrapped;
}

/** Wrap express/body-parser factories so br is refused before they inflate. */
export function guardExpressParsers(express: ExpressParsers): void {
  for (const key of ["json", "urlencoded", "raw", "text"] as const) {
    const factory = express[key];
    if (typeof factory === "function") express[key] = wrapParser(factory);
  }
}

function asFilename(from: string | undefined): string | undefined {
  if (!from) return undefined;
  if (from.startsWith("file:")) {
    try {
      return fileURLToPath(from);
    } catch {
      return undefined;
    }
  }
  return from;
}

function patchExpressFrom(from: string | undefined): void {
  const filename = asFilename(from);
  if (!filename) return;
  try {
    const require = createRequire(filename);
    guardExpressParsers(require("express"));
    try {
      guardExpressParsers(require("body-parser"));
    } catch {
      // body-parser is optional; express.json is the path these apps use.
    }
  } catch {
    // express is not resolvable from this file. Callers pass their own path.
  }
}

let serversPatched = false;

/** Idempotent. Pass __filename (CJS) or a file URL so express beside that file is wrapped. */
export function installBrotliMitigation(from?: string): void {
  if (!serversPatched) {
    patchServerEmit(HttpServer.prototype as { emit: Emit });
    patchServerEmit(HttpsServer.prototype as { emit: Emit });
    try {
      const http2Server = http2.createServer();
      const http2SecureServer = http2.createSecureServer();
      patchServerEmit(http2Server.constructor.prototype as { emit: Emit });
      patchServerEmit(http2SecureServer.constructor.prototype as { emit: Emit });
      http2Server.close();
      http2SecureServer.close();
    } catch {
      // These Express apps listen with http/https. http2 is best-effort.
    }
    patchGlobalFetch();
    patchModuleLoads();
    serversPatched = true;
  }
  if (typeof __filename === "string") patchExpressFrom(__filename);
  patchExpressFrom(from);
}

installBrotliMitigation();
