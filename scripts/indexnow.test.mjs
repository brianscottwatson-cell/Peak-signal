import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { indexNowBody, indexNowKey, main } from "./indexnow-ping.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the key file is public and matches the route that serves it", () => {
  const key = indexNowKey();
  assert.match(key, /^[a-f0-9]{32}$/);
  const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  const rewrite = (vercel.rewrites ?? []).find((item) => item.source === `/${key}.txt`);
  assert.ok(rewrite, "vercel.json does not serve the key file");
  assert.equal(rewrite.destination, `/static-site/${key}.txt`);
  const router = readFileSync(join(root, "static-site/static-site-router.ts"), "utf8");
  assert.match(router, new RegExp(`get\\("/${key}\\.txt"`));
  const workflow = readFileSync(join(root, ".github/workflows/guardrails.yml"), "utf8");
  assert.equal(workflow.includes("indexnow-ping.mjs"), false);
  assert.equal(workflow.includes("api.indexnow.org"), false);
});

test("the payload is the sitemap and is not sent unless --publish is passed", async () => {
  const body = indexNowBody();
  assert.equal(body.host, "getpeaksignal.com");
  assert.equal(body.keyLocation, `https://getpeaksignal.com/${body.key}.txt`);
  assert.ok(body.urlList.includes("https://getpeaksignal.com/"));
  assert.ok(body.urlList.includes("https://getpeaksignal.com/telecom"));
  assert.ok(body.urlList.includes("https://getpeaksignal.com/guides/how-a-telecom-agent-gets-paid"));
  assert.equal(body.urlList.length, 14);

  let called = false;
  const dry = await main(["node", "indexnow-ping.mjs"], {
    log() {},
    fetchImpl() {
      called = true;
      throw new Error("dry run must not fetch");
    },
  });
  assert.equal(dry.sent, false);
  assert.equal(called, false);

  let posted = null;
  const live = await main(["node", "indexnow-ping.mjs", "--publish"], {
    log() {},
    fetchImpl(url, init) {
      posted = { url, init };
      return { status: 200 };
    },
  });
  assert.equal(live.sent, true);
  assert.equal(live.status, 200);
  assert.equal(posted.url, "https://api.indexnow.org/indexnow");
  assert.equal(posted.init.method, "POST");
  assert.deepEqual(JSON.parse(posted.init.body).urlList, body.urlList);
});
