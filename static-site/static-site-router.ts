/**
 * Serve Capture/Answer/Keep static homepage, contact, privacy, and terms HTML before SPA.
 * www.getpeaksignal.com 301s to https://getpeaksignal.com, path and query kept.
 * Mount FIRST on the public Express/static host so the redirect runs for every path:
 *   app.use(staticSiteRouter)
 */
import { Router, type Request, type Response } from "express";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const WWW_HOST = "www.getpeaksignal.com";
const APEX_ORIGIN = "https://getpeaksignal.com";

function scriptDir(): string | null {
  try {
    if (typeof __dirname === "string" && __dirname) return __dirname;
  } catch {
    // ESM has no __dirname. Replit compiles this file to CommonJS, where it is set.
  }
  return null;
}

function load(name: string): string | null {
  const dir = scriptDir();
  const candidates = [
    dir && join(dir, name),
    dir && join(dir, "static-site", name),
    join(process.cwd(), "static-site", name),
    join(process.cwd(), "src", "static-site", name),
    join(process.cwd(), "dist", "static-site", name),
    join(process.cwd(), "public", name),
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) return readFileSync(p, "utf8");
  }
  return null;
}

function requestHost(req: Request): string {
  const hostHeader = req.headers.host;
  const raw = (typeof hostHeader === "string" ? hostHeader : req.hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  return raw.replace(/:\d+$/, "");
}

export const staticSiteRouter = Router();

staticSiteRouter.use((req: Request, res: Response, next) => {
  if (requestHost(req) !== WWW_HOST) {
    next();
    return;
  }
  const pathAndQuery = req.originalUrl && req.originalUrl.startsWith("/") ? req.originalUrl : "/";
  res.redirect(301, `${APEX_ORIGIN}${pathAndQuery}`);
});

staticSiteRouter.get("/robots.txt", (_req: Request, res: Response) => {
  const body = load("robots.txt");
  if (!body) return res.status(404).type("text").send("robots missing");
  res.type("text/plain").send(body);
});

staticSiteRouter.get(["/", "/index.html"], (_req: Request, res: Response) => {
  const html = load("index.html");
  if (!html) return res.status(404).type("text").send("index missing");
  res.type("html").send(html);
});

staticSiteRouter.get("/google166e848c42566a74.html", (_req: Request, res: Response) => {
  const html = load("google166e848c42566a74.html");
  if (!html) return res.status(404).type("text").send("gsc verify missing");
  res.type("html").send(html);
});

staticSiteRouter.get(["/contact", "/contact.html"], (_req: Request, res: Response) => {
  const html = load("contact.html");
  if (!html) return res.status(404).type("text").send("contact missing");
  res.type("html").send(html);
});

staticSiteRouter.get(["/privacy", "/privacy.html"], (_req: Request, res: Response) => {
  const html = load("privacy.html");
  if (!html) return res.status(404).type("text").send("privacy missing");
  res.type("html").send(html);
});

staticSiteRouter.get(["/terms", "/terms.html"], (_req: Request, res: Response) => {
  const html = load("terms.html");
  if (!html) return res.status(404).type("text").send("terms missing");
  res.type("html").send(html);
});

export default staticSiteRouter;
