/**
 * 301 www.getpeaksignal.com to the apex.
 *
 * Mount on the Express app before the static and SEO routers, and the
 * routers also mount it so a www GET still redirects if the app order
 * changes. Host is read from the Host header only. X-Forwarded-Host is
 * ignored so a client cannot force the redirect by spoofing that header.
 *
 * Only GET and HEAD redirect. POST and other methods stay put: a 301
 * would drop a Twilio webhook body. /api is excluded entirely, and so is
 * any request with an Upgrade header, so /api/voice media-stream
 * websockets are never turned into a redirect.
 *
 * Apex, localhost, *.replit.app, and Vercel preview hosts do not match,
 * because the check is an exact host compare, not a denylist.
 */
import type { NextFunction, Request, Response } from "express";

export const WWW_HOST = "www.getpeaksignal.com";
export const APEX_ORIGIN = "https://getpeaksignal.com";

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Hostname from a Host header, lowercase, without a port or a trailing dot. */
export function requestHost(value: string | string[] | undefined): string {
  let host = headerValue(value).split(",")[0].trim().toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(1, end);
  }
  return host.replace(/:\d+$/, "");
}

export function wwwRedirectTarget(input: {
  host?: string | string[];
  method?: string;
  originalUrl?: string;
  upgrade?: string | string[];
}): string | null {
  if (requestHost(input.host) !== WWW_HOST) return null;
  if (headerValue(input.upgrade).trim() !== "") return null;
  const method = (input.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;

  const originalUrl = input.originalUrl || "/";
  if (!originalUrl.startsWith("/") || originalUrl.startsWith("//")) return null;
  if (originalUrl.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(originalUrl)) return null;

  let parsed: URL;
  try {
    parsed = new URL(originalUrl, APEX_ORIGIN);
  } catch {
    return null;
  }
  if (parsed.origin !== APEX_ORIGIN) return null;

  const path = parsed.pathname.toLowerCase();
  if (path === "/api" || path.startsWith("/api/")) return null;

  return APEX_ORIGIN + originalUrl;
}

export function wwwApexRedirect(req: Request, res: Response, next: NextFunction): void {
  const target = wwwRedirectTarget({
    host: req.headers?.host,
    method: req.method,
    originalUrl: req.originalUrl || req.url,
    upgrade: req.headers?.upgrade,
  });
  if (!target) {
    next();
    return;
  }
  if (typeof res.redirect === "function") {
    res.redirect(301, target);
    return;
  }
  res.statusCode = 301;
  res.setHeader("Location", target);
  res.end();
}
