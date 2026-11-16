/**
 * Mount at /api/telecom. Stays 404 unless PEAK_TELECOM_CHAT=1.
 * The parent app should call express.json() first. This router parses JSON
 * only after the flag check, so a disabled route does not reveal itself.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import express from "express";
import { COPY } from "../static-site/telecom-visitor-copy.mjs";
import { handlePublicHttp, handleQuoteRequest, sharedTelecomChat } from "./telecom-chat.mjs";

export const telecomChatRouter = Router();

telecomChatRouter.get("/intake", (_req: Request, res: Response) => {
  if (!sharedTelecomChat().intakeOn()) {
    res.status(404).json({ ok: false, error: "disabled" });
    return;
  }
  res.json({ ok: true, enabled: true });
});

telecomChatRouter.post("/quote-request", (req: Request, res: Response, next: NextFunction) => {
  if (!sharedTelecomChat().intakeOn()) {
    res.status(404).json({ ok: false, error: "disabled" });
    return;
  }
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    Promise.resolve(handleQuoteRequest(req, res, sharedTelecomChat())).catch(next);
    return;
  }
  express.json({ limit: "20kb" })(req, res, (err?: unknown) => {
    if (err) {
      res.status(400).json({ ok: false, errors: [COPY.validation.unreadable] });
      return;
    }
    Promise.resolve(handleQuoteRequest(req, res, sharedTelecomChat())).catch(next);
  });
});

telecomChatRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (!sharedTelecomChat().enabled()) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    next();
    return;
  }
  express.json({ limit: "20kb" })(req, res, next);
});

telecomChatRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (!err) {
    next();
    return;
  }
  res.status(400).json({ ok: false, errors: [COPY.validation.unreadable] });
});

telecomChatRouter.use((req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(handlePublicHttp(req, res, sharedTelecomChat())).catch(next);
});

export default telecomChatRouter;
