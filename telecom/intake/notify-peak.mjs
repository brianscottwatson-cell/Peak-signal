/**
 * Email a telecom intake to Peak Signal.
 *
 * Same shape as the Colorado Hot Tub service-request mailer: Resend,
 * RESEND_API_KEY, a from address, and one message to the business.
 * The customer is not a recipient. reply_to is the visitor so Peak can
 * answer. PEAK_FORMSPREE is the fallback when Resend is not configured,
 * and that fallback has no attachment, so the JSON is also fenced in the body.
 */

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Peak Signal <onboarding@resend.dev>";

export async function sendPeakNotice({ notice, env = process.env, fetch: fetchImpl = globalThis.fetch } = {}) {
  const key = String(env.RESEND_API_KEY || "").trim();
  const to = String(env.PEAK_INTAKE_TO || "").trim();
  if (key && to) {
    const from = String(env.PEAK_INTAKE_FROM || DEFAULT_FROM).trim();
    const payload = {
      from,
      to: [to],
      subject: notice.subject,
      text: notice.text,
      attachments: [
        {
          filename: "telecom-intake.json",
          content: Buffer.from(notice.json, "utf8").toString("base64"),
        },
      ],
    };
    if (notice.replyTo) payload.reply_to = notice.replyTo;
    const response = await fetchImpl(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return { attempted: true, ok: Boolean(response && response.ok), channel: "resend", url: RESEND_URL };
  }

  const formspree = String(env.PEAK_FORMSPREE || "").trim();
  if (formspree) {
    const response = await fetchImpl(formspree, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ _subject: notice.subject, message: notice.text }),
    });
    return { attempted: true, ok: Boolean(response && response.ok), channel: "formspree", url: formspree };
  }

  return { attempted: false, ok: false, channel: "", url: "" };
}
