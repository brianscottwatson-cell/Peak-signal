/**
 * Telecom request queue.
 *
 * Replit Autoscale disk is ephemeral, and this app does not already use
 * Postgres. When REPLIT_DB_URL is set (Replit injects it on Autoscale),
 * the queue is stored in Replit DB. Dev and tests use the local JSON file
 * when that variable is absent. A file write is still attempted as a cache;
 * if the disk rejects it and Replit DB is configured, the remote write stands.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const QUEUE_KEY = "peak-telecom-requests";

export function createDurableQueue({ file, env = process.env, fetch: fetchImpl = globalThis.fetch } = {}) {
  const dbUrl = String(env.REPLIT_DB_URL || "").trim().replace(/\/$/, "");
  const driver = dbUrl ? "replit" : "file";
  let memory = null;
  let hydrated = false;
  let chain = Promise.resolve();

  function read() {
    if (memory) return memory;
    memory = readFileStore(file);
    return memory;
  }

  function writeLocal(store) {
    memory = store;
    try {
      writeFileStore(file, store);
    } catch (err) {
      if (!dbUrl) throw err;
    }
  }

  function track(job) {
    const pending = Promise.resolve(job).then(() => {}, () => {});
    chain = chain.then(() => pending, () => pending);
    return job;
  }

  async function mirror(store) {
    if (!dbUrl) return { ok: true, driver: "file" };
    await replitSet(dbUrl, QUEUE_KEY, store, fetchImpl);
    return { ok: true, driver: "replit" };
  }

  async function flush() {
    await chain;
  }

  async function hydrate() {
    if (hydrated) return read();
    hydrated = true;
    if (!dbUrl) return read();
    try {
      const remote = await replitGet(dbUrl, QUEUE_KEY, fetchImpl);
      if (remote && Array.isArray(remote.requests)) {
        memory = {
          version: 1,
          updatedAt: String(remote.updatedAt || new Date().toISOString()),
          requests: remote.requests,
          rates: remote.rates && typeof remote.rates === "object" ? remote.rates : {},
        };
        try {
          writeFileStore(file, memory);
        } catch {
          /* cache only */
        }
        return memory;
      }
    } catch {
      /* use the local file */
    }
    return read();
  }

  return { driver, file, read, writeLocal, mirror, track, flush, hydrate };
}

export function emptyStore() {
  return { version: 1, updatedAt: new Date().toISOString(), requests: [], rates: {} };
}

function readFileStore(file) {
  if (!file || !existsSync(file)) return emptyStore();
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return {
      version: 1,
      updatedAt: String(raw?.updatedAt || new Date().toISOString()),
      requests: Array.isArray(raw?.requests) ? raw.requests : [],
      rates: raw?.rates && typeof raw.rates === "object" ? raw.rates : {},
    };
  } catch {
    return emptyStore();
  }
}

function writeFileStore(file, store) {
  mkdirSync(dirname(file), { recursive: true });
  store.updatedAt = new Date().toISOString();
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  renameSync(tmp, file);
}

async function replitGet(dbUrl, key, fetchImpl) {
  const response = await fetchImpl(`${dbUrl}/${encodeURIComponent(key)}`);
  if (!response || !response.ok) return null;
  const text = typeof response.text === "function" ? await response.text() : "";
  if (!text) return null;
  return JSON.parse(text);
}

async function replitSet(dbUrl, key, value, fetchImpl) {
  const body = new URLSearchParams({ [key]: JSON.stringify(value) }).toString();
  const response = await fetchImpl(dbUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response || !response.ok) {
    throw new Error("queue remote save failed");
  }
}
