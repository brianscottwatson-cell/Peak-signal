/**
 * Run: node --experimental-strip-types voice/cht/cht-phone.test.ts
 */
import {
  DEFAULT_SHOP_E164,
  dialTwiml,
  phoneReadbackHint,
  resolveRingTargets,
  ringFirstEnabled,
  speakUsNanp,
} from "./cht-phone.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const shop = speakUsNanp("+19705312897");
assert(shop, "shop NANP parses");
assert(shop!.spoken === "nine seven zero. Five three one. Two eight nine seven", shop!.spoken);
assert(
  shop!.confirmLine ===
    "Your number is nine seven zero. Five three one. Two eight nine seven. Is that the best number to reach you?",
  shop!.confirmLine,
);
assert(speakUsNanp("(970) 531-2897")?.ten === "9705312897", "paren format");
assert(speakUsNanp("19705312897")?.e164 === "+19705312897", "11-digit");
assert(speakUsNanp("555") === null, "short number is not NANP");

const hint = phoneReadbackHint("+19705312897");
assert(hint.includes("nine seven zero"), hint);
assert(hint.includes("Five three one"), hint);
assert(!hint.replace(/\s/g, "").includes("ninesevenzerofivethreeone"), "not one digit stream");

assert(ringFirstEnabled("", "") === false, "default off");
assert(ringFirstEnabled("1", "") === true, "CHT_RING_SHOP=1");
assert(ringFirstEnabled("", "+15551234567") === true, "numbers auto-enable");
assert(ringFirstEnabled("0", "+15551234567") === false, "explicit off wins");

const shopOnlyFrom720 = resolveRingTargets({
  called: "+17207800753",
  from: "+15551234567",
  shop: DEFAULT_SHOP_E164,
  ringNumbersRaw: "",
});
assert(shopOnlyFrom720.join() === "+19705312897", "720 inbound may Dial shop");

const loop = resolveRingTargets({
  called: "+19705312897",
  from: "+15551234567",
  shop: DEFAULT_SHOP_E164,
  ringNumbersRaw: "",
});
assert(loop.length === 0, "shop DID must not self-Dial");

const owners = resolveRingTargets({
  called: "+19705312897",
  from: "+15551234567",
  shop: DEFAULT_SHOP_E164,
  ringNumbersRaw: "970-555-1111, +1 970 555 2222",
});
assert(owners.join(",") === "+19705551111,+19705552222", owners.join(","));

const noCaller = resolveRingTargets({
  called: "+19705312897",
  from: "+19705551111",
  shop: DEFAULT_SHOP_E164,
  ringNumbersRaw: "+19705551111,+19705552222",
});
assert(noCaller.join() === "+19705552222", "do not Dial the caller");

const twiml = dialTwiml({ hostname: "getpeaksignal.com", targets: ["+19705551111", "+19705552222"] });
assert(twiml.includes('timeout="10"'), twiml);
assert(twiml.includes("/api/cht-voice/agent"), twiml);
assert(twiml.includes("<Number>+19705551111</Number>"), twiml);
assert(twiml.includes("<Number>+19705552222</Number>"), twiml);
assert(!twiml.includes("+19705312897"), "owner Dial must not include shop when owners set");

console.log("cht-phone.test.ts ok");
