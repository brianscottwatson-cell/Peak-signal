/**
 * Serve the public static pages before the SPA.
 * Mount FIRST on the public Express/static host:
 *   app.use(staticSiteRouter)
 */
import { Router, type Request, type Response } from "express";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const fileCandidates = (name: string) => [
  join(__dirname, name),
  join(__dirname, "static-site", name),
  join(process.cwd(), "static-site", name),
  join(process.cwd(), "src", "static-site", name),
  join(process.cwd(), "dist", "static-site", name),
  join(process.cwd(), "public", name),
];

function load(name: string): string | null {
  for (const p of fileCandidates(name)) {
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return null;
}

function loadBuffer(name: string): Buffer | null {
  for (const p of fileCandidates(name)) {
    if (existsSync(p)) return readFileSync(p);
  }
  return null;
}

export const staticSiteRouter = Router();

function redirectClean(cleanPath: string) {
  return (req: Request, res: Response) => {
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    res.redirect(301, cleanPath + query);
  };
}

staticSiteRouter.get("/robots.txt", (_req: Request, res: Response) => {
  const body = load("robots.txt");
  if (!body) return res.status(404).type("text").send("robots missing");
  res.type("text/plain").send(body);
});

staticSiteRouter.get("/", (_req: Request, res: Response) => {
  const html = load("index.html");
  if (!html) return res.status(404).type("text").send("index missing");
  res.type("html").send(html);
});

staticSiteRouter.get("/index.html", redirectClean("/"));

staticSiteRouter.get("/google166e848c42566a74.html", (_req: Request, res: Response) => {
  const html = load("google166e848c42566a74.html");
  if (!html) return res.status(404).type("text").send("gsc verify missing");
  res.type("html").send(html);
});

staticSiteRouter.get("/contact", (_req: Request, res: Response) => {
  const html = load("contact.html");
  if (!html) return res.status(404).type("text").send("contact missing");
  res.type("html").send(html);
});

staticSiteRouter.get("/contact.html", redirectClean("/contact"));

staticSiteRouter.get("/privacy", (_req: Request, res: Response) => {
  const html = load("privacy.html");
  if (!html) return res.status(404).type("text").send("privacy missing");
  res.type("html").send(html);
});

staticSiteRouter.get("/privacy.html", redirectClean("/privacy"));

staticSiteRouter.get("/terms", (_req: Request, res: Response) => {
  const html = load("terms.html");
  if (!html) return res.status(404).type("text").send("terms missing");
  res.type("html").send(html);
});

staticSiteRouter.get("/terms.html", redirectClean("/terms"));

staticSiteRouter.get("/about", (_req: Request, res: Response) => {
  const html = load("about.html");
  if (!html) return res.status(404).type("text").send("about missing");
  res.type("html").send(html);
});

staticSiteRouter.get("/about.html", redirectClean("/about"));

// Binary. Replit build.mjs must also copy src/static-site/images/cht-before-after.webp
// to dist/static-site/images/cht-before-after.webp (the HTML copy glob does not).
staticSiteRouter.get("/images/cht-before-after.webp", (_req: Request, res: Response) => {
  const body = loadBuffer("images/cht-before-after.webp");
  if (!body) return res.status(404).type("text").send("image missing");
  res.type("image/webp").send(body);
});

export default staticSiteRouter;
