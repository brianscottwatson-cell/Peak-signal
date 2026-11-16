#!/usr/bin/env node
/**
 * Rebuild static-site/tailwind.css.
 *
 * Uses Tailwind 3.4.17, the version the Play CDN served. The CSS file is
 * committed. Replit copies that file; it does not run this script.
 *
 *   npx --yes tailwindcss@3.4.17 -c scripts/tailwind.config.cjs -i scripts/tailwind.input.css -o static-site/tailwind.css --minify
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  "npx",
  [
    "--yes",
    "tailwindcss@3.4.17",
    "-c",
    "scripts/tailwind.config.cjs",
    "-i",
    "scripts/tailwind.input.css",
    "-o",
    "static-site/tailwind.css",
    "--minify",
  ],
  { cwd: root, stdio: "inherit" },
);
process.exit(result.status ?? 1);
