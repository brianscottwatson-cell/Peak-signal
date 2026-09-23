# Serve /robots.txt on Peak Autoscale

`GET https://getpeaksignal.com/robots.txt` returns Express `Cannot GET /robots.txt`. `GET /sitemap.xml` already returns 200 from `seoLandersRouter`. Publish this route on Replit Autoscale. Do not change page HTML. Do not touch CHT or MMDT.

GitHub merge does not update getpeaksignal.com. Autoscale Publish does.

## Steps

1. Fetch `seo/robots.txt` and `seo/seo-landers-router.ts` from `https://api.github.com/repos/brianscottwatson-cell/Peak-signal/contents/<path>` with header `Accept: application/vnd.github.raw`. Use `$GITHUB_TOKEN` when the fetch requires it.
2. Write those files to `artifacts/api-server/src/seo/robots.txt` and `artifacts/api-server/src/seo/seo-landers-router.ts`.
3. Mount `seoLandersRouter` before the SPA catch-all.

```ts
import { seoLandersRouter } from "./seo/seo-landers-router";
app.use(seoLandersRouter);
```

4. If the host mounts `staticSiteRouter` and does not mount `seoLandersRouter`, copy `static-site/robots.txt` and `static-site/static-site-router.ts` the same way. Mount `staticSiteRouter` before the SPA catch-all. `GET /robots.txt` is the first route on that router.
5. In `build.mjs`, copy `src/seo/robots.txt` into `dist/seo/` next to `sitemap.xml`. If you mount the static-site router, also copy `src/static-site/robots.txt` into `dist/static-site/`.
6. Build the api-server, then Publish Autoscale.

## After publish

```
curl -sS -D - https://getpeaksignal.com/robots.txt -o /tmp/robots.txt
```

Expect status 200. Expect `Content-Type` to include `text/plain`. Expect the saved body to end with `Sitemap: https://getpeaksignal.com/sitemap.xml`.

```
curl -sS -D - https://getpeaksignal.com/sitemap.xml -o /dev/null
```

Expect status 200. The sitemap route stays as it is.
