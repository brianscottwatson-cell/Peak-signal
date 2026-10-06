import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const scriptsDir = dirname(fileURLToPath(import.meta.url));

function page({ title = "Hello", description = "A fine page.", head = "", body = "", h1 = "Hello" } = {}) {
  const descriptionTag =
    description == null ? "" : `<meta name="description" content="${description}">`;
  const titleTag = title == null ? "" : `<title>${title}</title>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
${titleTag}
${descriptionTag}
${head}
</head>
<body>
${h1 == null ? "" : `<h1>${h1}</h1>`}
<p>The team answers quickly and keeps the notes. Price is $ later.</p>
${body}
</body>
</html>
`;
}

const ignored = `
<style>.Capture { color: red; }</style>
<script>var retired = "Capture"; var phrase = "AI receptionist";</script>
<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"Capture"}'></script>
<script type="application/ld+json">
{
  "@type": "FAQPage",
  "acceptedAnswer": {
    "@type": "Answer",
    "text": "The shop answers the phone and keeps notes."
  }
}
</script>
`;

function cleanMap(h1 = "Hello", forms = "none") {
  return `# Feature map

## /

- Route: /
- Source file: static-site/index.html
- Purpose: Fixture page.
- H1: ${h1}
- Key sections: none
- CTAs: none
- Forms: ${forms}
- JSON-LD @types: none
- Nav links: none
- Footer links: none
`;
}

function writeFixture({ files, map = cleanMap(), config = { priceAllowlist: [] } }) {
  const root = mkdtempSync(join(tmpdir(), "guardrails-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  writeFileSync(join(root, "FEATURE_MAP.md"), map);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts/guardrails.config.json"), JSON.stringify(config));
  return root;
}

function run(script, root) {
  const res = spawnSync(process.execPath, [join(scriptsDir, script), root], { encoding: "utf8" });
  return {
    status: res.status,
    output: `${res.stdout ?? ""}${res.stderr ?? ""}`,
  };
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

test("a clean fixture page passes both checks", () => {
  const html = page({
    head: ignored,
    body: "<!-- Capture Answer Keep -->\n<label><input type=\"checkbox\" value=\"later\"> answers and keeps</label>",
  });
  const root = writeFixture({ files: { "static-site/index.html": html } });
  try {
    const guard = run("check-guardrails.mjs", root);
    const map = run("check-feature-map.mjs", root);
    assert.equal(guard.status, 0, guard.output);
    assert.match(guard.output, /OK:/);
    assert.equal(map.status, 0, map.output);
    assert.match(map.output, /OK:/);
    assert.doesNotMatch(guard.output, /\[banned-term\]|\[price\]|\[h1-count\]|\[meta-description\]/);
  } finally {
    cleanup(root);
  }
});

test("a banned term fails with banned-term", () => {
  const html = page({ body: "<p>Please no Capture here.</p><p>signal site</p>" });
  const root = writeFixture({ files: { "static-site/index.html": html } });
  try {
    const guard = run("check-guardrails.mjs", root);
    assert.notEqual(guard.status, 0);
    assert.match(guard.output, /\[banned-term\][^\n]*'Capture' is a retired product name/);
    assert.match(guard.output, /\[banned-term\][^\n]*'Signal Site' is a retired product name/);
    assert.doesNotMatch(guard.output, /\[price\]|\[h1-count\]|\[meta-description\]|\[title\]/);
  } finally {
    cleanup(root);
  }
});

test("FAQPage schema Answer is ignored and visible Answer is not", () => {
  const html = page({
    head: `<script type="application/ld+json">
{
  "@type": "FAQPage",
  "acceptedAnswer": {
    "@type": "Answer",
    "text": "Use Answer after hours."
  }
}
</script>`,
  });
  const typeLine = html.split("\n").findIndex((line) => line.includes('"@type": "Answer"')) + 1;
  const textLine = html.split("\n").findIndex((line) => line.includes("Use Answer")) + 1;
  const root = writeFixture({ files: { "static-site/index.html": html } });
  try {
    const guard = run("check-guardrails.mjs", root);
    assert.notEqual(typeLine, textLine);
    assert.notEqual(guard.status, 0);
    assert.match(guard.output, new RegExp(`static-site/index\\.html:${textLine} \\[banned-term\\]`));
    assert.doesNotMatch(guard.output, new RegExp(`static-site/index\\.html:${typeLine} \\[banned-term\\]`));
  } finally {
    cleanup(root);
  }
});

test("two h1 elements fail with h1-count", () => {
  const html = page({ body: "<h1>Second</h1>" });
  const root = writeFixture({ files: { "static-site/index.html": html } });
  try {
    const guard = run("check-guardrails.mjs", root);
    assert.notEqual(guard.status, 0);
    assert.match(guard.output, /\[h1-count\] expected exactly one <h1>, found 2/);
    assert.doesNotMatch(guard.output, /\[banned-term\]|\[price\]|\[meta-description\]/);
  } finally {
    cleanup(root);
  }
});

test("a missing meta description fails with meta-description", () => {
  const html = page({ description: null });
  const root = writeFixture({ files: { "static-site/index.html": html } });
  try {
    const guard = run("check-guardrails.mjs", root);
    assert.notEqual(guard.status, 0);
    assert.match(guard.output, /\[meta-description\] missing <meta name="description">/);
    assert.doesNotMatch(guard.output, /\[banned-term\]|\[price\]|\[h1-count\]|\[title\]/);
  } finally {
    cleanup(root);
  }
});

test("a $49 price fails with price", () => {
  const html = page({ body: "<p>Plan $49 today.</p>" });
  const root = writeFixture({ files: { "static-site/index.html": html } });
  try {
    const guard = run("check-guardrails.mjs", root);
    assert.notEqual(guard.status, 0);
    assert.match(guard.output, /\[price\] '\$49' is not on the price allowlist/);
    assert.doesNotMatch(guard.output, /\[banned-term\]|\[h1-count\]|\[meta-description\]/);
  } finally {
    cleanup(root);
  }
});

test("an allowlisted price passes and a different price still fails", () => {
  const html = page({ body: "<p>$49 and $490</p>" });
  const root = writeFixture({
    files: { "static-site/index.html": html },
    config: { priceAllowlist: ["$49"] },
  });
  try {
    const guard = run("check-guardrails.mjs", root);
    assert.notEqual(guard.status, 0);
    assert.match(guard.output, /\[price\] '\$490' is not on the price allowlist/);
    assert.doesNotMatch(guard.output, /'\$49' is not on the price allowlist/);
  } finally {
    cleanup(root);
  }
});

test("a public route missing from the map fails with missing-route", () => {
  const root = writeFixture({
    files: {
      "static-site/index.html": page(),
      "static-site/extra.html": page({ h1: "Extra", title: "Extra" }),
    },
  });
  try {
    const map = run("check-feature-map.mjs", root);
    assert.notEqual(map.status, 0);
    assert.match(map.output, /\[missing-route\] public route \/extra has no FEATURE_MAP\.md entry/);
    assert.doesNotMatch(map.output, /\[orphan-route\]|\[h1-mismatch\]/);
  } finally {
    cleanup(root);
  }
});

test("a map entry with no route fails with orphan-route", () => {
  const map = `${cleanMap()}
## /ghost

- Route: /ghost
- Source file: static-site/ghost.html
- Purpose: Missing page.
- H1: Ghost
- Forms: none
`;
  const root = writeFixture({ files: { "static-site/index.html": page() }, map });
  try {
    const result = run("check-feature-map.mjs", root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /\[orphan-route\] entry \/ghost has no public route/);
  } finally {
    cleanup(root);
  }
});

test("an H1 that does not match the map fails with h1-mismatch", () => {
  const root = writeFixture({
    files: { "static-site/index.html": page() },
    map: cleanMap("Goodbye"),
  });
  try {
    const result = run("check-feature-map.mjs", root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /\[h1-mismatch\]/);
  } finally {
    cleanup(root);
  }
});

test("a form endpoint that does not match the map fails with form-action-mismatch", () => {
  const html = page({ body: '<form action="https://example.com/post"></form>' });
  const root = writeFixture({
    files: { "static-site/index.html": html },
    map: cleanMap("Hello", "https://formspree.io/f/expected"),
  });
  try {
    const result = run("check-feature-map.mjs", root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /\[form-action-mismatch\]/);
    assert.match(result.output, /https:\/\/example\.com\/post/);
  } finally {
    cleanup(root);
  }
});
