function cookieToken(): string {
  const secret = process.env.OPS_PASSWORD || process.env.HARNESS_PASSWORD;
  if (!secret) {
    throw new Error("OPS_PASSWORD or HARNESS_PASSWORD must be set — refusing to auth with fallback");
  }
  return crypto.createHmac("sha256", secret).update("peak-ops-v1").digest("hex").slice(0, 32);
}
