/**
 * Peak Signal SEO static landers (HTML-first).
 * Mount BEFORE SPA catch-all: app.use(seoLandersRouter)
 */
import { Router, type Request, type Response } from "express";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PAGES: Record<string, string> = {
  "/ai-websites-evergreen-co": "ai-websites-evergreen-co.html",
  "/ai-automation-evergreen-colorado": "ai-automation-evergreen-colorado.html",
  "/ai-agents-small-business-evergreen": "ai-agents-small-business-evergreen.html",
};

function load(name: string): string | null {
  const candidates = [
    join(__dirname, "landers", name),
    join(__dirname, "seo", "landers", name),
    join(process.cwd(), "src", "seo", "landers", name),
    join(process.cwd(), "dist", "seo", "landers", name),
    join(process.cwd(), "public", name),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return null;
}

function loadSitemap(): string | null {
  const candidates = [
    join(__dirname, "sitemap.xml"),
    join(__dirname, "seo", "sitemap.xml"),
    join(process.cwd(), "src", "seo", "sitemap.xml"),
    join(process.cwd(), "dist", "seo", "sitemap.xml"),
    join(process.cwd(), "public", "sitemap.xml"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return null;
}

export const seoLandersRouter = Router();

for (const [route, file] of Object.entries(PAGES)) {
  seoLandersRouter.get(route, (_req: Request, res: Response) => {
    const html = load(file);
    if (!html) {
      res.status(404).type("text").send("Not found");
      return;
    }
    res.type("html").send(html);
  });
}

seoLandersRouter.get("/sitemap.xml", (_req: Request, res: Response) => {
  const xml = loadSitemap();
  if (!xml) {
    res.status(404).type("text").send("Not found");
    return;
  }
  res.type("application/xml").send(xml);
});

export default seoLandersRouter;
