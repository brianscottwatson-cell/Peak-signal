/**
 * Colorado Hot Tub inbound — ring owners ~10s then Grok Voice.
 * Mount at /api/cht-voice. Do NOT mount over Peak /api/voice.
 * XAI_API_KEY from env only.
 *
 * Ring: CHT_RING_SHOP=1 Dials CHT_SHOP_NUMBER (+19705312897 website shop).
 * CHT_RING_NUMBERS is optional extra lines only. Never Dial inbound Called
 * (self-dial loop if that DID is the shop line).
 * Hangup: Formspree shop (CHT_FORMSPREE → intended info@coloradohottubllc.com)
 * + Peak form. Recording is a URL in the body — Formspree cannot attach MP3s.
 */
import { Router, type Express, type Request, type Response } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import WebSocket from "ws";
import { persistChtCall } from "./cht-call-store";
import {
  DEFAULT_SHOP_E164,
  dialTwiml,
  phoneReadbackHint,
  resolveRingTargets,
  ringFirstEnabled,
  speakUsNanp,
} from "./cht-phone";

const HOSTNAME = (process.env.HOSTNAME || "peak-signal.replit.app").replace(/^https?:\/\//, "");
const SHOP = process.env.CHT_SHOP_NUMBER || DEFAULT_SHOP_E164;
function ringShopEnabled(): boolean {
  return ringFirstEnabled(process.env.CHT_RING_SHOP || "", process.env.CHT_RING_NUMBERS || "");
}
/** Shop Formspree. Default xgogybaj — confirm in Formspree that it emails info@coloradohottubllc.com. */
const FORMSPREE_SHOP = process.env.CHT_FORMSPREE || "https://formspree.io/f/xgogybaj";
const FORMSPREE_PEAK = process.env.PEAK_FORMSPREE || "https://formspree.io/f/mgobgrlr";
const XAI_URL = process.env.XAI_REALTIME_URL || "wss://api.x.ai/v1/realtime?model=grok-voice-latest";
/** Spoken opening only — no recording disclosure. Intake-only lock 2026-09-16. Need question locked from live testing. Twilio recording still starts in startTwilioRecording(). */
const GREET = "Thanks for calling Colorado Hot Tub. We can't come to the phone right now — I can take a quick message for the team and they'll get back to you as soon as possible. What were you calling about today?";

type CallState = {
  name: string;
  phone: string;
  location: string;
  customer: string;
  need: string;
  summary: string;
  from: string;
  called: string;
  turns: { role: "agent" | "caller"; text: string }[];
  emailed: boolean;
  recordingEmailed: boolean;
  confirmed: boolean;
  agentConnected: boolean;
  recordingUrl: string;
  recordingSid: string;
  twilioCallSid: string;
};
const calls = new Map<string, CallState>();

function state(sid: string): CallState {
  if (!calls.has(sid)) {
    calls.set(sid, {
      name: "",
      phone: "",
      location: "",
      customer: "",
      need: "",
      summary: "",
      from: "",
      called: "",
      turns: [],
      emailed: false,
      recordingEmailed: false,
      confirmed: false,
      agentConnected: false,
      recordingUrl: "",
      recordingSid: "",
      twilioCallSid: "",
    });
  }
  return calls.get(sid)!;
}

function loadInstructions(): string {
  try {
    return readFileSync(join(__dirname, "cht-prompt.md"), "utf8");
  } catch {
    return "You are the Colorado Hot Tub message-taker (intake-only). Opening already spoken, including: What were you calling about today? Collect that need first, then name, location, confirm caller-ID phone in 3-3-4 groups with a pause between groups, existing or new customer — one question per turn. Ask the need with those exact words if not yet answered. Do not pitch, quote prices, or dump product info. Owners follow up.";
  }
}

const tools = [
  { type: "web_search" },
  {
    type: "function",
    name: "log_caller",
    description: "Save caller name, phone, location, need, and existing/new as you learn them.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        location: { type: "string" },
        need: { type: "string" },
        customer: { type: "string", description: "existing or new customer" },
      },
    },
  },
  {
    type: "function",
    name: "confirm_message",
    description: "After intake: name, phone, location, need, existing/new. summary = clean 2-5 sentence recap.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        location: { type: "string" },
        need: { type: "string" },
        customer: { type: "string", description: "existing or new customer" },
        summary: { type: "string" },
      },
      required: ["name", "need", "summary"],
    },
  },
  {
    type: "function",
    name: "request_callback",
    description: "Caller wants Justin or Heather to call back.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        window: { type: "string" },
        reason: { type: "string" },
      },
      required: ["reason"],
    },
  },
];

function apply(st: CallState, args: Record<string, any>) {
  if (args.name) st.name = String(args.name).trim();
  if (args.phone) st.phone = String(args.phone).trim();
  if (args.location) st.location = String(args.location).trim();
  if (args.customer) st.customer = String(args.customer).trim();
  if (args.need) st.need = String(args.need).trim();
  if (args.summary) st.summary = String(args.summary).trim();
  if (args.reason && !st.need) st.need = String(args.reason).trim();
}

/** Write live call fields to data/cht-calls.json for the owner dashboard. Skips non-Twilio sids. */
function persist(sid: string, st: CallState) {
  try {
    persistChtCall({
      callSid: sid,
      name: st.name,
      phone: st.phone || st.from,
      need: st.need,
      summary: st.summary,
      recordingUrl: st.recordingUrl,
      turns: st.turns,
    });
  } catch (e: any) {
    console.error("cht-voice persist failed", sid, e?.message || e);
  }
}

function handleTool(st: CallState, name: string, args: Record<string, any>): string {
  if (name === "log_caller") {
    apply(st, args);
    const phone = st.phone || st.from;
    return JSON.stringify({ ok: true, phone, phoneReadback: phoneReadbackHint(phone) });
  }
  if (name === "confirm_message") {
    apply(st, args);
    st.confirmed = true;
    const phone = st.phone || st.from;
    return JSON.stringify({
      ok: true,
      confirmed: { name: st.name, phone, location: st.location, need: st.need, customer: st.customer },
      phoneReadback: phoneReadbackHint(phone),
    });
  }
  if (name === "request_callback") {
    apply(st, args);
    return JSON.stringify({ ok: true, phoneReadback: phoneReadbackHint(st.phone || st.from) });
  }
  return JSON.stringify({ error: "unknown tool" });
}

function formatTurns(st: CallState): string {
  if (!st.turns.length) return "(no transcript turns)";
  return st.turns.map((t) => `[${t.role === "agent" ? "Agent" : "Caller"}]: ${t.text}`).join("\n\n");
}

function buildSummary(st: CallState, from: string): string {
  if (st.summary.trim()) return st.summary.trim();
  const parts: string[] = [];
  if (st.name) parts.push(`Name: ${st.name}.`);
  parts.push(`Phone: ${st.phone || from || "(unknown)"}.`);
  if (st.location) parts.push(`Location: ${st.location}.`);
  if (st.need) parts.push(`Looking for: ${st.need}.`);
  if (st.customer) parts.push(`Customer: ${st.customer}.`);
  return parts.join(" ") || "Call completed; details incomplete.";
}


async function startTwilioRecording(callSid: string, st: CallState) {
  const account = process.env.TWILIO_ACCOUNT_SID || "";
  const token = process.env.TWILIO_AUTH_TOKEN || "";
  if (!account || !token || !callSid || callSid === "unknown") {
    console.log("cht-voice recording skip — missing TWILIO_ACCOUNT_SID/AUTH_TOKEN or CallSid");
    return;
  }
  const callback = `https://${HOSTNAME}/api/cht-voice/recording`;
  const body = new URLSearchParams({
    RecordingStatusCallback: callback,
    RecordingStatusCallbackEvent: "in-progress completed absent",
    RecordingChannels: "dual",
  });
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account}/Calls/${encodeURIComponent(callSid)}/Recordings.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${account}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const text = (await r.text()).slice(0, 300);
    console.log("cht-voice recording start", callSid, r.status, text);
    if (r.ok) {
      try {
        const j = JSON.parse(text);
        if (j.sid) st.recordingSid = String(j.sid);
      } catch { /* ignore */ }
    }
  } catch (e: any) {
    console.error("cht-voice recording start failed", e?.message || e);
  }
}

function shortSummary(st: CallState, from: string): string {
  const phone = st.phone || from || st.from || "(unknown)";
  const lines = [
    `Name: ${st.name || "(not given)"}`,
    `Phone: ${phone}`,
    `Location: ${st.location || "(not given)"}`,
    `Need: ${st.need || "(not given)"}`,
    `Customer: ${st.customer || "(not given)"}`,
  ];
  if (st.summary.trim()) lines.push(`Notes: ${st.summary.trim()}`);
  else {
    const callerBits = st.turns.filter((x) => x.role === "caller").map((x) => x.text).slice(0, 3);
    if (callerBits.length) lines.push(`Key caller lines: ${callerBits.join(" | ").slice(0, 400)}`);
  }
  return lines.join("\n");
}

async function postFormspree(url: string, payload: Record<string, string>, label: string): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = (await r.text()).slice(0, 120);
    console.log("cht formspree", label, r.status, text);
    return r.ok;
  } catch (e: any) {
    console.error("cht formspree", label, "error", e?.message || e);
    return false;
  }
}

async function emailShop(st: CallState, from: string, sid: string, opts?: { recordingOnly?: boolean }) {
  const recordingOnly = !!(opts && opts.recordingOnly);
  if (recordingOnly) {
    if (st.recordingEmailed || !st.recordingUrl) return;
  } else if (st.emailed) {
    return;
  }
  const phone = st.phone || from || st.from || "";
  const agented = st.agentConnected || st.turns.some((t) => t.role === "agent");
  const rich = !!(st.name || st.need || st.summary || st.turns.some((t) => t.role === "caller"));
  if (!recordingOnly && !rich && !(agented && phone)) {
    console.log("cht-voice skip empty hangup", sid, "from", phone, "agent", agented, "turns", st.turns.length);
    return;
  }
  // Recording is a URL in the message. Formspree cannot attach Twilio MP3 binaries.
  const recLine = st.recordingUrl
    ? `Recording: ${st.recordingUrl}`
    : "Recording: processing (Twilio will send URL when ready — or set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN)";
  const body = recordingOnly
    ? [
        "Colorado Hot Tub — call recording ready",
        "(Draft for shop. Do not treat as sent-as-Heather.)",
        "",
        `CallSid: ${sid}`,
        `Client name: ${st.name || "(not given)"}`,
        `Client phone: ${phone || "(unknown)"}`,
        recLine,
      ].join("\n")
    : [
        "Colorado Hot Tub — after-hours voice summary",
        "(Draft for shop. Do not treat as sent-as-Heather.)",
        "",
        `CallSid: ${sid}`,
        shortSummary(st, from),
        "",
        recLine,
        "",
        "(Full transcript kept in server logs only — not emailed.)",
      ].join("\n");
  const subject = recordingOnly
    ? `CHT voice recording — ${st.name || phone || "inbound"}`
    : `CHT voice — ${st.name || phone || "inbound"}`;
  const peakPayload: Record<string, string> = {
    _subject: subject,
    message: body,
    phone,
    name: st.name || "CHT inbound voice",
    interest: "cht-voice",
    _cc: "brianscottwatson@gmail.com",
  };
  const shopPayload: Record<string, string> = {
    _subject: subject,
    message: body,
    phone,
    name: st.name || "CHT inbound voice",
    _cc: "brianscottwatson@gmail.com",
  };
  const peakOk = await postFormspree(FORMSPREE_PEAK, peakPayload, "peak-mgobgrlr");
  // Shop form (CHT_FORMSPREE) is the shop inbox — intended info@coloradohottubllc.com.
  // Confirm that destination in Formspree; this code does not change Formspree routing.
  const shopOk = await postFormspree(FORMSPREE_SHOP, shopPayload, "shop-xgogybaj");
  if (peakOk || shopOk) {
    if (recordingOnly) st.recordingEmailed = true;
    else {
      st.emailed = true;
      if (st.recordingUrl) st.recordingEmailed = true;
    }
    console.log("cht-voice emailed", sid, "peak", peakOk, "shop", shopOk, "recordingOnly", recordingOnly);
  } else {
    console.error("cht-voice email both Formspree failed", sid);
  }
}

export const chtVoiceRouter = Router();

/** Grok Voice stream TwiML (after ring timeout, or when ring is off / unsafe). */
function streamTwiml(sid: string): string {
  const streamUrl = `wss://${HOSTNAME}/api/cht-voice/stream/${encodeURIComponent(sid)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" track="inbound_track" />
  </Connect>
</Response>`;
}

function sayFallback(): string {
  const shop = speakUsNanp(SHOP);
  const spoken = shop ? `${shop.groups[0]}. ${shop.groups[1]}. ${shop.groups[2]}` : "nine seven zero. Five three one. Two eight nine seven";
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you for calling Colorado Hot Tub. Please call us at ${spoken}.</Say></Response>`;
}

function seedInbound(req: Request, sid: string): CallState {
  const st = state(sid);
  if (req.body?.From) {
    st.from = String(req.body.From);
    if (!st.phone) st.phone = st.from;
  }
  const called = String(req.body?.Called || req.body?.To || "");
  if (called) st.called = called;
  persist(sid, st);
  return st;
}

/** Inbound: ring owners ~10s when enabled, else Grok. Never Dial the Called number. */
chtVoiceRouter.post("/", (req: Request, res: Response) => {
  const sid = String(req.body?.CallSid || crypto.randomBytes(8).toString("hex"));
  const st = seedInbound(req, sid);

  if (ringShopEnabled()) {
    const targets = resolveRingTargets({
      called: st.called || String(req.body?.Called || req.body?.To || ""),
      from: st.from,
      shop: SHOP,
      ringNumbersRaw: process.env.CHT_RING_NUMBERS || "",
    });
    if (targets.length) {
      console.log("cht-voice ring-first", sid, "targets", targets.join(","), "called", st.called);
      res.type("text/xml").send(dialTwiml({ hostname: HOSTNAME, targets, timeoutSec: 10 }));
      return;
    }
    console.log("cht-voice skip ring — no safe targets (loop guard)", sid, "called", st.called, "shop", SHOP);
  }

  if (!process.env.XAI_API_KEY) {
    console.error("cht-voice: XAI_API_KEY missing");
    res.type("text/xml").send(sayFallback());
    return;
  }
  res.type("text/xml").send(streamTwiml(sid));
});

/** After Dial: if no human answer, connect Grok Voice stream */
chtVoiceRouter.post("/agent", (req: Request, res: Response) => {
  const sid = String(req.body?.CallSid || "unknown");
  const st = seedInbound(req, sid);
  const dialStatus = String(req.body?.DialCallStatus || "");

  // Human answered and finished — do not start agent
  if (dialStatus === "completed" || dialStatus === "answered") {
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
    return;
  }

  if (!process.env.XAI_API_KEY) {
    console.error("cht-voice: XAI_API_KEY missing");
    res.type("text/xml").send(sayFallback());
    return;
  }
  res.type("text/xml").send(streamTwiml(sid));
});

chtVoiceRouter.post("/status", async (req: Request, res: Response) => {
  const sid = String(req.body?.CallSid || "unknown");
  const st = seedInbound(req, sid);
  if (String(req.body?.CallStatus || "") === "completed") {
    await emailShop(st, st.from || String(req.body?.From || ""), sid);
    persist(sid, st);
  }
  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
});

/** Twilio Recording status callback — attach URL and email if hangup already fired without it. */
chtVoiceRouter.post("/recording", async (req: Request, res: Response) => {
  const sid = String(req.body?.CallSid || "unknown");
  const st = state(sid);
  const status = String(req.body?.RecordingStatus || "");
  const url = String(req.body?.RecordingUrl || "").trim();
  const recSid = String(req.body?.RecordingSid || "").trim();
  console.log("cht-voice recording callback", sid, status, url ? "has-url" : "no-url");
  if (recSid) st.recordingSid = recSid;
  if (url && status === "completed") {
    // Twilio media is at RecordingUrl + .mp3 (or play in console)
    st.recordingUrl = url.endsWith(".mp3") || url.endsWith(".wav") ? url : `${url}.mp3`;
    persist(sid, st);
    if (st.emailed && !st.recordingEmailed) {
      await emailShop(st, st.from || "", sid, { recordingOnly: true });
    } else if (!st.emailed) {
      await emailShop(st, st.from || "", sid);
    }
  }
  res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
});

export function attachChtVoiceStream(app: Express) {
  const anyApp = app as Express & { ws?: Function };
  if (typeof anyApp.ws !== "function") {
    console.error("express-ws not attached; CHT Grok stream disabled");
    return;
  }

  anyApp.ws("/api/cht-voice/stream/:callId", (ws: WebSocket, req: Request) => {
    const callId = String(req.params.callId || "unknown");
    const st = state(callId);
    const key = process.env.XAI_API_KEY || "";
    if (!key) {
      ws.close();
      return;
    }

    let streamSid = "";
    let sessionReady = false;
    let agentBuf = "";
    let agentSpeaking = false;
    let muteUntil = 0;
    const xaiWs = new WebSocket(XAI_URL, {
      headers: { Authorization: `Bearer ${key}` },
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === "start") {
          streamSid = msg.start?.streamSid || "";
          st.agentConnected = true;
          const twSid = String(msg.start?.callSid || callId || "");
          if (twSid) st.twilioCallSid = twSid;
          void startTwilioRecording(twSid || callId, st);
          persist(twSid || callId, st);
        } else if (msg.event === "media" && (msg.media?.track === "inbound" || !msg.media?.track)) {
          if (!sessionReady || xaiWs.readyState !== WebSocket.OPEN) return;
          // Mute inbound only while agent audio is in flight (+ short echo hangover).
          // Do not extend muteUntil past playback — that would drop the start of their answer.
          if (agentSpeaking || Date.now() < muteUntil) return;
          xaiWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: msg.media.payload }));
        } else if (msg.event === "stop") {
          void (async () => {
            st.agentConnected = true;
            persist(callId, st);
            await emailShop(st, st.from || "", callId);
            try {
              xaiWs.close();
            } catch {
              /* ignore */
            }
          })();
        }
      } catch {
        /* ignore */
      }
    });

    xaiWs.on("open", () => {
      xaiWs.send(
        JSON.stringify({
          type: "session.update",
          session: {
            instructions:
              loadInstructions() +
              "\n\n## This call\nCaller ID (Twilio From), already captured — do not ask for it up front: " +
              (st.phone || st.from || "(unknown)") +
              ".\n" +
              phoneReadbackHint(st.phone || st.from) +
              "\nOne question at a time — wait for their full answer. After need, name, and location, confirm the caller-ID number using the spoken grouping above. If they give a different number, speak that new number the same way (area code. exchange. line) before asking if it is best.",
            voice: "ara",
            audio: {
              input: {
                format: { type: "audio/pcmu" },
                transcription: { model: "grok-transcribe", language_hint: "en" },
              },
              output: { format: { type: "audio/pcmu" } },
            },
            // xAI Speech-to-Speech session.update documents server_vad plus optional
            // threshold / silence_duration_ms / prefix_padding_ms / idle_timeout_ms
            // (https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech).
            // Bare { type: "server_vad" } inherits a short default silence (commonly
            // ~200ms in xAI/OpenAI-compatible stacks) and ends the turn on mid-name
            // pauses, so the agent talks over the caller. Longer silence waits for a
            // full answer.
            turn_detection: {
              type: "server_vad",
              threshold: 0.55,
              prefix_padding_ms: 400,
              silence_duration_ms: 1000,
            },
            tools,
          },
        }),
      );
    });

    xaiWs.on("message", (data: WebSocket.RawData) => {
      let message: any;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (message.type === "response.output_audio.delta" && message.delta && streamSid) {
        agentSpeaking = true;
        try {
          const bytes = Buffer.from(String(message.delta), "base64").length;
          muteUntil = Math.max(muteUntil, Date.now() + Math.ceil(bytes / 8) + 400);
        } catch {
          muteUntil = Math.max(muteUntil, Date.now() + 800);
        }
        ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: message.delta } }));
      } else if (message.type === "session.updated") {
        sessionReady = true;
        st.turns.push({ role: "agent", text: GREET });
        xaiWs.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "force_message",
              role: "assistant",
              interruptible: false,
              content: [{ type: "output_text", text: GREET }],
            },
          }),
        );
      } else if (message.type === "input_audio_buffer.speech_started" && streamSid) {
        // inbound_track echo: do not barge-in (Twilio clear) while we are still
        // playing or in the echo hangover — false speech_started would cut the
        // agent mid-sentence. After hangover, clear leftover playback only.
        if (agentSpeaking || Date.now() < muteUntil) return;
        ws.send(JSON.stringify({ event: "clear", streamSid }));
      } else if (message.type === "conversation.item.input_audio_transcription.completed" && message.transcript) {
        const text = String(message.transcript).trim();
        if (text) st.turns.push({ role: "caller", text: text.slice(0, 2000) });
      } else if (message.type === "response.output_audio_transcript.delta" && message.delta) {
        agentBuf += String(message.delta);
      } else if (message.type === "response.output_audio_transcript.done" && (message.transcript || agentBuf)) {
        const text = String(message.transcript || agentBuf).trim();
        agentBuf = "";
        if (text && text !== GREET) st.turns.push({ role: "agent", text: text.slice(0, 2000) });
      } else if (message.type === "response.done") {
        agentSpeaking = false;
        // Short echo hangover only (~400ms). Longer mute would ignore the start of their answer.
        muteUntil = Math.max(muteUntil, Date.now() + 400);
        if (agentBuf.trim()) {
          const text = agentBuf.trim();
          agentBuf = "";
          if (text && text !== GREET) st.turns.push({ role: "agent", text: text.slice(0, 2000) });
        }
      } else if (message.type === "response.output_item.done" && message.item?.type === "function_call") {
        const fn = message.item.name;
        const callIdFn = message.item.call_id;
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(message.item.arguments || "{}");
        } catch {
          /* ignore */
        }
        const result = handleTool(st, fn, args);
        persist(callId, st);
        xaiWs.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: callIdFn, output: result },
          }),
        );
        xaiWs.send(JSON.stringify({ type: "response.create" }));
      } else if (message.type === "error") {
        console.error("[cht-voice]", callId, message.error?.message || message);
      }
    });

    let hangupSent = false;
    const flushHangup = async () => {
      if (hangupSent) return;
      hangupSent = true;
      st.agentConnected = true;
      try {
        // Give Twilio a moment to POST recording-complete if it is fast
        for (let i = 0; i < 6 && !st.recordingUrl; i++) {
          await new Promise((r) => setTimeout(r, 500));
        }
        persist(callId, st);
        await emailShop(st, st.from || "", callId);
      } catch (e: any) {
        console.error("cht-voice hangup email on stream close failed", callId, e?.message || e);
      }
    };

    ws.on("close", () => {
      void flushHangup();
      try {
        xaiWs.close();
      } catch {
        /* ignore */
      }
    });
    xaiWs.on("close", () => {
      void flushHangup();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });
  });
}

export default chtVoiceRouter;
