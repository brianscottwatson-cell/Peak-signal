# Replit publish: copy about.html and images/

`artifacts/api-server/build.mjs` is not in this repo. This repository holds `static-site/` (and the Express router). The Replit app is what copies those files into `dist/` at publish time. Apply the diff below in the Replit repo, then rebuild and publish.

Copy the router files into the Replit app when you publish. The HTML files are not enough on their own: `static-site/static-site-router.ts` and `seo/seo-landers-router.ts` are what turn the duplicate `.html` URLs into 301s.

- `GET /about` reads `about.html` and returns 200. `GET /about.html` 301s to `/about` and keeps the query string. The same split applies to `/`, `/ai-deployments`, `/telecom`, `/contact`, `/privacy`, `/terms`, and the three SEO landers.
- `GET /images/cht-before-after.webp` reads `images/cht-before-after.webp` and sends `image/webp`
- `GET /images/telecom/<file>.png` reads `images/telecom/<file>.png` and sends `image/png`. Do not copy `loc8.png`.

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
+    "ai-deployments.html",
+    "telecom.html",
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

`cpSync` copies the whole `images/` directory, including `cht-before-after.webp` and `images/telecom/*.png`, into `dist/static-site/images/`. `telecom.html` has to be in the filename list. The logo files are not HTML, so a `*.html` glob does not copy them. If the build copies images one file at a time instead of `cpSync`, add every `static-site/images/telecom/*.png`. Do not add `loc8.png`.

If that build script copies with a glob such as `src/static-site/*.html` instead of a filename list, keep the glob (it already picks up `about.html`) and add only the `cpSync` line. `*.html` does not copy `images/`.

## Check after publish

```
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/about
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/ai-deployments
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/telecom
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/images/cht-before-after.webp
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/images/telecom/ringcentral.png
```

Each should print `200`. `telecom.html` has to be in that filename list. A `*.html` glob would pick it up, but the explicit list will not. The router file `static-site/static-site-router.ts` also has to be the copy that serves `GET /telecom`, 301s `GET /telecom.html`, and serves `GET /images/telecom/:file`. `seo/sitemap.xml` has to be the copy that lists the new URL. Homepage `index.html` is already on the list; publish the copy that links the new page.

## www to apex

`static-site/www-apex-redirect.ts` is new. Both routers import it. Copy it into the Replit app next to the static router:

`artifacts/api-server/src/static-site/www-apex-redirect.ts`

Also publish the updated `static-site/static-site-router.ts` and `seo/seo-landers-router.ts`. They mount the redirect themselves. No `build.mjs` filename to add: this file is TypeScript source, not one of the HTML copies. Rebuild the api-server so the new module is in the Autoscale build.

The redirect reads the Host header. `Host: www.getpeaksignal.com` on GET or HEAD returns 301 to `https://getpeaksignal.com` plus the same path and query. The apex, localhost, `*.replit.app`, and Vercel preview hosts are not `www.getpeaksignal.com`, so they are unchanged. POST and every other method are unchanged. Anything under `/api`, and any request with an `Upgrade` header, is unchanged, so Twilio webhooks and `/api/voice` websockets are not redirected.

`seo/sitemap.xml` now has a `<lastmod>` on every URL (the git commit date of that page's source file). Publish that sitemap with the seo router. The filename did not change, so the copy list does not grow. After publish:

```
curl -sI -H 'Host: www.getpeaksignal.com' https://getpeaksignal.com/telecom
```

Expect `301` and `Location: https://getpeaksignal.com/telecom`. The same request with `Host: getpeaksignal.com` stays `200`.
