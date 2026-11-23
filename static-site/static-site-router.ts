/**
 * Serve the public static pages before the SPA.
 * Mount FIRST on the public Express/static host:
 *   app.use(staticSiteRouter)
 */
import { Router, type Request, type Response } from "express";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installBrotliMitigation, rejectBrotliContentEncoding } from "../voice/brotli-guard";
import { wwwApexRedirect } from "./www-apex-redirect";
import { applyQuoteLinks, formAvailable, quoteRedirectTarget, readTelecomAsset } from "../telecom/telecom-chat.mjs";

const moduleDir = typeof __dirname === "string" ? __dirname : dirname(fileURLToPath(import.meta.url));

installBrotliMitigation(typeof __filename === "string" ? __filename : undefined);

const fileCandidates = (name: string) => [
  join(moduleDir, name),
  join(moduleDir, "static-site", name),
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
staticSiteRouter.use(rejectBrotliContentEncoding);
staticSiteRouter.use(wwwApexRedirect);

function redirectClean(cleanPath: string) {
  return (req: Request, res: Response) => {
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    res.redirect(301, cleanPath + query);
  };
}

staticSiteRouter.get("/tailwind.css", (_req: Request, res: Response) => {
  const body = load("tailwind.css");
  if (!body) return res.status(404).type("text").send("css missing");
  res.type("text/css").send(body);
});

staticSiteRouter.get("/robots.txt", (_req: Request, res: Response) => {
  const body = load("robots.txt");
  if (!body) return res.status(404).type("text").send("robots missing");
  res.type("text/plain").send(body);
});

// IndexNow key. Public by design. build.mjs must copy this filename too.
staticSiteRouter.get("/561e3578a4683d5290c4773ae1de5a76.txt", (_req: Request, res: Response) => {
  const body = load("561e3578a4683d5290c4773ae1de5a76.txt");
  if (!body) return res.status(404).type("text").send("indexnow key missing");
  res.type("text/plain").send(body.trim() + "\n");
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

// Launch-hold page (noindex, not in sitemap or llms.txt). build.mjs must copy grok.html and images/grok/GrokBot-Wordmark-Wht.png.
staticSiteRouter.get("/grok", (_req: Request, res: Response) => {
  const html = load("grok.html");
  if (!html) return res.status(404).type("text").send("grok missing");
  res.type("html").send(html);
});

staticSiteRouter.get("/grok.html", redirectClean("/grok"));

// Official Grok Bot wordmark, served byte-identical. Allow-listed filename only.
staticSiteRouter.get("/images/grok/:file", (req: Request, res: Response) => {
  const raw = req.params.file;
  const file = Array.isArray(raw) ? raw[0] : raw;
  if (file !== "GrokBot-Wordmark-Wht.png") {
    return res.status(404).type("text").send("image missing");
  }
  const body = loadBuffer(`images/grok/${file}`);
  if (!body) return res.status(404).type("text").send("image missing");
  res.type("image/png").send(body);
});

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

staticSiteRouter.get("/ai-deployments", (_req: Request, res: Response) => {
  const html = load("ai-deployments.html");
  if (!html) return res.status(404).type("text").send("ai-deployments missing");
  res.type("html").send(html);
});

staticSiteRouter.get("/ai-deployments.html", redirectClean("/ai-deployments"));

staticSiteRouter.get("/telecom", (_req: Request, res: Response) => {
  const html = load("telecom.html");
  if (!html) return res.status(404).type("text").send("telecom missing");
  res.type("html").send(applyQuoteLinks(html));
});

staticSiteRouter.get("/telecom.html", redirectClean("/telecom"));

// Buyer guides. Replit build.mjs must copy static-site/guides/*.html into
// dist/static-site/guides/ (the top-level HTML list does not include them).
export const GUIDE_SLUGS = [
  "rural-mountain-business-internet-colorado",
  "ucaas-vs-traditional-business-phone-line",
  "how-a-telecom-agent-gets-paid",
  "what-an-ai-deployment-looks-like",
] as const;

for (const slug of GUIDE_SLUGS) {
  staticSiteRouter.get(`/guides/${slug}`, (_req: Request, res: Response) => {
    const html = load(`guides/${slug}.html`);
    if (!html) return res.status(404).type("text").send("guide missing");
    res.type("html").send(html);
  });

  staticSiteRouter.get(`/guides/${slug}.html`, redirectClean(`/guides/${slug}`));
}

// The quote form is on /telecom (#quote). Old links keep their ?vendor= query.
staticSiteRouter.get("/telecom/quote", (req: Request, res: Response) => {
  res.redirect(301, quoteRedirectTarget(req.originalUrl));
});

staticSiteRouter.get("/openapi.json", (_req: Request, res: Response) => {
  if (!formAvailable()) {
    res.status(404).json({ ok: false, error: "disabled" });
    return;
  }
  const body = readTelecomAsset("openapi.json");
  if (!body) {
    res.status(404).json({ ok: false, error: "disabled" });
    return;
  }
  res.type("application/json").send(body);
});

function sendScript(res: Response, name: string) {
  const body = load(name);
  if (!body) return res.status(404).type("text").send("missing");
  res.setHeader("Content-Type", "text/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(body);
}

staticSiteRouter.get("/telecom-chat.js", (_req: Request, res: Response) => {
  sendScript(res, "telecom-chat.js");
});

staticSiteRouter.get("/telecom-visitor-copy.mjs", (_req: Request, res: Response) => {
  sendScript(res, "telecom-visitor-copy.mjs");
});

staticSiteRouter.get("/telecom-carrier-rules.mjs", (_req: Request, res: Response) => {
  sendScript(res, "telecom-carrier-rules.mjs");
});

staticSiteRouter.get("/llms.txt", (_req: Request, res: Response) => {
  const body = load("llms.txt");
  if (!body) return res.status(404).type("text").send("llms missing");
  res.type("text/plain; charset=utf-8").send(body);
});

staticSiteRouter.get("/llms-full.txt", (_req: Request, res: Response) => {
  const body = load("llms-full.txt");
  if (!body) return res.status(404).type("text").send("llms-full missing");
  res.type("text/plain; charset=utf-8").send(body);
});

// Public vendor list. Replit build.mjs must also copy
// src/static-site/telecom/catalog.json to dist/static-site/telecom/catalog.json.
staticSiteRouter.get("/telecom/catalog.json", (_req: Request, res: Response) => {
  const body = load("telecom/catalog.json");
  if (!body) return res.status(404).type("text").send("catalog missing");
  res.type("application/json; charset=utf-8").send(body);
});

// Logos. Replit build.mjs must copy static-site/images/telecom/*.webp and the
// PNG fallbacks into dist/static-site/images/telecom/ (the HTML list does not).
staticSiteRouter.get("/images/telecom/:file", (req: Request, res: Response) => {
  const raw = req.params.file;
  const file = Array.isArray(raw) ? raw[0] : raw;
  if (!file || !/^[a-z0-9-]+\.(png|webp)$/.test(file)) return res.status(404).type("text").send("image missing");
  const body = loadBuffer(`images/telecom/${file}`);
  if (!body) return res.status(404).type("text").send("image missing");
  res.type(file.endsWith(".webp") ? "image/webp" : "image/png").send(body);
});

// Binary. Replit build.mjs must also copy src/static-site/images/cht-before-after.webp
// to dist/static-site/images/cht-before-after.webp (the HTML copy glob does not).
staticSiteRouter.get("/images/peak-signal-logo.svg", (_req: Request, res: Response) => {
  const body = loadBuffer("images/peak-signal-logo.svg");
  if (!body) return res.status(404).type("text").send("logo missing");
  res.type("image/svg+xml").send(body);
});

staticSiteRouter.get("/images/cht-before-after.webp", (_req: Request, res: Response) => {
  const body = loadBuffer("images/cht-before-after.webp");
  if (!body) return res.status(404).type("text").send("image missing");
  res.type("image/webp").send(body);
});

export default staticSiteRouter;
