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

assert(ringFirstEnabled("", "") === false, "unset is off");
assert(ringFirstEnabled("1", "") === true, "CHT_RING_SHOP=1");
assert(ringFirstEnabled("", "+15551234567") === false, "unset stays off even with numbers");
assert(ringFirstEnabled("0", "+15551234567") === false, "explicit off wins");
assert(ringFirstEnabled("off", "+19705312897") === false, "off");
assert(ringFirstEnabled("true", "") === true, "true");

const shopOnlyFrom720 = resolveRingTargets({
  called: "+17207800753",
  from: "+15551234567",
  shop: DEFAULT_SHOP_E164,
  ringNumbersRaw: "",
});
assert(shopOnlyFrom720.length === 0, "shop is not a default Dial target");
assert(!shopOnlyFrom720.includes("+19705312897"), "no 970 by default");

const listedShop = resolveRingTargets({
  called: "+17207800753",
  from: "+15551234567",
  shop: DEFAULT_SHOP_E164,
  ringNumbersRaw: "+19705312897",
});
assert(listedShop.join() === "+19705312897", "shop dials only when env lists it");

const forwarded = resolveRingTargets({
  called: "+17207800753",
  from: "+15551234567",
  shop: DEFAULT_SHOP_E164,
  ringNumbersRaw: "+19705312897,+15555550100",
  forwardedFrom: "+19705312897",
});
assert(forwarded.join() === "+15555550100", forwarded.join(","));

const via = resolveRingTargets({
  called: "+17207800753",
  from: "+15551234567",
  ringNumbersRaw: "+19705312897",
  calledVia: "(970) 531-2897",
});
assert(via.length === 0, "CalledVia shop must not be dialed");

const owners = resolveRingTargets({
  called: "+19705312897",
  from: "+15551234567",
  shop: DEFAULT_SHOP_E164,
  ringNumbersRaw: "970-555-1111, +1 970 555 2222",
});
assert(owners.join(",") === "+19705551111,+19705552222", owners.join(","));

const noCalled = resolveRingTargets({
  called: "+17207800753",
  from: "+15551234567",
  ringNumbersRaw: "+17207800753,+15555550100",
});
assert(noCalled.join() === "+15555550100", "do not Dial the called number");

const noCaller = resolveRingTargets({
  called: "+17207800753",
  from: "+19705551111",
  shop: DEFAULT_SHOP_E164,
  ringNumbersRaw: "+19705551111,+19705552222",
});
assert(noCaller.join() === "+19705552222", "do not Dial the caller");

const twiml = dialTwiml({
  hostname: "getpeaksignal.com",
  targets: ["+19705551111", "+19705552222"],
  parentSid: "CAtest",
});
assert(twiml.includes('timeout="10"'), twiml);
assert(twiml.includes('answerOnBridge="true"'), twiml);
assert(twiml.includes("/api/cht-voice/agent"), twiml);
assert(twiml.includes("+19705551111</Number>"), twiml);
assert(twiml.includes("+19705552222</Number>"), twiml);
assert(twiml.includes('machineDetection="Enable"'), twiml);
assert(twiml.includes("/api/cht-voice/screen?parent=CAtest"), twiml);
assert(!twiml.includes("+19705312897"), "owner Dial must not include shop when owners set");

console.log("cht-phone.test.ts ok");
