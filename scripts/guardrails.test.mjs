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

test("each new public ban fails on its own seeded phrase", () => {
  const seeds = [
    ["writer-note-invented", "<p>No invented totals.</p>", "writer-note phrase"],
    ["writer-note-fake", "<p>No fake example.</p>", "writer-note phrase"],
    ["writer-note-realistic", "<p>Realistic flows only.</p>", "writer-note phrase"],
    ["writer-note-prices", "<p>Invented package prices showed up.</p>", "writer-note phrase"],
    ["writer-note-case", "<p>Fake case-study numbers.</p>", "writer-note phrase"],
    ["writer-note-education", "<p>AI Education session.</p>", "writer-note phrase"],
    ["writer-note-phone", "<p>They never answer the phone.</p>", "writer-note phrase"],
    ["vendor-name", "<p>Pax8</p>", "banned vendor name"],
  ];
  for (const [label, body, message] of seeds) {
    const root = writeFixture({ files: { "static-site/index.html": page({ body }) } });
    try {
      const guard = run("check-guardrails.mjs", root);
      assert.notEqual(guard.status, 0, label);
      assert.match(guard.output, new RegExp(`static-site/index\\.html:\\d+ \\[banned-term\\] ${message}`));
      assert.doesNotMatch(
        guard.output,
        /Pax8|No invented|No fake|Realistic flows only|invented package prices|fake case-study|ai education|never answer the phone/i,
      );
    } finally {
      cleanup(root);
    }
  }
});

test("Golden stays allowed on a public page", () => {
  const html = page({
    title: "Golden",
    h1: "Golden",
    description: "Serving Golden.",
    body: "<p>Golden, Evergreen, and the foothills.</p>",
  });
  const root = writeFixture({ files: { "static-site/index.html": html } });
  try {
    const guard = run("check-guardrails.mjs", root);
    assert.equal(guard.status, 0, guard.output);
    assert.doesNotMatch(guard.output, /\[banned-term\]/);
  } finally {
    cleanup(root);
  }
});

test("the same phrases in an ops page are outside the public check", () => {
  const root = writeFixture({
    files: {
      "static-site/index.html": page(),
      "ops/ops.html": page({
        body: "<p>No invented. No fake. Realistic flows only. Pax8. Invented package prices. Fake case-study. AI education. Never answer the phone.</p>",
      }),
    },
  });
  try {
    const guard = run("check-guardrails.mjs", root);
    assert.equal(guard.status, 0, guard.output);
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

test("a public Brian fails, including JSON-LD, llms, and the catalog", () => {
  const cases = [
    {
      label: "html",
      files: { "static-site/index.html": page({ body: "<p>Ask Brian.</p>" }) },
      file: "static-site/index.html",
    },
    {
      label: "jsonld",
      files: {
        "static-site/index.html": page({
          head: '<script type="application/ld+json">{ "founder": { "@type": "Person", "name": "Brian" } }</script>',
        }),
      },
      file: "static-site/index.html",
    },
    {
      label: "llms",
      files: {
        "static-site/index.html": page(),
        "static-site/llms.txt": "Brian at Peak Signal reviews every quote.\n",
      },
      file: "static-site/llms.txt",
    },
    {
      label: "catalog",
      files: {
        "static-site/index.html": page(),
        "static-site/telecom/catalog.json": '{ "summary": "Brian reviews it" }\n',
      },
      file: "static-site/telecom/catalog.json",
    },
  ];
  for (const item of cases) {
    const root = writeFixture({ files: item.files });
    try {
      const guard = run("check-guardrails.mjs", root);
      assert.notEqual(guard.status, 0, item.label);
      assert.match(guard.output, new RegExp(`${item.file.replaceAll(".", "\\.")}:\\d+ \\[brian\\] personal name is not public copy`), item.label);
    } finally {
      cleanup(root);
    }
  }
});

test("the from-line allowlist is one exact string in privacy and terms", () => {
  const allowed = writeFixture({
    files: {
      "static-site/index.html": page(),
      "static-site/privacy.html": page({ body: "<p>The from-line is Brian at Peak Signal.</p><p>From-line on texts: Brian at Peak Signal.</p>" }),
      "static-site/terms.html": page({ body: "<p>From-line: Brian at Peak Signal.</p>" }),
      "seo/README.md": "Voice: Brian at Peak Signal.\n",
    },
  });
  const wrongCase = writeFixture({
    files: {
      "static-site/index.html": page(),
      "static-site/privacy.html": page({ body: "<p>The from-line is brian at Peak Signal.</p>" }),
    },
  });
  const otherName = writeFixture({
    files: {
      "static-site/index.html": page(),
      "static-site/terms.html": page({ body: "<p>Ask Brian.</p>" }),
    },
  });
  const home = writeFixture({
    files: { "static-site/index.html": page({ body: "<p>Brian at Peak Signal</p>" }) },
  });
  const extended = writeFixture({
    files: {
      "static-site/index.html": page(),
      "static-site/privacy.html": page({ body: "<p>Brian at Peak Signal reviews it.</p>" }),
    },
  });
  try {
    const pass = run("check-guardrails.mjs", allowed);
    assert.equal(pass.status, 0, pass.output);
    assert.doesNotMatch(pass.output, /\[brian\]/);

    for (const [label, root, file] of [
      ["case", wrongCase, "static-site/privacy.html"],
      ["other", otherName, "static-site/terms.html"],
      ["home", home, "static-site/index.html"],
      ["extended", extended, "static-site/privacy.html"],
    ]) {
      const guard = run("check-guardrails.mjs", root);
      assert.notEqual(guard.status, 0, label);
      assert.match(guard.output, new RegExp(`${file.replaceAll(".", "\\.")}:\\d+ \\[brian\\]`), label);
    }
  } finally {
    cleanup(allowed);
    cleanup(wrongCase);
    cleanup(otherName);
    cleanup(home);
    cleanup(extended);
  }
});

test("the public site has no Brian outside the texting from-line", () => {
  const guard = run("check-guardrails.mjs", join(scriptsDir, ".."));
  assert.equal(guard.status, 0, guard.output);
  assert.doesNotMatch(guard.output, /\[brian\]/);
});

test("absent agent URLs and unpublished notes fail in public copy", () => {
  const seeds = [
    ["openapi", "See https://getpeaksignal.com/openapi.json.\n", "absent-url", "/openapi.json"],
    ["quote", "Form: https://getpeaksignal.com/telecom/quote\n", "absent-url", "/telecom/quote"],
    ["post", "POST https://getpeaksignal.com/api/telecom/quote-request\n", "absent-url", "/api/telecom/quote-request"],
    ["live", "Those pages may not be live yet.\n", "writer-note", "may not be live yet"],
    ["change", "They come in a Separate Change.\n", "writer-note", "separate change"],
  ];
  const hosts = [
    ["llms", "static-site/llms.txt", (seed) => seed],
    ["llms-full", "static-site/llms-full.txt", (seed) => seed],
    ["seo-llms", "seo/llms.txt", (seed) => seed],
    ["catalog", "static-site/telecom/catalog.json", (seed) => seed],
    ["sitemap", "seo/sitemap.xml", (seed) => seed],
    ["html", "static-site/index.html", (seed) => page({ body: `<p>${seed.trim()}</p>` })],
    ["jsonld", "static-site/telecom.html", (seed) => page({
      head: `<script type="application/ld+json">{ "urlTemplate": ${JSON.stringify(seed.trim())} }</script>`,
    })],
  ];
  for (const [seedLabel, seed, rule, shown] of seeds) {
    for (const [hostLabel, file, render] of hosts) {
      const label = `${seedLabel} in ${hostLabel}`;
      const root = writeFixture({
        files: {
          "static-site/index.html": file === "static-site/index.html" ? render(seed) : page(),
          [file]: render(seed),
        },
      });
      try {
        const guard = run("check-guardrails.mjs", root);
        assert.notEqual(guard.status, 0, label);
        const escaped = file.replaceAll(".", "\\.");
        assert.match(guard.output, new RegExp(`${escaped}:\\d+ \\[${rule}\\] '${shown.replaceAll("/", "\\/")}'`), label);
      } finally {
        cleanup(root);
      }
    }
  }
});

test("a quote API path is not the quote page, and the catalog path is live copy", () => {
  const api = writeFixture({
    files: {
      "static-site/index.html": page(),
      "static-site/llms.txt": "POST https://getpeaksignal.com/api/telecom/quote-request\n",
    },
  });
  const catalog = writeFixture({
    files: {
      "static-site/index.html": page(),
      "static-site/llms.txt": "Catalog: https://getpeaksignal.com/telecom/catalog.json\n",
      "seo/sitemap.xml": "<url><loc>https://getpeaksignal.com/telecom</loc></url>\n",
    },
  });
  try {
    const apiGuard = run("check-guardrails.mjs", api);
    assert.notEqual(apiGuard.status, 0);
    assert.match(apiGuard.output, /static-site\/llms\.txt:1 \[absent-url\] '\/api\/telecom\/quote-request' is not a live route/);
    assert.doesNotMatch(apiGuard.output, /'\/telecom\/quote' is not a live route/);

    const catalogGuard = run("check-guardrails.mjs", catalog);
    assert.equal(catalogGuard.status, 0, catalogGuard.output);
    assert.doesNotMatch(catalogGuard.output, /\[absent-url\]|\[writer-note\]/);
  } finally {
    cleanup(api);
    cleanup(catalog);
  }
});

test("an exact served route may be named, and a catch-all API proxy may not", () => {
  const served = writeFixture({
    files: {
      "static-site/index.html": page(),
      "static-site/openapi.json": "{}\n",
      "static-site/llms.txt": "API description: https://getpeaksignal.com/openapi.json\n",
      "vercel.json": JSON.stringify({
        rewrites: [{ source: "/openapi.json", destination: "/static-site/openapi.json" }],
      }),
    },
  });
  const routed = writeFixture({
    files: {
      "static-site/index.html": page(),
      "static-site/llms.txt": "Form: https://getpeaksignal.com/telecom/quote\n",
      "static-site/static-site-router.ts": 'staticSiteRouter.get("/telecom/quote", handler);\n',
    },
  });
  const noted = writeFixture({
    files: {
      "static-site/index.html": page(),
      "static-site/llms-full.txt": "The form may not be live yet.\n",
      "static-site/static-site-router.ts": 'staticSiteRouter.get("/telecom/quote", handler);\n',
    },
  });
  const catchAll = writeFixture({
    files: {
      "static-site/index.html": page(),
      "static-site/telecom/catalog.json": '{ "post": "https://getpeaksignal.com/api/telecom/quote-request" }\n',
      "vercel.json": JSON.stringify({
        rewrites: [{ source: "/api/(.*)", destination: "https://peak-signal.replit.app/api/$1" }],
      }),
    },
  });
  try {
    const servedGuard = run("check-guardrails.mjs", served);
    assert.equal(servedGuard.status, 0, servedGuard.output);

    const routedGuard = run("check-guardrails.mjs", routed);
    assert.equal(routedGuard.status, 0, routedGuard.output);

    const notedGuard = run("check-guardrails.mjs", noted);
    assert.notEqual(notedGuard.status, 0);
    assert.match(notedGuard.output, /static-site\/llms-full\.txt:1 \[writer-note\] 'may not be live yet' is not public copy/);
    assert.doesNotMatch(notedGuard.output, /\[absent-url\]/);

    const catchGuard = run("check-guardrails.mjs", catchAll);
    assert.notEqual(catchGuard.status, 0);
    assert.match(catchGuard.output, /catalog\.json:1 \[absent-url\] '\/api\/telecom\/quote-request' is not a live route/);
  } finally {
    cleanup(served);
    cleanup(routed);
    cleanup(noted);
    cleanup(catchAll);
  }
});

test("an API route counts as served only when its router marks it always answered", () => {
  const fixture = (router) => writeFixture({
    files: {
      "static-site/index.html": page(),
      "static-site/telecom.html": page({ body: '<script>fetch("/api/telecom/quote-request")</script>' }),
      "telecom/telecom-chat-router.ts": router,
    },
  });
  const always = fixture('// Always answered: the form posts here.\ntelecomChatRouter.post("/quote-request", handler);\n');
  const gated = fixture('telecomChatRouter.post("/quote-request", (req, res) => { if (!on()) return res.status(404); });\n');
  try {
    const ok = run("check-guardrails.mjs", always);
    assert.doesNotMatch(ok.output, /\[absent-url\]/, ok.output);
    const flagged = run("check-guardrails.mjs", gated);
    assert.match(flagged.output, /telecom\.html:\d+ \[absent-url\] '\/api\/telecom\/quote-request' is not a live route/);
  } finally {
    cleanup(always);
    cleanup(gated);
  }
});

test("public agent files do not name absent routes or unpublished notes", () => {
  const guard = run("check-guardrails.mjs", join(scriptsDir, ".."));
  assert.equal(guard.status, 0, guard.output);
  assert.doesNotMatch(guard.output, /\[absent-url\]|\[writer-note\]/);
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
