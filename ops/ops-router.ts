/**
 * Peak Signal Ops / Harness dashboard.
 * Mount at /ops (HTML) and /api/ops (JSON). Password via OPS_PASSWORD env.
 * Reads client folders from brianscottwatson-cell/brain via GITHUB_TOKEN.
 * No Skimmer dollars. No secrets in responses.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";

const COOKIE = "peak_ops";
const SKIP = new Set(["_template", "peak-signal-self-test-2026-08-29", "sim-task-005"]);

type ClientCard = {
  slug: string;
  name: string;
  status: "live" | "partial" | "test" | "parked";
  blurb: string;
};

const KNOWN: Record<string, Partial<ClientCard>> = {
  "colorado-hot-tub-llc": {
    name: "Colorado Hot Tub",
    status: "live",
    blurb: "Harness: Shop Copilot. Site on Replit. No Skimmer dollars on this page.",
  },
  "peak-signal": {
    name: "Peak Signal",
    status: "live",
    blurb: "Harness: Ara on 970 + Formspree + Data Spine.",
  },
  "altspace-coworking": {
    name: "Alt Space",
    status: "test",
    blurb: "Harness: Voice Signal assessment from the 970 line.",
  },
};

function passwordOk(pw: string): boolean {
  const expect = process.env.OPS_PASSWORD || process.env.HARNESS_PASSWORD || "";
  if (!expect || !pw) return false;
  const a = Buffer.from(pw);
  const b = Buffer.from(expect);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function cookieToken(): string {
  const secret = process.env.OPS_PASSWORD || process.env.HARNESS_PASSWORD || "ops";
  return crypto.createHmac("sha256", secret).update("peak-ops-v1").digest("hex").slice(0, 32);
}

function authed(req: Request): boolean {
  const c = String(req.headers.cookie || "");
  const m = c.match(new RegExp(`${COOKIE}=([^;]+)`));
  return !!(m && m[1] === cookieToken());
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!authed(req)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
}

async function ghJson(path: string): Promise<any> {
  const token = process.env.GITHUB_TOKEN || "";
  if (!token) throw new Error("GITHUB_TOKEN missing");
  const url = `https://api.github.com/repos/brianscottwatson-cell/brain/contents/${path}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "peak-signal-ops",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!r.ok) throw new Error(`github ${r.status} ${path}`);
  return r.json();
}

async function ghText(path: string): Promise<string> {
  const j = await ghJson(path);
  if (j.encoding === "base64" && j.content) {
    return Buffer.from(j.content.replace(/\n/g, ""), "base64").toString("utf8");
  }
  return "";
}

function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function stripSkimmerDollars(s: string): string {
  // Never surface Skimmer order totals / Rate sums in the UI.
  return s
    .replace(/\$[\d,]+(?:\.\d{2})?/g, "[amount withheld]")
    .replace(/\bSUM\(Rate\)/gi, "[metric withheld]")
    .replace(/\bSkimmer\s+(?:order|invoice|revenue|total)[^\n]*/gi, "Skimmer: quotes live in browser — no feed on this page.");
}

function parseBacklog(md: string): { open: string[]; done: string[] } {
  const open: string[] = [];
  const done: string[] = [];
  const lines = md.split("\n");
  let section = "";
  for (const line of lines) {
    if (/^##\s+Open/i.test(line)) section = "open";
    else if (/^##\s+Done/i.test(line)) section = "done";
    else if (/^\|\s*[A-Z0-9-]+\s*\|/.test(line) && !/^\|\s*-+/.test(line) && !/^\|\s*ID\s*\|/i.test(line)) {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        const item = stripSkimmerDollars(`${cells[0]} — ${cells[1]}`);
        if (section === "done") done.push(item);
        else if (section === "open") open.push(item);
      }
    }
  }
  return { open: open.slice(0, 12), done: done.slice(0, 8) };
}

function parseComms(md: string): string[] {
  const notes: string[] = [];
  const blocks = md.split(/^##\s+/m).slice(1);
  for (const b of blocks.slice(0, 8)) {
    const title = b.split("\n")[0].trim();
    const sum = (b.match(/\*\*Summary:\*\*\s*([^\n]+)/i) || [])[1] || "";
    notes.push(stripSkimmerDollars(sum ? `${title} — ${sum}` : title));
  }
  return notes;
}

function loadHtml(name: string): string {
  try {
    return readFileSync(join(__dirname, name), "utf8");
  } catch {
    return `<!DOCTYPE html><html><body><p>Missing ${name}</p></body></html>`;
  }
}

export const opsRouter = Router();

opsRouter.get("/", (_req, res) => {
  res.type("html").send(loadHtml("ops.html"));
});

opsRouter.get("/c/:slug", (_req, res) => {
  res.type("html").send(loadHtml("cht.html"));
});

opsRouter.post("/api/login", (req, res) => {
  const pw = String(req.body?.password || "");
  if (!passwordOk(pw)) {
    res.status(401).json({ ok: false, error: "bad password" });
    return;
  }
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${cookieToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
  );
  res.json({ ok: true });
});

opsRouter.post("/api/logout", (_req, res) => {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
  res.json({ ok: true });
});

opsRouter.get("/api/session", (req, res) => {
  res.json({ ok: true, authed: authed(req) });
});

opsRouter.get("/api/clients", requireAuth, async (_req, res) => {
  try {
    const list = await ghJson("clients");
    const dirs = (Array.isArray(list) ? list : [])
      .filter((x: any) => x.type === "dir" && !SKIP.has(x.name))
      .map((x: any) => x.name as string);
    const clients: ClientCard[] = dirs.map((slug) => {
      const k = KNOWN[slug] || {};
      return {
        slug,
        name: k.name || titleCaseSlug(slug),
        status: (k.status as ClientCard["status"]) || "partial",
        blurb: k.blurb || "Client OS folder on brain.",
      };
    });
    // Prefer known order first
    clients.sort((a, b) => {
      const order = ["colorado-hot-tub-llc", "peak-signal", "altspace-coworking"];
      const ia = order.indexOf(a.slug);
      const ib = order.indexOf(b.slug);
      if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    res.json({ ok: true, clients });
  } catch (e: any) {
    console.error("[ops] clients", e?.message || e);
    res.status(500).json({ ok: false, error: "failed to list clients" });
  }
});

opsRouter.get("/api/clients/:slug", requireAuth, async (req, res) => {
  const slug = String(req.params.slug || "");
  if (!slug || SKIP.has(slug) || /[^a-z0-9-]/.test(slug)) {
    res.status(400).json({ ok: false, error: "bad slug" });
    return;
  }
  try {
    const files = await ghJson(`clients/${slug}`);
    const names = (Array.isArray(files) ? files : []).map((f: any) => f.name as string);
    let readme = "";
    let backlog = "";
    let comms = "";
    if (names.includes("00-README.md")) readme = await ghText(`clients/${slug}/00-README.md`);
    if (names.includes("06-backlog.md")) backlog = await ghText(`clients/${slug}/06-backlog.md`);
    if (names.includes("07-comms-log.md")) comms = await ghText(`clients/${slug}/07-comms-log.md`);

    const tasks = parseBacklog(backlog);
    const notes = parseComms(comms);
    const known = KNOWN[slug] || {};

    const plugins =
      slug === "colorado-hot-tub-llc"
        ? [
            { name: "Gmail", state: "on", detail: "info@coloradohottubllc.com. Drafts only. Owners send." },
            { name: "Drive Client OS", state: "on", detail: "colorado-hot-tub-llc well. Peak publishes." },
            { name: "Site", state: "on", detail: "coloradohottubllc.com on Replit." },
            { name: "Skimmer", state: "warn", detail: "Quotes live here. Browser session, not a plugin. No order feed on this page." },
            { name: "GBP", state: "warn", detail: "Brian is a listing manager. Not a dashboard feed." },
            { name: "Order feed", state: "off", detail: "KPI defined. No connector yet." },
          ]
        : [
            { name: "GitHub brain", state: "on", detail: `clients/${slug}/` },
            { name: "Other connectors", state: "off", detail: "Not wired on this page yet." },
          ];

    const bots =
      slug === "colorado-hot-tub-llc"
        ? [
            { name: "Shop Copilot", detail: "v6 · drafts only · copies do not live-sync" },
            { name: "Skills", detail: "shop · quotes · email" },
          ]
        : [{ name: "Peak agents", detail: "See spine + client folder." }];

    res.json({
      ok: true,
      client: {
        slug,
        name: known.name || titleCaseSlug(slug),
        status: known.status || "partial",
        blurb: known.blurb || "",
        files: names.filter((n: string) => n.endsWith(".md")).slice(0, 40),
        readmePreview: stripSkimmerDollars(readme).slice(0, 1200),
        plugins,
        bots,
        notes,
        tasks: tasks.open,
        done: tasks.done,
        projects: tasks.open.slice(0, 5),
        agentStatus: {
          source: "brain GitHub",
          lastRead: new Date().toISOString(),
          errors: [],
        },
      },
    });
  } catch (e: any) {
    console.error("[ops] client", slug, e?.message || e);
    res.status(500).json({ ok: false, error: "failed to load client" });
  }
});

export default opsRouter;
