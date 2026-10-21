/**
 * Name, town, and reason are collected before the agent closes.
 * A missing field is re-asked once. After the caller responds, the close is allowed.
 *
 * Run from voice/cht: node --experimental-strip-types cht-intake.test.ts
 */
process.env.HOSTNAME = "voice-test.example";
delete process.env.CHT_RING_SHOP;
delete process.env.CHT_RING_NUMBERS;
delete process.env.XAI_API_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;

import { register } from "node:module";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

await register(new URL("./esm-resolve-ts.mjs", import.meta.url));
const { intakeNudge, noteChtCaller, runChtConfirm } = await import("./cht-voice.ts");

function confirm(sid: string, args: Record<string, unknown> = {}) {
  return JSON.parse(runChtConfirm(sid, { summary: "Noted.", ...args })) as {
    ok: boolean;
    reask?: boolean;
    say?: string;
    missing?: string[];
    instruction?: string;
  };
}

const open = confirm("CAopen");
assert(open.ok === false && open.reask === true, JSON.stringify(open));
assert(open.say === "Sorry — what were you calling about today?", open.say || "");
assert(JSON.stringify(open.missing) === JSON.stringify(["reason", "name", "town"]), JSON.stringify(open.missing));
assert(open.instruction?.includes("one question per turn"), open.instruction || "");

const held = confirm("CAopen");
assert(held.ok === false && held.reask === true, "second confirm spoke again before the caller answered");
assert(held.instruction === "Wait for the caller. Do not ask again and do not say goodbye.", held.instruction || "");

const named = confirm("CAnamed", { name: "Sam" });
assert(named.reask === true, JSON.stringify(named));
assert(named.say === "Sorry — what were you calling about today?", named.say || "");
assert(named.missing?.includes("reason") && named.missing?.includes("town"), JSON.stringify(named.missing));
assert(!named.missing?.includes("name"), JSON.stringify(named.missing));

const townOnly = confirm("CAtown", { name: "Sam", need: "A new cover" });
assert(townOnly.say === "What town are you calling from?", townOnly.say || "");
assert(JSON.stringify(townOnly.missing) === JSON.stringify(["town"]), JSON.stringify(townOnly.missing));
assert(townOnly.instruction?.includes("Say the question once"), townOnly.instruction || "");

noteChtCaller("CAtown", "I'm not sure");
const closed = confirm("CAtown", { name: "Sam", need: "A new cover" });
assert(closed.ok === true, JSON.stringify(closed));
assert(!closed.reask, "re-ask repeated after the caller answered");

const done = confirm("CAdone", { name: "Sam", location: "Frisco", need: "A new cover" });
assert(done.ok === true, JSON.stringify(done));

const greet = "Thanks for calling. They'll get back to you. What were you calling about today?";
assert(
  intakeNudge({ name: "", location: "", need: "", intakeReasked: false, callerTurns: 1, agentText: greet }) === null,
  "opening question looked like a goodbye",
);
assert(
  intakeNudge({
    name: "",
    location: "",
    need: "",
    intakeReasked: false,
    callerTurns: 0,
    agentText: "Goodbye, the team will get back to you.",
  }) === null,
  "nudged before the caller spoke",
);

const nudge = intakeNudge({
  name: "",
  location: "Frisco",
  need: "A new cover",
  intakeReasked: false,
  callerTurns: 1,
  agentText: "Thanks, the team will get back to you.",
});
assert(nudge?.say === "Sorry, I didn't catch your name. Who am I speaking with?", JSON.stringify(nudge));
assert(JSON.stringify(nudge?.missing) === JSON.stringify(["name"]), JSON.stringify(nudge));

assert(
  intakeNudge({
    name: "Sam",
    location: "Frisco",
    need: "A new cover",
    intakeReasked: false,
    callerTurns: 2,
    agentText: "The team will get back to you.",
  }) === null,
  "nudged after the three fields were in",
);
assert(
  intakeNudge({
    name: "",
    location: "",
    need: "",
    intakeReasked: true,
    callerTurns: 2,
    agentText: "Goodbye.",
  }) === null,
  "nudged a second time",
);

console.log("cht-intake.test.ts ok");
