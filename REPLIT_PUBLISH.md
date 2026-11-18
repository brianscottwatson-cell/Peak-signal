# Replit publish: copy about.html and images/

`artifacts/api-server/build.mjs` is not in this repo. This repository holds `static-site/` (and the Express router). The Replit app is what copies those files into `dist/` at publish time. Apply the diff below in the Replit repo, then rebuild and publish.

Copy the router files into the Replit app when you publish. The HTML files are not enough on their own: `static-site/static-site-router.ts` and `seo/seo-landers-router.ts` are what turn the duplicate `.html` URLs into 301s.

- `GET /about` reads `about.html` and returns 200. `GET /about.html` 301s to `/about` and keeps the query string. The same split applies to `/`, `/ai-deployments`, `/telecom`, `/contact`, `/privacy`, `/terms`, and the three SEO landers.
- `GET /images/cht-before-after.webp` reads `images/cht-before-after.webp` and sends `image/webp`
- `GET /images/telecom/<file>.png` reads `images/telecom/<file>.png` and sends `image/png`. Do not copy `loc8.png`.
- `GET /llms.txt` and `GET /llms-full.txt` read those files and send `text/plain`.
- `GET /telecom/catalog.json` reads `telecom/catalog.json` and sends `application/json`.
- `GET /images/peak-signal-logo.svg` reads `images/peak-signal-logo.svg` and sends `image/svg+xml`.

The router looks in `dist/static-site/` (among other candidates). An HTML-only copy leaves the image 404 on Autoscale.

## Buyer guides (`static-site/guides/`)

Four guide pages live in `static-site/guides/`. The router serves each one at a clean URL and 301s the `.html` URL to it, keeping the query string:

- `GET /guides/rural-mountain-business-internet-colorado` reads `guides/rural-mountain-business-internet-colorado.html`
- `GET /guides/ucaas-vs-traditional-business-phone-line` reads `guides/ucaas-vs-traditional-business-phone-line.html`
- `GET /guides/how-a-telecom-agent-gets-paid` reads `guides/how-a-telecom-agent-gets-paid.html`
- `GET /guides/what-an-ai-deployment-looks-like` reads `guides/what-an-ai-deployment-looks-like.html`

`build.mjs` must copy `static-site/guides/*.html` into `dist/static-site/guides/` at publish. The top-level filename list (and a `src/static-site/*.html` glob) does not reach the subdirectory, so without this the guide routes 404 on Autoscale. Add, after the filename loop:

```js
mkdirSync(join(distStatic, "guides"), { recursive: true });
for (const name of readdirSync(join(srcStatic, "guides"))) {
  if (name.endsWith(".html")) copyFileSync(join(srcStatic, "guides", name), join(distStatic, "guides", name));
}
```

Add `readdirSync` to the `node:fs` import if it is not already there. Publish the updated `static-site/static-site-router.ts`, `seo/sitemap.xml`, `static-site/llms.txt`, and `static-site/llms-full.txt` with them. After publish, each of these should print `200`:

```
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/guides/rural-mountain-business-internet-colorado
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/guides/ucaas-vs-traditional-business-phone-line
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/guides/how-a-telecom-agent-gets-paid
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/guides/what-an-ai-deployment-looks-like
```

## IndexNow after each publish

The key file is `static-site/561e3578a4683d5290c4773ae1de5a76.txt`. It is public by design and is served at `/561e3578a4683d5290c4773ae1de5a76.txt`. Add that filename to the copy list in `artifacts/api-server/build.mjs`, next to `robots.txt`:

```
"561e3578a4683d5290c4773ae1de5a76.txt",
```

Publish the updated `static-site/static-site-router.ts` as well, and rebuild the api-server. After `https://getpeaksignal.com/561e3578a4683d5290c4773ae1de5a76.txt` returns the key, submit the sitemap from a machine that can reach the public site:

```
node scripts/indexnow-ping.mjs --publish
```

That posts the sitemap URLs to `https://api.indexnow.org/indexnow`. Without `--publish` the script prints the body and does not send it. Do not add this command to GitHub Actions.

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
+    "llms.txt",
+    "llms-full.txt",
+    "561e3578a4683d5290c4773ae1de5a76.txt",
+    "google166e848c42566a74.html",
+    "tailwind.css",
+  ]) {
     copyFileSync(join(srcStatic, name), join(distStatic, name));
   }
+  mkdirSync(join(distStatic, "telecom"), { recursive: true });
+  copyFileSync(join(srcStatic, "telecom", "catalog.json"), join(distStatic, "telecom", "catalog.json"));
+  cpSync(join(srcStatic, "images"), join(distStatic, "images"), { recursive: true });
+  mkdirSync(join(distRoot, "telecom"), { recursive: true });
+  copyFileSync(join(srcRoot, "telecom/quote.html"), join(distRoot, "telecom/quote.html"));
+  copyFileSync(join(srcRoot, "telecom/openapi.json"), join(distRoot, "telecom/openapi.json"));
```

`telecom/openapi.json` is copied into `dist/telecom/` for the router. Do not add a public rewrite that serves it without the intake flag. The router returns 404 for `/openapi.json` until `PEAK_TELECOM_INTAKE_ENABLED` is exactly `1`. The quote form now lives in `static-site/telecom.html`. `telecom/quote.html` is only a redirect stub; the router no longer reads it, and the `quote.html` copy line can be dropped. Leaving it in is harmless. `GET /telecom/quote` always answers 301 to `/telecom#quote` and keeps the query string. Vercel 301s it to `/telecom`, and the page scrolls to the form when `?vendor=` is present.

`cpSync` copies the whole `images/` directory, including `cht-before-after.webp`, `images/peak-signal-logo.svg`, `images/telecom/*.png`, and `images/telecom/*.webp`, into `dist/static-site/images/`. `telecom.html`, `tailwind.css`, `llms.txt`, `llms-full.txt`, and `561e3578a4683d5290c4773ae1de5a76.txt` have to be in the filename list. `telecom/catalog.json` is not in that list: the `mkdirSync` and `copyFileSync` lines above are what publish it. A `*.html` glob does not copy `.txt`, `.css`, `.json`, or images. If the build copies images one file at a time instead of `cpSync`, add every `static-site/images/telecom/*.png`, every `static-site/images/telecom/*.webp`, and `static-site/images/peak-signal-logo.svg`. Do not add `loc8.png`.

`GET /tailwind.css` reads that file and sends `text/css`. `GET /images/telecom/<file>.webp` sends `image/webp`, and the `.png` of the same name stays as the fallback. Rebuild the api-server after the copy list includes `tailwind.css`.

If that build script copies with a glob such as `src/static-site/*.html` instead of a filename list, keep the glob (it already picks up `telecom.html`) and still add `llms.txt`, `llms-full.txt`, the `telecom/catalog.json` copy, and the `cpSync` line. A `*.html` glob does not copy `.txt`, `.json`, or `images/`.

## Check after publish

```
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/about
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/ai-deployments
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/telecom
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/images/cht-before-after.webp
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/images/telecom/ringcentral.png
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/images/telecom/ringcentral.webp
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/tailwind.css
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/561e3578a4683d5290c4773ae1de5a76.txt
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/llms.txt
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/llms-full.txt
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/telecom/catalog.json
curl -sS -o /dev/null -w "%{http_code}\n" https://getpeaksignal.com/images/peak-signal-logo.svg
```

Each should print `200`. `telecom.html`, `tailwind.css`, `llms.txt`, `llms-full.txt`, and `561e3578a4683d5290c4773ae1de5a76.txt` have to be in that filename list. A `*.html` glob would pick up `telecom.html`, but it will not pick up the text files, the stylesheet, or `telecom/catalog.json`. The router file `static-site/static-site-router.ts` also has to be the copy that serves `GET /telecom`, 301s `GET /telecom.html`, serves `GET /images/telecom/:file` for png and webp, and serves `GET /llms.txt`, `GET /llms-full.txt`, `GET /telecom/catalog.json`, `GET /tailwind.css`, `GET /561e3578a4683d5290c4773ae1de5a76.txt`, and `GET /images/peak-signal-logo.svg`. `seo/sitemap.xml` has to be the copy that lists `/telecom`. Homepage `index.html` is already on the list; publish the copy that links the telecom page.

Do not publish `data/telecom-vendor-knowledge.json`. It is the generator input and is not a public route. The public file is `static-site/telecom/catalog.json`.

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

## Telecom chat (`PEAK_TELECOM_CHAT`)

The in-page quote and opportunity chat is off unless `PEAK_TELECOM_CHAT` is exactly `1`. Leave it unset in production until Peak Signal turns it on. With the flag off, `/telecom` keeps the catalog and the quote form, and every "Request a quote" control scrolls to that form (`/telecom#quote`). The chat routes below stay inert (404). With the flag on, the chat mounts above the form, and the form stays on the page.

- `GET /api/telecom/config`
- `POST /api/telecom/address`
- `POST /api/telecom/requests`
- `GET /ops/telecom`
- `GET /ops/api/telecom/requests`
- `POST /ops/api/telecom/requests/:id`

Copy these into the Replit app and mount them when you publish. The HTML catalog is not enough on its own.

- `static-site/telecom.html`, `static-site/telecom-chat.js`, `static-site/telecom-visitor-copy.mjs`, `static-site/telecom-carrier-rules.mjs`
- `static-site/static-site-router.ts` (also serves the three chat scripts)
- `telecom/telecom-chat.mjs`, `telecom/telecom-chat-router.ts`
- `ops/ops-router.ts`, `ops/ops.html`, `ops/telecom.html`

```js
import { telecomChatRouter } from "./telecom/telecom-chat-router";
app.use("/api/telecom", telecomChatRouter);
```

`app.use("/ops", opsRouter)` stays as it is. `express.json()` has to run before these routers.

### Env and secrets

| Name | Required | Purpose |
|---|---|---|
| `PEAK_TELECOM_CHAT` | To turn the chat on | Exactly `1`. Any other value, including unset, keeps the chat and the routes off. |
| `PEAK_FORMSPREE` | No | Where the Peak Signal notification is posted. Defaults to the contact form endpoint `https://formspree.io/f/mgobgrlr`. One post, to that URL only. No visitor reply, no copy to anyone else. |
| `TELECOM_REQUESTS_PATH` | No | Queue file. Default `<cwd>/data/telecom-requests.json`. |
| `OPS_PASSWORD` | To open the review page | Existing ops login. `HARNESS_PASSWORD` still works. |

The queue is the JSON file above (or Replit DB when configured). It is not copied to GitHub. The reviewer opens it at `/ops/telecom` after logging in. Approve and decline only update that file. They do not email the visitor, order service, or contact a vendor.

Nothing on this path calls a carrier, a vendor portal, or an ordering API. The visitor's only confirmation is the message on the page.

### Seeing it before production

On a Vercel preview whose hostname contains `-git-` and ends in `.vercel.app`, open `/telecom?chat=1`. The chat renders. Submitting does not queue or email anyone while `PEAK_TELECOM_CHAT` is off. The same `?chat=1` query does nothing on `getpeaksignal.com`.

Locally, with the voice dependencies installed:

```
PEAK_TELECOM_CHAT=1 PEAK_FORMSPREE=http://127.0.0.1:9/none OPS_PASSWORD=local node telecom/dev-server.mjs
```

Then open `http://127.0.0.1:4173/telecom`. Omit `PEAK_TELECOM_CHAT` and open `http://127.0.0.1:4173/telecom?chat=1` to preview the screens without writing the queue.

## Telecom intake form (`PEAK_TELECOM_INTAKE_ENABLED`)

This flag is separate from `PEAK_TELECOM_CHAT`. Either one can be on while the other is off. Both default to off. They write the same queue file and use the same Peak Signal notification. Neither one emails the visitor or contacts a vendor.

| Flag | What it opens |
|---|---|
| `PEAK_TELECOM_CHAT=1` | In-page chat, `GET /api/telecom/config`, `POST /api/telecom/address`, `POST /api/telecom/requests` |
| `PEAK_TELECOM_INTAKE_ENABLED=1` | `POST /api/telecom/quote-request` queues the request (shared queue, loc8 draft when the partner env is set, Peak intake notice). `GET /openapi.json`. |
| Either flag | `/ops/telecom` after the existing ops login, so an operator can review the shared queue |

With both unset, `/telecom` is the catalog plus the quote form, and every "Request a quote" control scrolls to that form. `POST /api/telecom/quote-request` still answers a business request. It runs the same `acceptBusinessIntake` validation and sends Peak Signal one notice: Resend when `RESEND_API_KEY` and `PEAK_INTAKE_TO` are set, otherwise `PEAK_FORMSPREE` or the contact-form endpoint. Nothing is written to the queue and no loc8 draft is built. The notice says `Opportunity draft: intake_off` and `Queue: not stored`. The visitor gets the same message and a reference ID. If that notice cannot be sent, the endpoint answers `503`. If the API cannot be reached at all (for example an older Replit build that still 404s), the page posts the fields to the contact-form Formspree endpoint and shows the same success message without a reference ID. `PEAK_TELECOM_KILL=1` still answers `503` and nothing is sent. `/openapi.json` answers `404` with a disabled message. A filled honeypot on the quote request is rejected and is not stored or emailed.

`POST /api/telecom/quote-request` accepts JSON only. A saved request returns a reference ID and the message `Peak Signal has the request. Our team will review it before anything is submitted. Nothing is ordered automatically.` The response has no prices. Notification is one post to `PEAK_FORMSPREE` (or the contact form endpoint) for Peak Signal only.

Copy `static-site/telecom.html`, `telecom/openapi.json`, `telecom/telecom-chat.mjs`, `telecom/telecom-chat-router.ts`, `telecom/intake/business-quote.mjs`, and `static-site/static-site-router.ts` with the chat files above. Mount `telecomChatRouter` at `/api/telecom` even while both flags are off: the `/telecom` form posts to it.
