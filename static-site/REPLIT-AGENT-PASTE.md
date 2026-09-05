# Replit Agent — Peak Autoscale: serve GitHub static home + contact (Peak only)

Do NOT touch CHT, MMDT, or other clients.

Live getpeaksignal.com still serves the old Vite SPA (`index-qKYIH-Tv.js`, title "AI Automation for Evergreen Businesses"). GitHub already has the Capture/Answer/Keep pages. Mount them so Autoscale HTML matches GitHub.

## Goal
- `GET /` HTML contains H1 **More customers. Fewer hires.**
- `GET /contact` HTML contains H1 **Book your assessment**
- No SPA `#root` shell for those two routes
- Leave `/api/voice` alone

## Steps
1. `mkdir -p artifacts/api-server/src/static-site`
2. Fetch (use `$GITHUB_TOKEN` if needed):
   - https://api.github.com/repos/brianscottwatson-cell/Peak-signal/contents/static-site/index.html → `artifacts/api-server/src/static-site/index.html` (Accept: application/vnd.github.raw)
   - same for `contact.html` and `static-site-router.ts`
3. In the Express entry that serves the public site / api-server (`artifacts/api-server/src/index.ts` or routes), **before** SPA catch-all:
   ```ts
   import { staticSiteRouter } from "./static-site/static-site-router";
   app.use(staticSiteRouter);
   ```
4. In `build.mjs`, copy `src/static-site/*.html` into `dist/static-site/` (and ensure the compiled router can `readFileSync` them — paths already try `__dirname` and `dist/static-site`).
5. Build api-server, **Publish Autoscale**.
6. Verify:
   ```
   curl -sS https://getpeaksignal.com/ | grep -F "More customers"
   curl -sS https://getpeaksignal.com/contact | grep -F "Book your assessment"
   ```
   Neither response should contain `id="root"` as the only body.

Commits: homepage 8083c74, contact 7eedc6f (content mirrored under static-site/ with root paths).
