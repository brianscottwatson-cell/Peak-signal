#!/usr/bin/env node
/**
 * Fail when FEATURE_MAP.md and the public routes disagree.
 *
 * A public route with no "## /route" section is missing-route.
 * A section whose heading is not a public route is orphan-route.
 * On a page section, the H1 and form actions must match the HTML.
 * Source file must be the router file. Vercel file must be the root copy
 * when one exists.
 *
 * Usage:
 *   node scripts/check-feature-map.mjs [root]
 *
 * Headings are the route only, for example "## /contact" and "## /".
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatFailures, inspectHtml, listPublicRoutes, normalizeLabel } from "./public-html.mjs";

const root = process.argv[2]
  ? resolve(process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), "..");

function main() {
  const routes = listPublicRoutes(root);
  const byRoute = new Map(routes.map((route) => [route.route, route]));
  const mapPath = join(root, "FEATURE_MAP.md");
  const sections = parseFeatureMap(existsSync(mapPath) ? readFileSync(mapPath, "utf8") : "");
  const failures = [];
  const seen = new Set();

  for (const section of sections) {
    if (seen.has(section.route)) {
      failures.push({
        file: "FEATURE_MAP.md",
        line: section.line,
        rule: "duplicate-route",
        message: `${section.route} is listed more than once`,
      });
      continue;
    }
    seen.add(section.route);

    const routeField = section.fields["Route"];
    if (!routeField) {
      failures.push({
        file: "FEATURE_MAP.md",
        line: section.line,
        rule: "route-field",
        message: `${section.route} is missing its Route field`,
      });
    } else if (normalizeLabel(routeField.value) !== section.route) {
      failures.push({
        file: "FEATURE_MAP.md",
        line: routeField.line,
        rule: "route-field",
        message: `heading ${section.route} does not match Route field ${routeField.value}`,
      });
    }

    const route = byRoute.get(section.route);
    if (!route) {
      failures.push({
        file: "FEATURE_MAP.md",
        line: section.line,
        rule: "orphan-route",
        message: `entry ${section.route} has no public route`,
      });
      continue;
    }

    checkSource(section, route, failures);
    if (route.kind === "page") checkPage(section, route, failures);
    else checkNonPage(section, failures);
  }

  for (const route of routes) {
    if (seen.has(route.route)) continue;
    failures.push({
      file: route.sourceFile,
      line: 1,
      rule: "missing-route",
      message: `public route ${route.route} has no FEATURE_MAP.md entry`,
    });
  }

  if (failures.length) {
    for (const line of formatFailures(failures)) console.error(line);
    process.exitCode = 1;
    return;
  }

  console.log(`OK: ${routes.length} public routes match FEATURE_MAP.md.`);
}

function checkSource(section, route, failures) {
  const source = section.fields["Source file"];
  if (!source || normalizeLabel(source.value) !== route.sourceFile) {
    failures.push({
      file: "FEATURE_MAP.md",
      line: source?.line || section.line,
      rule: "source-file",
      message: `${route.route} source file is ${route.sourceFile}`,
    });
  }

  const vercel = section.fields["Vercel file"];
  const expected = route.vercelFile || "";
  const actual = vercel ? normalizeLabel(vercel.value) : "";
  if (actual !== expected) {
    failures.push({
      file: "FEATURE_MAP.md",
      line: vercel?.line || section.line,
      rule: "source-file",
      message: expected
        ? `${route.route} Vercel file is ${expected}`
        : `${route.route} has no separate Vercel file`,
    });
  }
}

function checkNonPage(section, failures) {
  const h1 = section.fields["H1"];
  if (!h1 || normalizeLabel(h1.value) !== "none") {
    failures.push({
      file: "FEATURE_MAP.md",
      line: h1?.line || section.line,
      rule: "h1-mismatch",
      message: `${section.route} is not a page, so H1 should be none`,
    });
  }
  const forms = section.fields["Forms"];
  if (!forms || normalizeLabel(forms.value) !== "none") {
    failures.push({
      file: "FEATURE_MAP.md",
      line: forms?.line || section.line,
      rule: "form-action-mismatch",
      message: `${section.route} is not a page, so Forms should be none`,
    });
  }
}

function checkPage(section, route, failures) {
  const expectedH1 = section.fields["H1"] ? normalizeLabel(section.fields["H1"].value) : null;
  const expectedForms = formList(section.fields["Forms"]?.value);

  for (const file of route.files.filter((item) => item.endsWith(".html"))) {
    const html = readFileSync(join(root, file), "utf8");
    const doc = inspectHtml(html);
    if (doc.h1s.length !== 1 || expectedH1 == null || doc.h1s[0].text !== expectedH1) {
      const actual = doc.h1s.map((h1) => h1.text).join(" | ") || "(none)";
      failures.push({
        file,
        line: doc.h1s[0]?.line || doc.h1s[1]?.line || 1,
        rule: "h1-mismatch",
        message: `${route.route} H1 is "${actual}" but FEATURE_MAP.md says "${expectedH1 ?? ""}"`,
      });
    }

    const actualForms = doc.forms.map((form) => form.action || "");
    if (actualForms.join("\n") !== expectedForms.join("\n")) {
      failures.push({
        file,
        line: doc.forms[0]?.line || 1,
        rule: "form-action-mismatch",
        message: `${route.route} form action is "${actualForms.join(", ") || "none"}" but FEATURE_MAP.md says "${section.fields["Forms"]?.value || "none"}"`,
      });
    }
  }
}

function formList(value) {
  const text = normalizeLabel(value);
  if (!text || text === "none") return [];
  return text.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseFeatureMap(text) {
  const sections = [];
  let current = null;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    const heading = /^##\s+(\S.*?)\s*$/.exec(line);
    if (heading) {
      current = { route: heading[1].trim(), line: i + 1, fields: {} };
      sections.push(current);
      continue;
    }
    if (!current || /^\s/.test(line)) continue;
    const field = /^-\s+([^:]+):\s*(.*)$/.exec(line);
    if (!field) continue;
    current.fields[field[1].trim()] = { value: field[2].trim(), line: i + 1 };
  }
  return sections;
}

try {
  main();
} catch (err) {
  console.error(`FEATURE_MAP.md:1 [config] ${err.message}`);
  process.exitCode = 1;
}
