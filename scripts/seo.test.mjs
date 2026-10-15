import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const scriptsDir = dirname(fileURLToPath(import.meta.url));

function page({
  h1 = "Hello",
  title,
  description = "A fine page.",
  canonical = "https://getpeaksignal.com/",
  ogTitle,
  twitterTitle,
  body = "",
} = {}) {
  if (title === undefined) title = `${h1 == null ? "Hello" : h1} | Peak Signal`;
  const og = ogTitle === undefined ? title : ogTitle;
  const twitter = twitterTitle === undefined ? title : twitterTitle;
  const titleTag = title == null ? "" : `<title>${title}</title>`;
  const descriptionTag = description == null ? "" : `<meta name="description" content="${description}">`;
  const canonicalTag = canonical == null ? "" : `<link rel="canonical" href="${canonical}">`;
  const ogTag = og == null ? "" : `<meta property="og:title" content="${og}">`;
  const twitterTag = twitter == null ? "" : `<meta name="twitter:title" content="${twitter}">`;
  const h1Tag = h1 == null ? "" : `<h1>${h1}</h1>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
${titleTag}
${descriptionTag}
${canonicalTag}
${ogTag}
${twitterTag}
</head>
<body>
${h1Tag}
${body}
</body>
</html>
`;
}

const homeSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://getpeaksignal.com/</loc></url>
</urlset>
`;

function writeSite({ files, sitemap = homeSitemap, config = null }) {
  const root = mkdtempSync(join(tmpdir(), "seo-check-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  if (sitemap != null) {
    mkdirSync(join(root, "seo"), { recursive: true });
    writeFileSync(join(root, "seo/sitemap.xml"), sitemap);
  }
  if (config != null) {
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, "scripts/seo.config.json"), config);
  }
  return root;
}

function run(root) {
  const res = spawnSync(process.execPath, [join(scriptsDir, "check-seo.mjs"), root], { encoding: "utf8" });
  return {
    status: res.status,
    output: `${res.stdout ?? ""}${res.stderr ?? ""}`,
  };
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

test("title equals the h1 plus Peak Signal after entity and whitespace normalization", () => {
  const html = page({
    h1: "Fish &#38; Chips",
    title: "\n  Fish &amp; Chips | Peak Signal\n",
  });
  const root = writeSite({ files: { "static-site/index.html": html } });
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /OK:/);
    assert.doesNotMatch(result.output, /\[title\]/);
  } finally {
    cleanup(root);
  }
});

test("a title that is not the h1 pattern fails", () => {
  const html = page({ title: "Something else" });
  const root = writeSite({ files: { "static-site/index.html": html } });
  try {
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /\[title\] title is "Something else" but expected "Hello \| Peak Signal"/);
    assert.doesNotMatch(result.output, /\[h1-count\]|\[meta-description\]|\[canonical\]|\[social-title\]|\[sitemap\]/);
  } finally {
    cleanup(root);
  }
});

test("a commented title allowlist permits a different title", () => {
  const html = page({ title: "Peak Signal • Hello" });
  const config = `{
  "titleAllowlist": {
    // Homepage leads with the brand.
    "static-site/index.html": "Peak Signal • Hello"
  }
}
`;
  const root = writeSite({ files: { "static-site/index.html": html }, config });
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.output);
    assert.doesNotMatch(result.output, /\[title\]/);
  } finally {
    cleanup(root);
  }
});

test("an allowlist entry without a comment fails", () => {
  const html = page({ title: "Peak Signal • Hello" });
  const config = `{
  "titleAllowlist": {
    "static-site/index.html": "Peak Signal • Hello"
  }
}
`;
  const root = writeSite({ files: { "static-site/index.html": html }, config });
  try {
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /\[config\] titleAllowlist entry "static-site\/index\.html" needs a comment/);
  } finally {
    cleanup(root);
  }
});

test("one h1 passes", () => {
  const root = writeSite({ files: { "static-site/index.html": page() } });
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.output);
    assert.doesNotMatch(result.output, /\[h1-count\]/);
  } finally {
    cleanup(root);
  }
});

test("zero h1s fails h1-count", () => {
  const root = writeSite({ files: { "static-site/index.html": page({ h1: null }) } });
  try {
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /\[h1-count\] expected exactly one <h1>, found 0/);
    assert.doesNotMatch(result.output, /\[title\]|\[meta-description\]|\[canonical\]|\[social-title\]|\[sitemap\]/);
  } finally {
    cleanup(root);
  }
});

test("two h1s fails h1-count", () => {
  const html = page({ body: "<h1>Second</h1>" });
  const root = writeSite({ files: { "static-site/index.html": html } });
  try {
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /\[h1-count\] expected exactly one <h1>, found 2/);
    assert.doesNotMatch(result.output, /\[title\]|\[meta-description\]|\[canonical\]|\[social-title\]|\[sitemap\]/);
  } finally {
    cleanup(root);
  }
});

test("a meta description and a canonical pass", () => {
  const root = writeSite({ files: { "static-site/index.html": page() } });
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.output);
    assert.doesNotMatch(result.output, /\[meta-description\]|\[canonical\]/);
  } finally {
    cleanup(root);
  }
});

test("a missing meta description and canonical fail", () => {
  const html = page({ description: null, canonical: null });
  const root = writeSite({ files: { "static-site/index.html": html } });
  try {
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /\[meta-description\] missing <meta name="description">/);
    assert.match(result.output, /\[canonical\] missing <link rel="canonical">/);
    assert.doesNotMatch(result.output, /\[title\]|\[h1-count\]|\[social-title\]|\[sitemap\]/);
  } finally {
    cleanup(root);
  }
});

test("og:title and twitter:title match the title after whitespace normalization", () => {
  const html = page({
    ogTitle: "Hello   |   Peak Signal",
    twitterTitle: "Hello | Peak Signal",
  });
  const root = writeSite({ files: { "static-site/index.html": html } });
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.output);
    assert.doesNotMatch(result.output, /\[social-title\]/);
  } finally {
    cleanup(root);
  }
});

test("og:title and twitter:title that do not match the title fail", () => {
  const html = page({ ogTitle: null, twitterTitle: "Other title" });
  const root = writeSite({ files: { "static-site/index.html": html } });
  try {
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /\[social-title\] missing og:title/);
    assert.match(result.output, /\[social-title\] twitter:title is "Other title" but <title> is "Hello \| Peak Signal"/);
    assert.doesNotMatch(result.output, /\[title\]|\[h1-count\]|\[meta-description\]|\[canonical\]|\[sitemap\]/);
  } finally {
    cleanup(root);
  }
});

test("a sitemap URL that maps to a page passes", () => {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://getpeaksignal.com/</loc></url>
  <url><loc>https://getpeaksignal.com/ai-example/</loc></url>
</urlset>
`;
  const root = writeSite({
    files: {
      "static-site/index.html": page(),
      "seo/landers/ai-example.html": page({
        h1: "Example",
        canonical: "https://getpeaksignal.com/ai-example",
      }),
    },
    sitemap,
  });
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /2 indexed pages, 2 sitemap URLs/);
    assert.doesNotMatch(result.output, /\[sitemap\]/);
  } finally {
    cleanup(root);
  }
});

test("a sitemap URL that does not map to a file fails", () => {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://getpeaksignal.com/</loc></url>
  <url><loc>https://getpeaksignal.com/missing-page</loc></url>
</urlset>
`;
  const root = writeSite({ files: { "static-site/index.html": page() }, sitemap });
  try {
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /seo\/sitemap\.xml:\d+ \[sitemap\] sitemap URL https:\/\/getpeaksignal\.com\/missing-page does not map to a file/);
    assert.doesNotMatch(result.output, /sitemap URL https:\/\/getpeaksignal\.com\/ does not map/);
    assert.doesNotMatch(result.output, /\[title\]|\[h1-count\]|\[meta-description\]|\[canonical\]|\[social-title\]/);
  } finally {
    cleanup(root);
  }
});
