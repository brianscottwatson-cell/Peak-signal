/**
 * Serve Capture/Answer/Keep static homepage + contact HTML before SPA.
 * Mount FIRST on the public Express/static host:
 *   app.use(staticSiteRouter)
 */
import { Router, type Request, type Response } from "express";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function load(name: string): string | null {
  const candidates = [
    join(__dirname, name),
    join(__dirname, "static-site", name),
    join(process.cwd(), "src", "static-site", name),
    join(process.cwd(), "dist", "static-site", name),
    join(process.cwd(), "public", name),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return null;
}

export const staticSiteRouter = Router();

staticSiteRouter.get(["/", "/index.html"], (_req: Request, res: Response) => {
  const html = load("index.html");
  if (!html) return res.status(404).type("text").send("index missing");
  res.type("html").send(html);
});

staticSiteRouter.get(["/contact", "/contact.html"], (_req: Request, res: Response) => {
  const html = load("contact.html");
  if (!html) return res.status(404).type("text").send("contact missing");
  res.type("html").send(html);
});

export default staticSiteRouter;
