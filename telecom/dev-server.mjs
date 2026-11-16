/**
 * Local preview of /telecom with the chat flag.
 * PEAK_TELECOM_CHAT=1 node telecom/dev-server.mjs
 * With the flag unset, /telecom matches the catalog and /api/telecom/* is 404.
 * Open http://127.0.0.1:4173/telecom?chat=1 to see the chat without the flag.
 */
import { createRequire, register } from "node:module";
import { pathToFileURL } from "node:url";

await register(new URL("../voice/cht/esm-resolve-ts.mjs", import.meta.url));
const require = createRequire(new URL("../voice/cht/package.json", import.meta.url));
const express = require("express");

const { staticSiteRouter } = await import(pathToFileURL(new URL("../static-site/static-site-router.ts", import.meta.url).pathname));
const { telecomChatRouter } = await import("./telecom-chat-router.ts");
const { opsRouter } = await import("../ops/ops-router.ts");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use("/api/telecom", telecomChatRouter);
app.use("/ops", opsRouter);
app.use(staticSiteRouter);

const port = Number(process.env.PORT || 4173);
app.listen(port, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${port}/telecom`);
});
