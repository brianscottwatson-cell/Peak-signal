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
    state.step = "path";
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
    }
    state.step = "path";
    input.value = "";
    render();
  }

  function onSend(text) {
    if (state.step !== "speeds") return;
    state.answers.speeds = text;
    input.value = "";
    if (state.answers.speeds.trim().length < 2) {
      state.errors = [COPY.speeds.ask];
      render();
      return;
    }
    state.errors = [];
    state.step = "access";
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
    state.step = "speeds";
    render();
  }

  function choosePath(path) {
    state.answers.path = path;
    state.errors = [];
    state.step = "address";
    render();
  }

  function chooseAccess(access) {
    state.answers.accessType = access;
    state.errors = [];
    state.step = "budget";
    render();
  }

  function continueBudget() {
    const node = document.getElementById("tc-budget");
    state.answers.budget = node ? node.value.trim() : "";
    if (state.answers.budget && !/^\d+(\.\d+)?$/.test(state.answers.budget)) {
      state.errors = [COPY.budget.ask];
      render();
      return;
    }
    state.errors = [];
    state.step = "details";
    render();
  }

  function continueDetails() {
    readDetails();
    const errors = [];
    const answers = state.answers;
    if (answers.business.trim().length < 2) errors.push(COPY.validation.company);
    if (answers.firstName.trim().length < 1) errors.push(COPY.details.first);
    if (answers.lastName.trim().length < 1) errors.push(COPY.details.last);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.contactEmail.trim())) errors.push(COPY.validation.email);
    if (answers.contactPhone.replace(/\D/g, "").length < 10) errors.push(COPY.validation.phone);
    if (longPath(answers.path)) {
      if (!answers.suite.trim() && !answers.suiteNotNeeded) errors.push(COPY.details.suite);
      if (!answers.dateNeeded) errors.push(COPY.details.date);
      if (!answers.term.mtm && !answers.term.y1 && !answers.term.y2 && !answers.term.y3) errors.push(COPY.details.term);
      if (answers.pricePoint && !/^\d+(\.\d+)?$/.test(answers.pricePoint)) errors.push(COPY.details.price);
      if (!answers.roe) errors.push(COPY.details.roe);
      if (needsVoice(answers)) {
        if (!answers.voiceType) errors.push(COPY.details.voiceType);
        if (!/^\d+$/.test(answers.seats)) errors.push(COPY.details.seats);
        if (!/^\d+$/.test(answers.employees)) errors.push(COPY.details.employees);
        if (!answers.website.trim()) errors.push(COPY.details.website);
      }
      if (needsNetwork(answers) && !hasBandwidth(answers)) errors.push(COPY.details.bandwidth);
    }
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
    const answers = state.answers;
    const payload = {
      flow: "business",
      source: "chat",
      kind: "quote",
      idempotencyKey: key,
      sessionId,
      _gotcha: gotcha ? gotcha.value : "",
      consent: answers.consent === true,
      path: answers.path,
      vendor: answers.vendorLocked ? answers.vendor : "",
      country: answers.country,
      street: answers.street,
      city: answers.city,
      region: answers.region,
      postal: answers.postal,
      suite: answers.suite,
      suiteNotNeeded: answers.suiteNotNeeded === true,
      speeds: answers.speeds,
      accessType: answers.accessType,
      budget: answers.budget,
      business: answers.business,
      firstName: answers.firstName,
      lastName: answers.lastName,
      email: answers.contactEmail,
      phone: answers.contactPhone,
      servicesSelected: answers.servicesSelected,
      term: answers.term,
      dateNeeded: answers.dateNeeded,
      pricePoint: answers.pricePoint,
      voiceType: answers.voiceType,
      seats: answers.seats,
      employees: answers.employees,
      website: answers.website,
      connectionType: answers.connectionType,
      bandwidthMbps: answers.bandwidthMbps,
      currentProvider: answers.currentProvider,
      contractEnd: answers.contractEnd,
      roe: answers.roe === true,
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
    if (state.answers.vendorLocked) addAgent([fill(COPY.vendor.prefilled, { vendor: state.answers.vendor })]);
    addAgent(
      [COPY.path.ask],
      state.step === "path"
        ? chips([
          [COPY.path.internet, () => choosePath("internet")],
          [COPY.path.voice, () => choosePath("voice")],
          [COPY.path.both, () => choosePath("both")],
          [COPY.path.sdwan, () => choosePath("sdwan")],
        ])
        : null,
    );
    if (state.step === "path") return showErrors();
    addUser(pathLabel(state.answers.path));
    addAgent([COPY.address.ask], null, state.step === "address" ? addressForm() : null);
    if (state.step === "address") return showErrors();
    addUser(state.answers.formatted);
    addAgent([COPY.speeds.ask]);
    if (state.step === "speeds") return showErrors();
    addUser(state.answers.speeds);
    addAgent(
      [COPY.access.ask],
      state.step === "access"
        ? chips([
          [COPY.access.fiber, () => chooseAccess("fiber")],
          [COPY.access.broadband, () => chooseAccess("broadband")],
        ])
        : null,
    );
    if (state.step === "access") return showErrors();
    addUser(state.answers.accessType === "fiber" ? COPY.access.fiber : COPY.access.broadband);
    addAgent([COPY.budget.ask], null, state.step === "budget" ? budgetForm() : null);
    if (state.step === "budget") return showErrors();
    addUser(state.answers.budget || COPY.budget.skip);
    addAgent([COPY.details.ask], null, state.step === "details" ? detailsForm() : null);
    if (state.step === "details") return showErrors();
    addUser([state.answers.business, state.answers.firstName, state.answers.lastName].filter(Boolean).join(" "));
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

  function budgetForm() {
    const box = el("div", "tc-form");
    const wrap = el("label", "tc-label", COPY.budget.label);
    const control = document.createElement("input");
    control.id = "tc-budget";
    control.type = "text";
    control.inputMode = "decimal";
    control.autocomplete = "off";
    control.placeholder = COPY.budget.placeholder;
    control.maxLength = 20;
    wrap.appendChild(control);
    box.appendChild(wrap);
    const row = el("div", "tc-actions");
    row.appendChild(action(COPY.budget.skip, "tc-budget-skip", () => {
      state.answers.budget = "";
      state.errors = [];
      state.step = "details";
      render();
    }, "tc-ghost"));
    row.appendChild(action(COPY.budget.continue, "tc-budget-continue", continueBudget));
    box.appendChild(row);
    return box;
  }

  function detailsForm() {
    const box = el("div", "tc-form");
    const answers = state.answers;
    box.appendChild(field(COPY.details.business, "tc-business", answers.business, "organization"));
    box.appendChild(field(COPY.details.first, "tc-first", answers.firstName, "given-name"));
    box.appendChild(field(COPY.details.last, "tc-last", answers.lastName, "family-name"));
    box.appendChild(field(COPY.contact.email, "tc-email", answers.contactEmail, "email", "email"));
    box.appendChild(field(COPY.contact.phone, "tc-phone", answers.contactPhone, "tel", "tel"));
    if (longPath(answers.path)) {
      box.appendChild(field(COPY.details.suite, "tc-suite", answers.suite, "address-line2"));
      box.appendChild(checkField("tc-suite-none", COPY.details.suiteNone, answers.suiteNotNeeded));
      box.appendChild(checkField("tc-svc-network", COPY.details.network, answers.servicesSelected.includes("network")));
      box.appendChild(checkField("tc-svc-sdwan", COPY.details.sdwan, answers.servicesSelected.includes("sdwan")));
      box.appendChild(checkField("tc-svc-voice", COPY.details.voice, answers.servicesSelected.includes("voice")));
      box.appendChild(checkField("tc-svc-tv", COPY.details.tv, answers.servicesSelected.includes("tv")));
      box.appendChild(checkField("tc-term-mtm", COPY.details.mtm, answers.term.mtm));
      box.appendChild(checkField("tc-term-y1", COPY.details.y1, answers.term.y1));
      box.appendChild(checkField("tc-term-y2", COPY.details.y2, answers.term.y2));
      box.appendChild(checkField("tc-term-y3", COPY.details.y3, answers.term.y3));
      box.appendChild(field(COPY.details.date, "tc-date", answers.dateNeeded, "off", "date"));
      const price = field(COPY.details.price, "tc-price", answers.pricePoint, "off");
      const priceInput = price.querySelector("input");
      priceInput.placeholder = COPY.details.pricePlaceholder;
      priceInput.inputMode = "decimal";
      box.appendChild(price);
      if (needsVoice(answers)) {
        box.appendChild(selectField(COPY.details.voiceType, "tc-voice-type", answers.voiceType, ["", "UCaaS", "SIP", "CCaaS", "Direct Routing", "POTS", "Collaboration/Meeting", "I don't know"]));
        box.appendChild(field(COPY.details.seats, "tc-seats", answers.seats, "off"));
        box.appendChild(field(COPY.details.employees, "tc-employees", answers.employees, "off"));
        box.appendChild(field(COPY.details.website, "tc-website", answers.website, "url"));
      }
      if (needsNetwork(answers)) {
        box.appendChild(selectField(COPY.details.connection, "tc-connection", answers.connectionType, ["", "Fiber", "Broadband", "Coax", "Fixed", "Wireless", "Satellite", "T-1", "EOC", "I don't know"]));
        box.appendChild(field(COPY.details.bandwidth, "tc-bandwidth", answers.bandwidthMbps, "off"));
      }
      box.appendChild(field(COPY.details.provider, "tc-provider", answers.currentProvider, "off"));
      box.appendChild(field(COPY.details.contractEnd, "tc-contract-end", answers.contractEnd, "off", "date"));
      box.appendChild(checkField("tc-roe", COPY.details.roe, answers.roe));
    }
    box.appendChild(action(COPY.address.continue, "tc-details-continue", continueDetails));
    return box;
  }

  function readDetails() {
    const value = (id) => {
      const node = document.getElementById(id);
      return node ? node.value : "";
    };
    const checked = (id) => Boolean(document.getElementById(id)?.checked);
    state.answers.business = value("tc-business");
    state.answers.firstName = value("tc-first");
    state.answers.lastName = value("tc-last");
    state.answers.contactEmail = value("tc-email");
    state.answers.contactPhone = value("tc-phone");
    if (!longPath(state.answers.path)) return;
    state.answers.suite = value("tc-suite");
    state.answers.suiteNotNeeded = checked("tc-suite-none");
    state.answers.servicesSelected = [
      checked("tc-svc-network") ? "network" : "",
      checked("tc-svc-sdwan") ? "sdwan" : "",
      checked("tc-svc-voice") ? "voice" : "",
      checked("tc-svc-tv") ? "tv" : "",
    ].filter(Boolean);
    state.answers.term = {
      mtm: checked("tc-term-mtm"),
      y1: checked("tc-term-y1"),
      y2: checked("tc-term-y2"),
      y3: checked("tc-term-y3"),
    };
    state.answers.dateNeeded = value("tc-date");
    state.answers.pricePoint = value("tc-price");
    state.answers.voiceType = value("tc-voice-type");
    state.answers.seats = value("tc-seats");
    state.answers.employees = value("tc-employees");
    state.answers.website = value("tc-website");
    state.answers.connectionType = value("tc-connection");
    state.answers.bandwidthMbps = value("tc-bandwidth");
    state.answers.currentProvider = value("tc-provider");
    state.answers.contractEnd = value("tc-contract-end");
    state.answers.roe = checked("tc-roe");
  }

  function reviewCard() {
    const card = el("div", "tc-panel");
    card.appendChild(el("h3", "tc-card-name", COPY.review.title));
    card.appendChild(recap([
      [COPY.summary.vendor, state.answers.vendorLocked ? state.answers.vendor : COPY.vendor.notSure],
      [COPY.path.ask, pathLabel(state.answers.path)],
      [COPY.summary.address, state.answers.formatted],
      [COPY.speeds.label, state.answers.speeds],
      [COPY.access.ask, state.answers.accessType === "fiber" ? COPY.access.fiber : COPY.access.broadband],
      [COPY.budget.label, state.answers.budget || COPY.budget.skip],
      [COPY.summary.contact, [state.answers.firstName, state.answers.lastName, state.answers.contactEmail].filter(Boolean).join(" · ")],
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
    if (type !== "date") control.value = value || "";
    else if (value) control.value = value;
    control.autocomplete = auto || "on";
    control.maxLength = 200;
    wrap.appendChild(control);
    return wrap;
  }

  function checkField(id, label, checked) {
    const wrap = el("label", "tc-check");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = id;
    box.checked = checked === true;
    wrap.appendChild(box);
    wrap.appendChild(document.createTextNode(` ${label}`));
    return wrap;
  }

  function selectField(label, id, value, options) {
    const wrap = el("label", "tc-label", label);
    const control = document.createElement("select");
    control.id = id;
    for (const option of options) {
      const node = document.createElement("option");
      node.value = option;
      node.textContent = option || "Choose";
      if (option === value) node.selected = true;
      control.appendChild(node);
    }
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
    path: "", speeds: "", accessType: "", budget: "",
    business: "", firstName: "", lastName: "",
    contactName: "", contactEmail: "", contactPhone: "", consent: false,
    suite: "", suiteNotNeeded: false,
    servicesSelected: [],
    term: { mtm: false, y1: false, y2: false, y3: false },
    dateNeeded: "", pricePoint: "",
    voiceType: "", seats: "", employees: "", website: "",
    connectionType: "", bandwidthMbps: "",
    currentProvider: "", contractEnd: "", roe: false,
    services: "", seatsLocations: "", timeline: "",
  };
}

// Every path, internet included, collects the same request must-haves:
// term, date, suite, review box, and network connection / bandwidth.
function longPath(path) {
  return path === "internet" || path === "voice" || path === "both" || path === "sdwan" || path === "ucaas";
}

// Voice questions only when voice is actually part of the request.
function needsVoice(answers) {
  if (!longPath(answers.path)) return false;
  if (answers.path === "voice" || answers.path === "both" || answers.path === "ucaas") return true;
  return (answers.servicesSelected || []).includes("voice");
}

function needsNetwork(answers) {
  if (answers.path === "internet" || answers.path === "both" || answers.path === "sdwan") return true;
  const selected = answers.servicesSelected || [];
  return longPath(answers.path) && (selected.includes("network") || selected.includes("sdwan"));
}

// Bandwidth from the field, or an explicit "<number> Mbps" in the speeds.
function hasBandwidth(answers) {
  const typed = String(answers.bandwidthMbps || "").trim();
  if (typed) return /^\d+(\.\d+)?$/.test(typed);
  return /(?:^|[^\d.])\d+(?:\.\d+)?\s*(?:mbps|mb\/s|megabits?)(?![a-z])/i.test(String(answers.speeds || ""));
}

function pathLabel(path) {
  if (path === "internet") return COPY.path.internet;
  if (path === "voice") return COPY.path.voice;
  if (path === "both") return COPY.path.both;
  if (path === "sdwan") return COPY.path.sdwan;
  return path || "";
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
  if (step === "speeds") return COPY.speeds.placeholder;
  if (step === "address") return COPY.address.placeholder;
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
    .tc-form input, .tc-form select, #tc-input { width: 100%; box-sizing: border-box; background: #09090b; color: #fff; border: 1px solid #3f3f46; border-radius: 12px; min-height: 44px; padding: 10px 12px; font: 16px/1.4 Inter, system-ui, sans-serif; }
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
