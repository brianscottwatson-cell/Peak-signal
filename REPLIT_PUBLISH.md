# Replit publish: copy about.html and images/

`artifacts/api-server/build.mjs` is not in this repo. This repository holds `static-site/` (and the Express router). The Replit app is what copies those files into `dist/` at publish time. Apply the diff below in the Replit repo, then rebuild and publish.

The static-site router already serves both routes. No router change is required for this copy:

- `GET /about` and `GET /about.html` read `about.html`
- `GET /images/cht-before-after.webp` reads `images/cht-before-after.webp` and sends `image/webp`

The router looks in `dist/static-site/` (among other candidates). An HTML-only copy leaves the image 404 on Autoscale.

## Diff to apply in `artifacts/api-server/build.mjs`

The block below is the copy this repo's router expects, around the existing copies of `index.html`, `contact.html`, `privacy.html`, `terms.html`, `robots.txt`, and `google166e848c42566a74.html` (described near line 141). Match the variable names already in that file if they differ (`copyFileSync`, `srcStatic`, `distStatic`).

```diff
--- a/artifacts/api-server/build.mjs
+++ b/artifacts/api-server/build.mjs
@@ -1,6 +1,6 @@
-import { copyFileSync, mkdirSync } from "node:fs";
+import { copyFileSync, cpSync, mkdirSync } from "node:fs";
 import { dirname, join } from "node:path";
@@
-  for (const name of [
-    "index.html",
-    "contact.html",
-    "privacy.html",
-    "terms.html",
-    "robots.txt",
-    "google166e848c42566a74.html",
-  ]) {
+  for (const name of [
+    "index.html",
+    "about.html",
+    "contact.html",
+    "privacy.html",
+    "terms.html",
+    "robots.txt",
+    "google166e848c42566a74.html",
+  ]) {
     copyFileSync(join(srcStatic, name), join(distStatic, name));
   }
+  cpSync(join(srcStatic, "images"), join(distStatic, "images"), { recursive: true });
```

`cpSync` copies the whole `images/` directory, including `cht-before-after.webp`, into `dist/static-site/images/`.

If that build script copies with a glob such as `src/static-site/*.html` instead of a filename list, keep the glob (it already picks up `about.html`) and add only the `cpSync` line. `*.html` does not copy `images/`.

## Check after publish

```
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/about
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/images/cht-before-after.webp
```

Both should print `200`.
