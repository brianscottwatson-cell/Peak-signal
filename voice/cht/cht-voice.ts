/**
 * Colorado Hot Tub inbound — ring shop 10s, then Grok Voice (not Polly).
 * Mount at /api/cht-voice. Do NOT mount over Peak /api/voice.
 * XAI_API_KEY from env only.
 */
import { Router, type Express, type Request, type Response } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import WebSocket from "ws";

const HOSTNAME = (process.env.HOSTNAME || "peak-signal.replit.app").replace(/^https?:\/\//, "");
const SHOP = process.env.CHT_SHOP_NUMBER || "+19705312897";
const FORMSPREE = process.env.CHT_FORMSPREE || "https://formspree.io/f/xgogybaj";
const XAI_URL = process.env.XAI_REALTIME_URL || "wss://api.x.ai/v1/realtime?model=grok-voice-latest";
const GREET = "Thanks for calling Colorado Hot Tub.";

type CallState = {
  name: string;
  phone: string;
  need: string;
  summary: string;
  from: string;
  turns: { role: "agent" | "caller"; text: string }[];
  emailed: boolean;
  confirmed: boolean;
};
const calls = new Map<string, CallState>();

function state(sid: string): CallState {
  if (!calls.has(sid)) {
    calls.set(sid, {
      name: "",
      phone: "",
      need: "",
      summary: "",
      from: "",
      turns: [],
      emailed: false,
      confirmed: false,
    });
  }
  return calls.get(sid)!;
}

function loadInstructions(): string {
  try {
    return readFileSync(join(__dirname, "cht-prompt.md"), "utf8");
  } catch {
    return "You are the Colorado Hot Tub phone agent. Greet, help from the live site only, never invent prices. Capture name, phone, and need.";
  }
}

const tools = [
  { type: "web_search" },
  {
    type: "function",
    name: "log_caller",
    description: "Save caller name, phone, and what they need as you learn them.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        need: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "confirm_message",
    description: "After reading back name, phone, and need. summary = clean 2-5 sentence recap.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        need: { type: "string" },
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
  if (args.need) st.need = String(args.need).trim();
  if (args.summary) st.summary = String(args.summary).trim();
  if (args.reason && !st.need) st.need = String(args.reason).trim();
}

function handleTool(st: CallState, name: string, args: Record<string, any>): string {
  if (name === "log_caller") {
    apply(st, args);
    return JSON.stringify({ ok: true });
  }
  if (name === "confirm_message") {
    apply(st, args);
    st.confirmed = true;
    return JSON.stringify({ ok: true, confirmed: { name: st.name, phone: st.phone || st.from, need: st.need } });
  }
  if (name === "request_callback") {
    apply(st, args);
    return JSON.stringify({ ok: true });
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
  if (st.need) parts.push(`Looking for: ${st.need}.`);
  return parts.join(" ") || "Call completed; details incomplete.";
}

async function emailShop(st: CallState, from: string, sid: string) {
  if (st.emailed) return;
  const hasSubstance = !!(st.name || st.need || st.summary || st.turns.some((t) => t.role === "caller"));
  if (!hasSubstance) {
    console.log("cht-voice skip empty hangup", sid);
    return;
  }
  st.emailed = true;
  const phone = st.phone || from || "";
  const body = [
    "Colorado Hot Tub — after-hours voice summary",
    "(Draft for shop. Do not treat as sent-as-Heather.)",
    "",
    `Client name: ${st.name || "(not given)"}`,
    `Client phone: ${phone || "(unknown)"}`,
    `What they're looking for: ${st.need || "(not given)"}`,
    "",
    "===== SUMMARY =====",
    buildSummary(st, from),
    "",
    "===== TRANSCRIPT =====",
    formatTurns(st),
  ].join("\n");
  const payload: Record<string, string> = {
    _subject: `CHT voice — ${st.name || phone || "inbound"}`,
    message: body,
    phone,
    name: st.name || "CHT inbound voice",
    _cc: "brianscottwatson@gmail.com",
  };
  try {
    await fetch(FORMSPREE, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e: any) {
    console.error("cht formspree failed", e?.message || e);
    st.emailed = false;
  }
}

export const chtVoiceRouter = Router();

/** Inbound webhook: ring shop 10s, then action → /agent */
chtVoiceRouter.post("/", (req: Request, res: Response) => {
  const sid = String(req.body?.CallSid || crypto.randomBytes(8).toString("hex"));
  const st = state(sid);
  st.from = String(req.body?.From || "");
  const action = `https://${HOSTNAME}/api/cht-voice/agent`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="10" action="${action}" method="POST">
    <Number>${SHOP}</Number>
  </Dial>
</Response>`;
  res.type("text/xml").send(twiml);
});

/** After Dial: if no human answer, connect Grok Voice stream */
chtVoiceRouter.post("/agent", (req: Request, res: Response) => {
  const sid = String(req.body?.CallSid || "unknown");
  const st = state(sid);
  if (req.body?.From) st.from = String(req.body.From);
  const dialStatus = String(req.body?.DialCallStatus || "");

  // Human answered and finished — do not start agent
  if (dialStatus === "completed" || dialStatus === "answered") {
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
    return;
  }

  if (!process.env.XAI_API_KEY) {
    console.error("cht-voice: XAI_API_KEY missing");
    res.type("text/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thanks for calling Colorado Hot Tub. Please call us at nine seven zero, five three one, two eight nine seven.</Say></Response>`,
    );
    return;
  }

  const streamUrl = `wss://${HOSTNAME}/api/cht-voice/stream/${encodeURIComponent(sid)}`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" track="inbound_track" />
  </Connect>
</Response>`;
  res.type("text/xml").send(twiml);
});

chtVoiceRouter.post("/status", async (req: Request, res: Response) => {
  const sid = String(req.body?.CallSid || "unknown");
  const st = state(sid);
  if (req.body?.From) st.from = String(req.body.From);
  if (String(req.body?.CallStatus || "") === "completed") {
    await emailShop(st, st.from || String(req.body?.From || ""), sid);
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
        } else if (msg.event === "media" && (msg.media?.track === "inbound" || !msg.media?.track)) {
          if (!sessionReady || xaiWs.readyState !== WebSocket.OPEN) return;
          if (agentSpeaking || Date.now() < muteUntil) return;
          xaiWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: msg.media.payload }));
        } else if (msg.event === "stop") {
          xaiWs.close();
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
            instructions: loadInstructions(),
            voice: "ara",
            audio: {
              input: {
                format: { type: "audio/pcmu" },
                transcription: { model: "grok-transcribe", language_hint: "en" },
              },
              output: { format: { type: "audio/pcmu" } },
            },
            turn_detection: { type: "server_vad" },
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

    ws.on("close", () => xaiWs.close());
    xaiWs.on("close", () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });
  });
}

export default chtVoiceRouter;
