import { COPY } from "/telecom-visitor-copy.mjs";
import { createSubmitGate, validateAddress, vendorId } from "/telecom-carrier-rules.mjs";

const mode = window.__PEAK_TELECOM_CHAT_MODE;
if (mode === "live" || mode === "preview") start();

function start() {
  const gate = createSubmitGate(() => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `idem-${Date.now()}`));
  const sessionId = sessionKey();
  const state = {
    step: "welcome",
    errors: [],
    outcome: "",
    answers: blank(),
  };

  injectStyle();
  const section = buildSection();
  const quote = document.getElementById("quote");
  const main = document.querySelector("main");
  if (quote && quote.parentNode) quote.parentNode.insertBefore(section, quote);
  else main?.appendChild(section);

  const log = section.querySelector("#telecom-chat-log");
  const form = section.querySelector("#telecom-chat-form");
  const input = section.querySelector("#tc-input");

  section.querySelector("#tc-restart").addEventListener("click", () => {
    gate.reset();
    const vendor = state.answers.vendor;
    const vendorLocked = state.answers.vendorLocked;
    state.step = vendor ? "address" : "vendor";
    state.errors = [];
    state.outcome = "";
    state.answers = blank();
    state.answers.vendor = vendor;
    state.answers.vendorLocked = vendorLocked;
    input.value = "";
    render();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSend(input.value.trim());
  });
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a");
    if (!link || !link.matches("a.quote-btn, .card-action a")) return;
    if (!/request a quote/i.test(link.textContent || "")) return;
    const href = link.getAttribute("href") || "";
    if (href !== "/contact" && href !== "/telecom/quote") return;
    event.preventDefault();
    const card = link.closest(".vendor-card");
    const title = card?.querySelector(".card-title");
    const vendor = title ? title.textContent.replace(/\s+/g, " ").trim() : "";
    openQuote(vendor);
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  if (window.__PEAK_TELECOM_VENDOR) openQuote(window.__PEAK_TELECOM_VENDOR);
  else render();

  function openQuote(vendor) {
    state.answers = blank();
    state.errors = [];
    state.outcome = "";
    if (vendor) {
      state.answers.vendor = vendor;
      state.answers.vendorId = vendorId(vendor);
      state.answers.vendorLocked = true;
      state.step = "address";
    } else {
      state.step = "vendor";
    }
    input.value = "";
    render();
  }

  function onSend(text) {
    if (!text) return;
    if (state.step === "vendor") state.answers.vendor = text;
    if (state.step === "services") state.answers.services = text;
    if (state.step === "counts") state.answers.seatsLocations = text;
    if (state.step === "provider") state.answers.currentProvider = text;
    if (state.step === "timeline") state.answers.timeline = text;
    if (!["vendor", "services", "counts", "provider", "timeline"].includes(state.step)) return;
    input.value = "";
    advance();
  }

  function advance() {
    state.errors = [];
    const order = ["vendor", "address", "services", "counts", "provider", "timeline", "contact", "review"];
    const checks = {
      vendor: () => state.answers.vendor.trim().length >= 2 || state.answers.vendor === COPY.vendor.notSure,
      services: () => state.answers.services.trim().length >= 2,
      counts: () => state.answers.seatsLocations.trim().length >= 1,
      provider: () => state.answers.currentProvider.trim().length >= 2,
      timeline: () => state.answers.timeline.trim().length >= 2,
    };
    const messages = {
      vendor: COPY.validation.vendor,
      services: COPY.validation.services,
      counts: COPY.validation.counts,
      provider: COPY.validation.provider,
      timeline: COPY.validation.timeline,
    };
    if (checks[state.step] && !checks[state.step]()) {
      state.errors = [messages[state.step]];
      render();
      return;
    }
    const index = order.indexOf(state.step);
    if (index >= 0 && index < order.length - 1) state.step = order[index + 1];
    render();
  }

  function continueAddress() {
    readAddress();
    const checked = validateAddress(state.answers);
    if (!checked.ok) {
      state.errors = checked.errors;
      render();
      return;
    }
    Object.assign(state.answers, checked.address);
    state.errors = [];
    state.step = "services";
    render();
  }

  function continueContact() {
    readContact();
    const errors = [];
    if (state.answers.contactName.trim().length < 2) errors.push(COPY.validation.contactName);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.answers.contactEmail.trim())) errors.push(COPY.validation.email);
    if (state.answers.contactPhone.replace(/\D/g, "").length < 10) errors.push(COPY.validation.phone);
    if (errors.length) {
      state.errors = errors;
      render();
      return;
    }
    state.errors = [];
    state.step = "review";
    render();
  }

  async function submitFlow() {
    const box = document.getElementById("tc-consent");
    if (box) state.answers.consent = box.checked;
    const gotcha = document.getElementById("tc-gotcha");
    const key = gate.begin();
    if (!key) return;
    const button = document.getElementById("tc-submit");
    if (button) button.disabled = true;
    const payload = {
      kind: "quote",
      idempotencyKey: key,
      sessionId,
      _gotcha: gotcha ? gotcha.value : "",
      consent: state.answers.consent === true,
      vendor: state.answers.vendor,
      country: state.answers.country,
      street: state.answers.street,
      city: state.answers.city,
      region: state.answers.region,
      postal: state.answers.postal,
      services: state.answers.services,
      seatsLocations: state.answers.seatsLocations,
      currentProvider: state.answers.currentProvider,
      timeline: state.answers.timeline,
      contactName: state.answers.contactName,
      contactEmail: state.answers.contactEmail,
      contactPhone: state.answers.contactPhone,
      business: state.answers.contactName,
    };
    try {
      const response = await fetch("/api/telecom/requests", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (mode === "preview" && (response.status === 404 || response.status === 405)) {
        gate.finish(true);
        state.outcome = "preview";
        state.step = "confirmation";
        render();
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        gate.finish(false);
        if (button) button.disabled = false;
        state.errors = body?.errors || [body?.message || COPY.validation.saveFailed];
        render();
        return;
      }
      gate.finish(true);
      state.outcome = "sent";
      state.serverMessage = body.message || COPY.confirm.body;
      state.reference = body.id || "";
      state.step = "confirmation";
      state.errors = [];
      render();
    } catch {
      gate.finish(false);
      if (button) button.disabled = false;
      state.errors = [mode === "preview" ? COPY.validation.previewNotSent : COPY.validation.saveFailed];
      if (mode === "preview") {
        state.outcome = "preview";
        state.step = "confirmation";
        state.errors = [];
      }
      render();
    }
  }

  function render() {
    input.placeholder = placeholder(state.step);
    log.replaceChildren();
    if (state.step === "welcome") {
      addAgent([COPY.welcome.p1, COPY.welcome.p2], chips([[COPY.welcome.chip, () => openQuote("")]]));
      return;
    }
    if (state.answers.vendorLocked) addUser(COPY.welcome.chip);
    if (state.answers.vendorLocked) {
      addAgent([fill(COPY.vendor.prefilled, { vendor: state.answers.vendor })]);
    } else {
      addAgent([COPY.vendor.ask], state.step === "vendor" ? chips([[COPY.vendor.notSure, () => { state.answers.vendor = COPY.vendor.notSure; advance(); }]]) : null);
      if (state.step === "vendor") return showErrors();
      addUser(state.answers.vendor);
    }
    addAgent([COPY.address.ask], null, state.step === "address" ? addressForm() : null);
    if (state.step === "address") return showErrors();
    addUser(state.answers.formatted);
    addAgent([COPY.services.ask]);
    if (state.step === "services") return showErrors();
    addUser(state.answers.services);
    addAgent([COPY.counts.ask]);
    if (state.step === "counts") return showErrors();
    addUser(state.answers.seatsLocations);
    addAgent([COPY.provider.ask], state.step === "provider" ? chips([[COPY.provider.chip, () => { state.answers.currentProvider = COPY.provider.chip; advance(); }]]) : null);
    if (state.step === "provider") return showErrors();
    addUser(state.answers.currentProvider);
    addAgent([COPY.timeline.ask]);
    if (state.step === "timeline") return showErrors();
    addUser(state.answers.timeline);
    addAgent([COPY.contact.ask], null, state.step === "contact" ? contactForm() : null);
    if (state.step === "contact") return showErrors();
    addUser([state.answers.contactName, state.answers.contactEmail, state.answers.contactPhone].filter(Boolean).join(" · "));
    if (state.step === "review") {
      addAgent([COPY.review.ask], null, reviewCard());
      return showErrors();
    }
    if (state.step === "confirmation") {
      addUser(COPY.review.submit);
      addAgent([], null, confirmCard());
    }
  }

  function showErrors() {
    if (!state.errors.length) return;
    const note = el("div", "tc-errors");
    note.setAttribute("role", "alert");
    for (const message of state.errors) note.appendChild(el("p", "", message));
    log.appendChild(note);
  }

  function addressForm() {
    const box = el("div", "tc-form");
    const toggle = el("div", "tc-toggle");
    toggle.setAttribute("role", "group");
    toggle.setAttribute("aria-label", COPY.address.country);
    for (const [code, label] of [["US", COPY.address.unitedStates], ["CA", COPY.address.canada]]) {
      const button = el("button", state.answers.country === code ? "is-on" : "", label);
      button.type = "button";
      button.id = code === "US" ? "tc-country-us" : "tc-country-ca";
      button.addEventListener("click", () => {
        readAddress();
        state.answers.country = code;
        render();
      });
      toggle.appendChild(button);
    }
    box.appendChild(toggle);
    box.appendChild(field(COPY.address.street, "tc-street", state.answers.street, "street-address"));
    box.appendChild(field(COPY.address.city, "tc-city", state.answers.city, "address-level2"));
    const row = el("div", "tc-row");
    row.appendChild(field(state.answers.country === "CA" ? COPY.address.province : COPY.address.state, "tc-region", state.answers.region, "address-level1"));
    row.appendChild(field(state.answers.country === "CA" ? COPY.address.postal : COPY.address.zip, "tc-postal", state.answers.postal, "postal-code"));
    box.appendChild(row);
    box.appendChild(action(COPY.address.continue, "tc-continue", continueAddress));
    return box;
  }

  function contactForm() {
    const box = el("div", "tc-form");
    box.appendChild(field(COPY.contact.name, "tc-name", state.answers.contactName, "name"));
    box.appendChild(field(COPY.contact.email, "tc-email", state.answers.contactEmail, "email", "email"));
    box.appendChild(field(COPY.contact.phone, "tc-phone", state.answers.contactPhone, "tel", "tel"));
    box.appendChild(action(COPY.address.continue, "tc-contact-continue", continueContact));
    return box;
  }

  function reviewCard() {
    const card = el("div", "tc-panel");
    card.appendChild(el("h3", "tc-card-name", COPY.review.title));
    card.appendChild(recap([
      [COPY.summary.vendor, state.answers.vendor],
      [COPY.summary.country, state.answers.country === "CA" ? COPY.address.canada : COPY.address.unitedStates],
      [COPY.summary.address, state.answers.formatted],
      [COPY.summary.services, state.answers.services],
      [COPY.summary.counts, state.answers.seatsLocations],
      [COPY.summary.provider, state.answers.currentProvider],
      [COPY.summary.timeline, state.answers.timeline],
      [COPY.summary.contact, [state.answers.contactName, state.answers.contactEmail, state.answers.contactPhone].filter(Boolean).join(" · ")],
    ]));
    card.appendChild(consentBlock());
    const row = el("div", "tc-actions");
    row.appendChild(action(COPY.review.change, "tc-change", () => { state.step = "address"; render(); }, "tc-ghost"));
    row.appendChild(action(COPY.review.submit, "tc-submit", submitFlow));
    card.appendChild(row);
    return card;
  }

  function confirmCard() {
    const card = el("div", "tc-confirm");
    if (state.outcome === "preview") {
      card.appendChild(el("h3", "tc-card-name", COPY.validation.previewTitle));
      card.appendChild(el("p", "", COPY.validation.previewNotSent));
      return card;
    }
    card.appendChild(el("h3", "tc-card-name", COPY.confirm.title));
    card.appendChild(el("p", "", state.serverMessage || COPY.confirm.body));
    if (state.reference) card.appendChild(el("p", "", `Reference ID: ${state.reference}`));
    return card;
  }

  function consentBlock() {
    const wrap = el("div", "");
    const label = el("label", "tc-check");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = "tc-consent";
    box.checked = state.answers.consent === true;
    box.addEventListener("change", () => { state.answers.consent = box.checked; });
    label.appendChild(box);
    label.appendChild(document.createTextNode(` ${COPY.consent.label}`));
    wrap.appendChild(label);
    const privacy = el("p", "tc-note");
    privacy.append(document.createTextNode("Peak Signal uses what you send on this form to review the request. See the "));
    const policy = el("a", "", COPY.consent.privacyPolicy);
    policy.href = "/privacy";
    const terms = el("a", "", COPY.consent.terms);
    terms.href = "/terms";
    privacy.append(policy, document.createTextNode(" and "), terms, document.createTextNode("."));
    wrap.appendChild(privacy);
    return wrap;
  }

  function readAddress() {
    for (const [id, key] of [["tc-street", "street"], ["tc-city", "city"], ["tc-region", "region"], ["tc-postal", "postal"]]) {
      const node = document.getElementById(id);
      if (node) state.answers[key] = node.value;
    }
  }

  function readContact() {
    for (const [id, key] of [["tc-name", "contactName"], ["tc-email", "contactEmail"], ["tc-phone", "contactPhone"]]) {
      const node = document.getElementById(id);
      if (node) state.answers[key] = node.value;
    }
  }

  function addUser(text) {
    const wrap = el("div", "tc-msg tc-user");
    wrap.appendChild(el("div", "tc-who", COPY.chrome.you));
    wrap.appendChild(el("p", "", text));
    log.appendChild(wrap);
  }

  function addAgent(paragraphs, chipRow, body) {
    const wrap = el("div", "tc-msg tc-agent");
    wrap.appendChild(el("div", "tc-who", COPY.chrome.agent));
    for (const paragraph of paragraphs || []) wrap.appendChild(el("p", "", paragraph));
    if (chipRow) wrap.appendChild(chipRow);
    if (body) wrap.appendChild(body);
    log.appendChild(wrap);
  }

  function chips(items) {
    const row = el("div", "tc-chips");
    for (const [label, onClick] of items) {
      const button = el("button", "tc-chip", label);
      button.type = "button";
      button.addEventListener("click", onClick);
      row.appendChild(button);
    }
    return row;
  }

  function field(label, id, value, auto, type) {
    const wrap = el("label", "tc-label", label);
    const control = document.createElement("input");
    control.id = id;
    control.type = type || "text";
    control.value = value || "";
    control.autocomplete = auto || "on";
    control.maxLength = 200;
    wrap.appendChild(control);
    return wrap;
  }

  function action(label, id, onClick, className) {
    const button = el("button", className ? `tc-btn ${className}` : "tc-btn", label);
    button.type = "button";
    button.id = id;
    button.addEventListener("click", onClick);
    return button;
  }

  function recap(pairs) {
    const list = el("dl", "tc-recap");
    for (const [label, value] of pairs) {
      list.appendChild(el("dt", "", label));
      list.appendChild(el("dd", "", value || ""));
    }
    return list;
  }
}

function blank() {
  return {
    country: "US", street: "", city: "", region: "", postal: "", formatted: "",
    vendor: "", vendorId: "", vendorLocked: false,
    services: "", seatsLocations: "", currentProvider: "", timeline: "",
    contactName: "", contactEmail: "", contactPhone: "", consent: false,
  };
}

function sessionKey() {
  const key = "peak-telecom-session";
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = window.crypto?.randomUUID ? window.crypto.randomUUID() : `sess-${Date.now()}`;
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return `sess-${Date.now()}`;
  }
}

function placeholder(step) {
  if (step === "address") return COPY.address.placeholder;
  if (step === "services") return COPY.services.placeholder;
  if (step === "counts") return COPY.counts.placeholder;
  if (step === "provider") return COPY.provider.placeholder;
  if (step === "timeline") return COPY.timeline.placeholder;
  if (step === "contact") return COPY.contact.placeholder;
  return COPY.chrome.inputPlaceholder;
}

function fill(template, map) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => map[key] ?? "");
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null && text !== "") node.textContent = text;
  return node;
}

function buildSection() {
  const section = el("section", "tc-section");
  section.id = "telecom-chat";
  const wrap = el("div", "tc-wrap");
  wrap.appendChild(el("p", "tc-kicker", COPY.section.kicker));
  wrap.appendChild(el("h2", "tc-title", COPY.section.title));
  wrap.appendChild(el("p", "tc-intro", COPY.section.intro));
  const windowEl = el("div", "tc-window");
  const head = el("div", "tc-head");
  head.appendChild(el("p", "tc-agent-name", COPY.chrome.agentName));
  const restart = el("button", "tc-text", COPY.chrome.restart);
  restart.type = "button";
  restart.id = "tc-restart";
  head.appendChild(restart);
  windowEl.appendChild(head);
  const log = el("div", "");
  log.id = "telecom-chat-log";
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  windowEl.appendChild(log);
  const form = document.createElement("form");
  form.id = "telecom-chat-form";
  form.autocomplete = "off";
  const gotcha = document.createElement("input");
  gotcha.className = "tc-gotcha";
  gotcha.id = "tc-gotcha";
  gotcha.tabIndex = -1;
  gotcha.autocomplete = "off";
  gotcha.setAttribute("aria-hidden", "true");
  const message = document.createElement("input");
  message.id = "tc-input";
  message.type = "text";
  message.maxLength = 200;
  const label = el("label", "tc-sr", COPY.chrome.inputPlaceholder);
  label.htmlFor = "tc-input";
  const send = el("button", "tc-btn", COPY.chrome.send);
  send.type = "submit";
  form.append(gotcha, label, message, send);
  windowEl.appendChild(form);
  wrap.appendChild(windowEl);
  wrap.appendChild(el("p", "tc-footnote", COPY.chrome.footnote));
  section.appendChild(wrap);
  return section;
}

function injectStyle() {
  if (document.getElementById("telecom-chat-style")) return;
  const style = document.createElement("style");
  style.id = "telecom-chat-style";
  style.textContent = `
    .tc-section { border-top: 1px solid #27272a; padding: 64px 0; }
    .tc-wrap { max-width: 1280px; margin: 0 auto; padding: 0 16px; }
    .tc-kicker { margin: 0 0 8px; color: #3B82F6; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; }
    .tc-title { margin: 0 0 12px; font-family: "Space Grotesk", Inter, sans-serif; font-size: 2rem; letter-spacing: -0.04em; color: #fff; }
    .tc-intro, .tc-note, .tc-footnote { color: #a1a1aa; line-height: 1.6; }
    .tc-window { margin-top: 20px; padding: 16px; background: #18181b; border: 1px solid #27272a; border-radius: 24px; }
    .tc-head, .tc-actions, .tc-row { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
    #telecom-chat-log { display: grid; gap: 12px; max-height: min(70vh, 820px); overflow: auto; }
    .tc-msg { max-width: min(100%, 42rem); border-radius: 16px; padding: 12px 14px; }
    .tc-agent { background: #09090b; border: 1px solid #27272a; }
    .tc-user { margin-left: auto; background: #fff; color: #09090b; }
    .tc-who { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; color: #71717a; }
    .tc-msg p { margin: 0 0 8px; }
    .tc-chips, .tc-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .tc-chip, .tc-btn, .tc-text { font: inherit; cursor: pointer; }
    .tc-chip { border: 1px solid #27272a; background: transparent; color: #e4e4e7; border-radius: 999px; padding: 8px 12px; min-height: 40px; }
    .tc-btn { border: 0; background: #fff; color: #09090b; border-radius: 12px; min-height: 44px; padding: 10px 16px; }
    .tc-ghost { background: transparent; color: #e4e4e7; border: 1px solid #27272a; }
    .tc-text { border: 0; background: transparent; color: #a1a1aa; }
    .tc-panel, .tc-confirm { margin-top: 12px; padding: 16px; background: #18181b; border: 1px solid #27272a; border-radius: 16px; }
    .tc-label { display: grid; gap: 6px; margin-top: 10px; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #a1a1aa; }
    .tc-form input, #tc-input { width: 100%; box-sizing: border-box; background: #09090b; color: #fff; border: 1px solid #3f3f46; border-radius: 12px; min-height: 44px; padding: 10px 12px; font: 16px/1.4 Inter, system-ui, sans-serif; }
    #telecom-chat-form { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
    #tc-input { flex: 1; }
    .tc-gotcha { position: absolute; left: -9999px; }
    .tc-recap { display: grid; grid-template-columns: minmax(7rem, 34%) 1fr; gap: 6px 12px; margin: 12px 0; }
    .tc-recap dt { color: #71717a; font-size: 0.75rem; }
    .tc-recap dd { margin: 0; }
    .tc-errors { color: #fca5a5; }
    .tc-check { display: flex; gap: 8px; color: #d4d4d8; }
    .tc-footnote { margin: 12px 0 0; font-size: 0.85rem; }
    .tc-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
    .tc-card-name { font-family: "Space Grotesk", Inter, sans-serif; color: #fff; }
    .tc-note a { color: #e4e4e7; }
    button.is-on { border-color: #3B82F6; }
  `;
  document.head.appendChild(style);
}
