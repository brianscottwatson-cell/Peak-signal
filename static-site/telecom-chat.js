import { COPY } from "/telecom-visitor-copy.mjs";
import {
  carriersForCountry,
  createSubmitGate,
  validateAddress,
  vendorId,
  vendorsFromDocument,
} from "/telecom-carrier-rules.mjs";

const mode = window.__PEAK_TELECOM_CHAT_MODE;
if (mode === "live" || mode === "preview") start();

function start() {
  const gate = createSubmitGate(() => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `idem-${Date.now()}`));
  const state = {
    path: "",
    step: "welcome",
    loading: false,
    editing: false,
    errors: [],
    carriers: [],
    outcome: "",
    answers: blankAnswers(),
  };

  injectStyle();
  const section = buildSection();
  const quote = document.getElementById("quote");
  if (quote && quote.parentNode) quote.parentNode.insertBefore(section, quote);
  else document.querySelector("main")?.appendChild(section);

  const log = section.querySelector("#telecom-chat-log");
  const form = section.querySelector("#telecom-chat-form");
  const input = section.querySelector("#tc-input");

  section.querySelector("#tc-restart").addEventListener("click", () => {
    gate.reset();
    state.path = "";
    state.step = "welcome";
    state.loading = false;
    state.editing = false;
    state.errors = [];
    state.carriers = [];
    state.outcome = "";
    state.answers = blankAnswers();
    input.value = "";
    render();
  });
  section.querySelector("#tc-start-connect").addEventListener("click", () => beginConnect("US"));
  section.querySelector("#tc-start-opportunity").addEventListener("click", () => beginOpportunity());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSend(input.value.trim());
  });
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a");
    if (!link || !link.matches("a.quote-btn, .card-action a")) return;
    if ((link.getAttribute("href") || "") !== "/contact") return;
    if (!/request a quote/i.test(link.textContent || "")) return;
    event.preventDefault();
    beginConnect(state.answers.country || "US");
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  render();

  function beginConnect(country) {
    state.path = "connect";
    state.step = "address";
    state.outcome = "";
    state.errors = [];
    state.answers.country = country === "CA" ? "CA" : "US";
    input.value = "";
    render();
  }

  function beginOpportunity() {
    state.path = "opportunity";
    state.step = "company";
    state.outcome = "";
    state.errors = [];
    const vendors = vendorsFromDocument(document);
    const ring = vendors.find((vendor) => vendor.name === "RingCentral");
    state.answers.vendorId = ring ? vendorId(ring.name) : vendorId(vendors[0]?.name || "");
    state.answers.vendorName = ring?.name || vendors[0]?.name || "RingCentral";
    input.value = "";
    render();
  }

  function onSend(text) {
    if (!text) return;
    const lineSteps = ["company", "bandwidth", "seats", "current", "contract", "locations", "needs"];
    if (!lineSteps.includes(state.step)) return;
    if (state.step === "company") state.answers.company = text;
    if (state.step === "bandwidth") state.answers.bandwidth = text;
    if (state.step === "seats") state.answers.seats = text;
    if (state.step === "current") state.answers.currentProvider = text;
    if (state.step === "contract") state.answers.contractEnd = text;
    if (state.step === "locations") state.answers.locations = text;
    if (state.step === "needs") state.answers.needs = text;
    input.value = "";
    advance();
  }

  function advance() {
    state.errors = [];
    if (state.path === "connect") {
      if (state.step === "company") {
        if (state.answers.company.trim().length < 2) {
          state.errors = [COPY.validation.company];
          render();
          return;
        }
        state.step = "contact";
      } else if (state.step === "bandwidth") {
        if (state.answers.bandwidth.trim().length < 2) {
          state.errors = [COPY.validation.bandwidth];
          render();
          return;
        }
        showResults();
        return;
      }
    } else if (state.path === "opportunity") {
      const order = ["company", "contact", "seats", "current", "contract", "locations", "needs", "review"];
      const messages = {
        company: COPY.validation.company,
        seats: COPY.validation.seats,
        current: COPY.validation.current,
        contract: COPY.validation.contract,
        locations: COPY.validation.locations,
        needs: COPY.validation.needs,
      };
      if (state.step === "company" && state.answers.company.trim().length < 2) {
        state.errors = [messages.company];
        render();
        return;
      }
      if (state.step === "seats" && !/^\d{1,6}(?:\s*seats?)?$/i.test(state.answers.seats.trim())) {
        state.errors = [messages.seats];
        render();
        return;
      }
      if (state.step === "current" && state.answers.currentProvider.trim().length < 2) {
        state.errors = [messages.current];
        render();
        return;
      }
      if (state.step === "contract" && state.answers.contractEnd.trim().length < 2) {
        state.errors = [messages.contract];
        render();
        return;
      }
      if (state.step === "locations" && state.answers.locations.trim().length < 2) {
        state.errors = [messages.locations];
        render();
        return;
      }
      if (state.step === "needs" && state.answers.needs.trim().length < 2) {
        state.errors = [messages.needs];
        render();
        return;
      }
      const index = order.indexOf(state.step);
      if (index >= 0 && index < order.length - 1 && state.step !== "contact") state.step = order[index + 1];
    }
    render();
  }

  function readAddress() {
    const street = document.getElementById("tc-street");
    const city = document.getElementById("tc-city");
    const region = document.getElementById("tc-region");
    const postal = document.getElementById("tc-postal");
    if (street) state.answers.street = street.value;
    if (city) state.answers.city = city.value;
    if (region) state.answers.region = region.value;
    if (postal) state.answers.postal = postal.value;
  }

  function readContact() {
    const name = document.getElementById("tc-name");
    const email = document.getElementById("tc-email");
    const phone = document.getElementById("tc-phone");
    if (name) state.answers.contactName = name.value;
    if (email) state.answers.contactEmail = email.value;
    if (phone) state.answers.contactPhone = phone.value;
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
    state.step = "company";
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
    state.step = state.path === "opportunity" ? "seats" : "bandwidth";
    render();
  }

  async function showResults() {
    state.step = "results";
    state.loading = true;
    state.errors = [];
    state.carriers = [];
    render();
    let loaded;
    try {
      loaded = await loadCarriers();
    } catch {
      loaded = { ok: false, errors: [COPY.validation.unreadable] };
    }
    state.loading = false;
    if (!loaded.ok) {
      state.step = "address";
      state.errors = loaded.errors || [COPY.validation.unreadable];
      render();
      return;
    }
    Object.assign(state.answers, loaded.address);
    state.carriers = loaded.carriers || [];
    render();
  }

  async function loadCarriers() {
    if (mode === "live") {
      const response = await fetch("/api/telecom/address", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          country: state.answers.country,
          street: state.answers.street,
          city: state.answers.city,
          region: state.answers.region,
          postal: state.answers.postal,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) return { ok: false, errors: body?.errors || [COPY.validation.unreadable] };
      return body;
    }
    const checked = validateAddress(state.answers);
    if (!checked.ok) return checked;
    return {
      ok: true,
      address: checked.address,
      carriers: carriersForCountry(vendorsFromDocument(document), checked.address.country),
    };
  }

  function chooseOffering(id, offering) {
    state.answers.vendorId = id;
    state.answers.offering = offering;
    const carrier = state.carriers.find((item) => item.id === id);
    state.answers.vendorName = carrier?.name || "";
    render();
  }

  function reviewSelection() {
    if (!state.answers.vendorId || !state.answers.offering) {
      state.errors = [COPY.validation.offering];
      render();
      return;
    }
    state.errors = [];
    state.step = "summary";
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
      kind: state.path === "opportunity" ? "opportunity" : "quote",
      idempotencyKey: key,
      _gotcha: gotcha ? gotcha.value : "",
      company_website: "",
      consent: state.answers.consent,
      company: state.answers.company,
      contactName: state.answers.contactName,
      contactEmail: state.answers.contactEmail,
      contactPhone: state.answers.contactPhone,
      country: state.answers.country,
      street: state.answers.street,
      city: state.answers.city,
      region: state.answers.region,
      postal: state.answers.postal,
      bandwidth: state.answers.bandwidth,
      vendorId: state.answers.vendorId,
      offering: state.answers.offering,
      seats: state.answers.seats,
      currentProvider: state.answers.currentProvider,
      contractEnd: state.answers.contractEnd,
      locations: state.answers.locations,
      needs: state.answers.needs,
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
        state.errors = [];
        render();
        return;
      }
      const body = await response.json().catch(() => null);
      if (response.status === 404 && mode === "preview") {
        gate.finish(true);
        state.outcome = "preview";
        state.step = "confirmation";
        render();
        return;
      }
      if (!response.ok || !body?.ok) {
        gate.finish(false);
        if (button) button.disabled = false;
        state.errors = body?.errors || [COPY.validation.saveFailed];
        render();
        return;
      }
      gate.finish(true);
      state.outcome = state.path === "opportunity" ? "opportunity" : "quote";
      state.step = "confirmation";
      state.errors = [];
      render();
    } catch {
      gate.finish(false);
      if (button) button.disabled = false;
      if (mode === "preview") {
        state.outcome = "preview";
        state.step = "confirmation";
        state.errors = [];
      } else {
        state.errors = [COPY.validation.saveFailed];
      }
      render();
    }
  }

  function render() {
    input.placeholder = placeholderFor(state.step, state.path);
    section.querySelector("#tc-start-connect").classList.toggle("is-on", state.path === "connect");
    section.querySelector("#tc-start-opportunity").classList.toggle("is-on", state.path === "opportunity");
    log.replaceChildren();
    if (!state.path || state.step === "welcome") {
      addAgent([COPY.welcome.p1, COPY.welcome.p2], chips([
        [COPY.welcome.chipUs, () => beginConnect("US")],
        [COPY.welcome.chipCa, () => beginConnect("CA")],
        [COPY.welcome.chipOpportunity, () => beginOpportunity()],
      ]));
      return;
    }
    if (state.path === "connect") renderConnect();
    else renderOpportunity();
    const last = log.lastElementChild;
    if (last && last.scrollIntoView) last.scrollIntoView({ block: "nearest" });
  }

  function renderConnect() {
    addUser(state.answers.country === "CA" ? COPY.welcome.chipCa : COPY.welcome.chipUs);
    const addressBody = state.step === "address" ? addressForm() : null;
    addAgent([COPY.address.ask], null, addressBody);
    if (state.step === "address") return afterErrors();

    addUser(state.answers.formatted || [state.answers.street, state.answers.city, state.answers.region, state.answers.postal].filter(Boolean).join(", "));
    addAgent([COPY.company.ask]);
    if (state.step === "company") return afterErrors();

    addUser(state.answers.company);
    const contactBody = state.step === "contact" ? contactForm() : null;
    addAgent([COPY.contact.ask], null, contactBody);
    if (state.step === "contact") return afterErrors();

    addUser(contactLine());
    const bandwidthChips = state.step === "bandwidth"
      ? chips([
          [COPY.bandwidth.chip500, () => { state.answers.bandwidth = COPY.bandwidth.chip500; showResults(); }],
          [COPY.bandwidth.chip1g, () => { state.answers.bandwidth = COPY.bandwidth.chip1g; showResults(); }],
          [COPY.bandwidth.chipUnsure, () => { state.answers.bandwidth = COPY.bandwidth.chipUnsure; showResults(); }],
        ])
      : null;
    addAgent([COPY.bandwidth.ask], bandwidthChips);
    if (state.step === "bandwidth") return afterErrors();

    addUser(state.answers.bandwidth);
    if (state.loading) {
      addAgent([COPY.results.loading]);
      return;
    }
    const intro = state.answers.country === "CA" ? COPY.results.introCa : COPY.results.introUs;
    addAgent([intro], null, state.step === "results" ? resultsBody() : selectedRecap());
    if (state.step === "results") return afterErrors();

    if (state.step === "summary") {
      addAgent([COPY.summary.ask], null, summaryBody());
      return afterErrors();
    }
    if (state.step === "confirmation") {
      addUser(COPY.summary.request);
      addAgent([], null, confirmBody());
    }
  }

  function renderOpportunity() {
    addUser(COPY.opportunity.user);
    addAgent([COPY.opportunity.companyAsk]);
    if (state.step === "company") return afterErrors();
    addUser(state.answers.company);
    addAgent([COPY.contact.opportunityAsk], null, state.step === "contact" ? contactForm() : null);
    if (state.step === "contact") return afterErrors();
    addUser(contactLine());
    addAgent([COPY.opportunity.seatsAsk]);
    if (state.step === "seats") return afterErrors();
    addUser(`${state.answers.seats} seats`.replace(/\s+seats\s+seats/i, " seats"));
    addAgent([COPY.opportunity.currentAsk], state.step === "current" ? chips([[COPY.opportunity.currentChip, () => { state.answers.currentProvider = COPY.opportunity.currentChip; advance(); }]]) : null);
    if (state.step === "current") return afterErrors();
    addUser(state.answers.currentProvider);
    addAgent([COPY.opportunity.contractAsk], state.step === "contract" ? chips([[COPY.opportunity.contractChip, () => { state.answers.contractEnd = COPY.opportunity.contractChip; advance(); }]]) : null);
    if (state.step === "contract") return afterErrors();
    addUser(state.answers.contractEnd);
    addAgent([COPY.opportunity.locationsAsk]);
    if (state.step === "locations") return afterErrors();
    addUser(state.answers.locations);
    addAgent([COPY.opportunity.needsAsk], state.step === "needs" ? chips([[COPY.opportunity.needsChip, () => { state.answers.needs = COPY.opportunity.needsChip; advance(); }]]) : null);
    if (state.step === "needs") return afterErrors();
    addUser(state.answers.needs);
    if (state.step === "review") {
      addAgent([COPY.opportunity.reviewAsk], null, opportunityBody());
      return afterErrors();
    }
    if (state.step === "confirmation") {
      addUser(COPY.opportunity.submit);
      addAgent([], null, confirmBody());
    }
  }

  function afterErrors() {
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
    const regionLabel = state.answers.country === "CA" ? COPY.address.province : COPY.address.state;
    const postalLabel = state.answers.country === "CA" ? COPY.address.postal : COPY.address.zip;
    const row = el("div", "tc-row");
    row.appendChild(field(regionLabel, "tc-region", state.answers.region, "address-level1"));
    row.appendChild(field(postalLabel, "tc-postal", state.answers.postal, "postal-code"));
    box.appendChild(row);
    box.appendChild(actionButton(COPY.address.continue, "tc-continue", continueAddress));
    return box;
  }

  function contactForm() {
    const box = el("div", "tc-form");
    box.appendChild(field(COPY.contact.name, "tc-name", state.answers.contactName, "name"));
    box.appendChild(field(COPY.contact.email, "tc-email", state.answers.contactEmail, "email", "email"));
    box.appendChild(field(COPY.contact.phone, "tc-phone", state.answers.contactPhone, "tel", "tel"));
    box.appendChild(actionButton(COPY.address.continue, "tc-contact-continue", continueContact));
    return box;
  }

  function resultsBody() {
    const box = el("div", "");
    if (!state.carriers.length) box.appendChild(el("p", "tc-note", COPY.results.empty));
    const grid = el("div", "tc-grid");
    for (const carrier of state.carriers) {
      const card = el("article", "tc-card");
      if (carrier.id === state.answers.vendorId) card.classList.add("is-on");
      card.appendChild(el("h3", "tc-card-name", carrier.name));
      card.appendChild(el("p", "tc-kicker", (carrier.categories || []).join(" · ")));
      if (carrier.description) card.appendChild(el("p", "tc-note", carrier.description));
      card.appendChild(el("p", "tc-note", carrier.availability));
      for (const offering of carrier.offerings) {
        const button = el("button", "tc-option");
        button.type = "button";
        if (state.answers.vendorId === carrier.id && state.answers.offering === offering) button.classList.add("is-on");
        button.appendChild(el("span", "tc-option-title", offering));
        button.appendChild(el("span", "tc-price", carrier.pricing));
        button.addEventListener("click", () => chooseOffering(carrier.id, offering));
        card.appendChild(button);
      }
      grid.appendChild(card);
    }
    box.appendChild(grid);
    box.appendChild(el("p", "tc-note", state.answers.country === "CA" ? COPY.results.noteCa : COPY.results.noteUs));
    box.appendChild(actionButton(COPY.results.review, "tc-review", reviewSelection));
    return box;
  }

  function selectedRecap() {
    const carrier = state.carriers.find((item) => item.id === state.answers.vendorId);
    return recap([
      [COPY.summary.carrier, carrier?.name || state.answers.vendorName],
      [COPY.summary.option, state.answers.offering],
      [COPY.summary.pricing, COPY.results.pricing],
    ]);
  }

  function summaryBody() {
    const card = el("div", "tc-panel");
    card.appendChild(el("h3", "tc-card-name", COPY.summary.title));
    card.appendChild(recap([
      [COPY.summary.country, state.answers.country === "CA" ? COPY.address.canada : COPY.address.unitedStates],
      [COPY.summary.address, state.answers.formatted],
      [COPY.summary.company, state.answers.company],
      [COPY.summary.contact, contactLine()],
      [COPY.summary.need, state.answers.bandwidth],
      [COPY.summary.carrier, state.answers.vendorName],
      [COPY.summary.option, state.answers.offering],
      [COPY.summary.pricing, COPY.results.pricing],
    ]));
    card.appendChild(consentBlock());
    const row = el("div", "tc-actions");
    row.appendChild(actionButton(COPY.summary.change, "tc-change", () => {
      state.step = "results";
      state.errors = [];
      render();
    }, "tc-ghost"));
    row.appendChild(actionButton(COPY.summary.request, "tc-submit", submitFlow));
    card.appendChild(row);
    return card;
  }

  function opportunityBody() {
    const card = el("div", "tc-panel");
    card.appendChild(el("h3", "tc-card-name", COPY.opportunity.reviewTitle));
    if (state.editing) {
      const vendors = vendorsFromDocument(document);
      const selectWrap = el("label", "tc-label", COPY.opportunity.vendor);
      const select = document.createElement("select");
      select.id = "tc-vendor";
      for (const vendor of vendors) {
        const option = document.createElement("option");
        option.value = vendorId(vendor.name);
        option.textContent = vendor.name;
        if (option.value === state.answers.vendorId) option.selected = true;
        select.appendChild(option);
      }
      select.addEventListener("change", () => {
        state.answers.vendorId = select.value;
        state.answers.vendorName = select.selectedOptions[0]?.textContent || "";
      });
      selectWrap.appendChild(select);
      card.appendChild(selectWrap);
      card.appendChild(editField(COPY.company.label, "company"));
      card.appendChild(editField(COPY.contact.name, "contactName"));
      card.appendChild(editField(COPY.contact.email, "contactEmail"));
      card.appendChild(editField(COPY.contact.phone, "contactPhone"));
      card.appendChild(editField(COPY.opportunity.seatsLabel, "seats"));
      card.appendChild(editField(COPY.opportunity.currentLabel, "currentProvider"));
      card.appendChild(editField(COPY.opportunity.contractLabel, "contractEnd"));
      card.appendChild(editField(COPY.opportunity.locationsLabel, "locations"));
      card.appendChild(editField(COPY.opportunity.needsLabel, "needs", true));
      card.appendChild(actionButton(COPY.opportunity.save, "tc-save", () => {
        readEdits();
        state.editing = false;
        render();
      }));
      return card;
    }
    card.appendChild(recap([
      [COPY.opportunity.vendor, state.answers.vendorName],
      [COPY.summary.company, state.answers.company],
      [COPY.contact.name, state.answers.contactName],
      [COPY.contact.email, state.answers.contactEmail],
      [COPY.contact.phone, state.answers.contactPhone],
      [COPY.opportunity.seatsLabel, state.answers.seats],
      [COPY.opportunity.currentLabel, state.answers.currentProvider],
      [COPY.opportunity.contractLabel, state.answers.contractEnd],
      [COPY.opportunity.locationsLabel, state.answers.locations],
      [COPY.opportunity.needsLabel, state.answers.needs],
      [COPY.summary.pricing, COPY.results.pricing],
    ]));
    card.appendChild(consentBlock());
    const row = el("div", "tc-actions");
    row.appendChild(actionButton(COPY.opportunity.edit, "tc-edit", () => {
      state.editing = true;
      render();
    }, "tc-ghost"));
    row.appendChild(actionButton(COPY.opportunity.submit, "tc-submit", submitFlow));
    card.appendChild(row);
    return card;
  }

  function confirmBody() {
    const card = el("div", "tc-confirm");
    if (state.outcome === "preview") {
      card.appendChild(el("h3", "tc-card-name", COPY.validation.previewTitle));
      card.appendChild(el("p", "", COPY.validation.previewNotSent));
      return card;
    }
    const name = state.answers.contactName || "there";
    if (state.outcome === "opportunity") {
      card.appendChild(el("h3", "tc-card-name", COPY.confirmOpportunity.title));
      card.appendChild(el("p", "", fill(COPY.confirmOpportunity.p1, {
        name,
        vendor: state.answers.vendorName,
        company: state.answers.company,
      })));
      card.appendChild(el("p", "", fill(COPY.confirmOpportunity.p2, { vendor: state.answers.vendorName })));
      return card;
    }
    card.appendChild(el("h3", "tc-card-name", COPY.confirmQuote.title));
    card.appendChild(el("p", "", fill(COPY.confirmQuote.p1, {
      name,
      carrier: state.answers.vendorName,
      option: state.answers.offering,
      address: state.answers.formatted,
    })));
    card.appendChild(el("p", "", COPY.confirmQuote.p2));
    return card;
  }

  function consentBlock() {
    const wrap = el("div", "tc-consent");
    const label = el("label", "tc-check");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = "tc-consent";
    box.checked = state.answers.consent === true;
    box.addEventListener("change", () => {
      state.answers.consent = box.checked;
    });
    label.appendChild(box);
    label.appendChild(document.createTextNode(` ${COPY.consent.label}`));
    wrap.appendChild(label);
    const privacy = el("p", "tc-note", "");
    privacy.append(document.createTextNode(`${COPY.consent.privacy.split("Privacy Policy")[0]}`));
    const policy = el("a", "", COPY.consent.privacyPolicy);
    policy.href = "/privacy";
    const terms = el("a", "", COPY.consent.terms);
    terms.href = "/terms";
    privacy.append(policy, document.createTextNode(" and "), terms, document.createTextNode("."));
    wrap.appendChild(privacy);
    return wrap;
  }

  function editField(label, key, multiline) {
    const wrap = el("label", "tc-label", label);
    const control = document.createElement(multiline ? "textarea" : "input");
    if (!multiline) control.type = "text";
    control.value = state.answers[key] || "";
    control.dataset.key = key;
    control.addEventListener("input", () => {
      state.answers[key] = control.value;
    });
    wrap.appendChild(control);
    return wrap;
  }

  function readEdits() {
    const select = document.getElementById("tc-vendor");
    if (select) {
      state.answers.vendorId = select.value;
      state.answers.vendorName = select.selectedOptions[0]?.textContent || state.answers.vendorName;
    }
  }

  function contactLine() {
    return [state.answers.contactName, state.answers.contactEmail, state.answers.contactPhone].filter(Boolean).join(" · ");
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
    wrap.htmlFor = id;
    const control = document.createElement("input");
    control.id = id;
    control.type = type || "text";
    control.value = value || "";
    control.autocomplete = auto || "on";
    wrap.appendChild(control);
    return wrap;
  }

  function actionButton(label, id, onClick, className) {
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

function blankAnswers() {
  return {
    country: "US",
    street: "",
    city: "",
    region: "",
    postal: "",
    formatted: "",
    company: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    bandwidth: "",
    vendorId: "",
    vendorName: "",
    offering: "",
    seats: "",
    currentProvider: "",
    contractEnd: "",
    locations: "",
    needs: "",
    consent: false,
  };
}

function placeholderFor(step, path) {
  if (path === "connect" && step === "address") return COPY.address.placeholder;
  if (step === "company") return COPY.company.placeholder;
  if (step === "contact") return COPY.contact.placeholder;
  if (step === "bandwidth") return COPY.bandwidth.placeholder;
  if (step === "seats") return COPY.opportunity.seatsPlaceholder;
  if (step === "current") return COPY.opportunity.currentPlaceholder;
  if (step === "contract") return COPY.opportunity.contractPlaceholder;
  if (step === "locations") return COPY.opportunity.locationsPlaceholder;
  if (step === "needs") return COPY.opportunity.needsPlaceholder;
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
  const paths = el("div", "tc-paths");
  paths.appendChild(pathCard("tc-start-connect", COPY.paths.connectKicker, COPY.paths.connectTitle, COPY.paths.connectBody));
  paths.appendChild(pathCard("tc-start-opportunity", COPY.paths.opportunityKicker, COPY.paths.opportunityTitle, COPY.paths.opportunityBody));
  wrap.appendChild(paths);
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
  gotcha.type = "text";
  gotcha.name = "_gotcha";
  gotcha.id = "tc-gotcha";
  gotcha.tabIndex = -1;
  gotcha.autocomplete = "off";
  gotcha.className = "tc-gotcha";
  gotcha.setAttribute("aria-hidden", "true");
  const message = document.createElement("input");
  message.id = "tc-input";
  message.type = "text";
  message.maxLength = 400;
  message.autocomplete = "off";
  const label = el("label", "tc-sr", COPY.chrome.inputPlaceholder);
  label.htmlFor = "tc-input";
  const send = el("button", "tc-btn", COPY.chrome.send);
  send.type = "submit";
  send.id = "tc-send";
  form.append(gotcha, label, message, send);
  windowEl.appendChild(form);
  wrap.appendChild(windowEl);
  wrap.appendChild(el("p", "tc-footnote", COPY.chrome.footnote));
  section.appendChild(wrap);
  return section;
}

function pathCard(id, kicker, title, body) {
  const button = el("button", "tc-path");
  button.type = "button";
  button.id = id;
  button.append(el("p", "tc-kicker", kicker), el("span", "tc-path-title", title), el("span", "tc-note", body));
  return button;
}

function injectStyle() {
  if (document.getElementById("telecom-chat-style")) return;
  const style = document.createElement("style");
  style.id = "telecom-chat-style";
  style.textContent = `
    .tc-section { border-top: 1px solid #27272a; padding: 64px 0; }
    .tc-wrap { max-width: 1280px; margin: 0 auto; padding: 0 16px; }
    @media (min-width: 640px) { .tc-wrap { padding: 0 24px; } }
    .tc-kicker { margin: 0 0 8px; color: #3B82F6; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; }
    .tc-title { margin: 0 0 12px; font-family: "Space Grotesk", Inter, sans-serif; font-size: 2rem; letter-spacing: -0.04em; color: #fff; }
    .tc-intro, .tc-note, .tc-footnote { color: #a1a1aa; line-height: 1.6; }
    .tc-intro { max-width: 46rem; margin: 0 0 20px; }
    .tc-paths, .tc-grid { display: grid; gap: 16px; }
    @media (min-width: 800px) { .tc-paths, .tc-grid { grid-template-columns: 1fr 1fr; } }
    .tc-path, .tc-card, .tc-window, .tc-panel, .tc-confirm { background: #18181b; border: 1px solid #27272a; border-radius: 24px; color: inherit; text-align: left; }
    .tc-path { padding: 22px 24px; }
    .tc-path.is-on, .tc-card.is-on, .tc-option.is-on { border-color: #3B82F6; box-shadow: inset 0 0 0 1px #3B82F6; }
    .tc-path-title, .tc-card-name, .tc-agent-name { font-family: "Space Grotesk", Inter, sans-serif; font-weight: 600; letter-spacing: -0.03em; color: #fff; }
    .tc-path-title { display: block; font-size: 1.25rem; margin-bottom: 8px; }
    .tc-window { margin-top: 20px; padding: 16px; }
    .tc-head, .tc-actions, .tc-row { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
    .tc-head { margin-bottom: 12px; }
    #telecom-chat-log { display: grid; gap: 12px; max-height: min(70vh, 820px); overflow: auto; padding-right: 4px; }
    .tc-msg { max-width: min(100%, 42rem); border-radius: 16px; padding: 12px 14px; }
    .tc-agent { background: #09090b; border: 1px solid #27272a; }
    .tc-user { margin-left: auto; background: #fff; color: #09090b; }
    .tc-user .tc-who { color: #52525b; }
    .tc-who { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; color: #71717a; }
    .tc-msg p { margin: 0 0 8px; }
    .tc-msg p:last-child { margin-bottom: 0; }
    .tc-chips, .tc-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .tc-chip, .tc-btn, .tc-text, .tc-option { font: inherit; cursor: pointer; }
    .tc-chip, .tc-option { border: 1px solid #27272a; background: transparent; color: #e4e4e7; border-radius: 999px; padding: 8px 12px; min-height: 40px; text-align: left; }
    .tc-option { display: grid; width: 100%; border-radius: 12px; margin-top: 8px; }
    .tc-btn { border: 0; background: #fff; color: #09090b; border-radius: 12px; min-height: 44px; padding: 10px 16px; font-weight: 500; }
    .tc-ghost { background: transparent; color: #e4e4e7; border: 1px solid #27272a; }
    .tc-text { border: 0; background: transparent; color: #a1a1aa; }
    .tc-form, .tc-panel, .tc-confirm { margin-top: 12px; }
    .tc-panel, .tc-confirm { padding: 16px; }
    .tc-confirm { border-color: #14532d; }
    .tc-label { display: grid; gap: 6px; margin-top: 10px; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #a1a1aa; }
    .tc-form input, .tc-panel input, .tc-panel textarea, .tc-panel select, #tc-input { width: 100%; box-sizing: border-box; background: #09090b; color: #fff; border: 1px solid #3f3f46; border-radius: 12px; min-height: 44px; padding: 10px 12px; font: 16px/1.4 Inter, system-ui, sans-serif; }
    #telecom-chat-form { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
    #tc-input { flex: 1; }
    .tc-gotcha { position: absolute; left: -9999px; }
    .tc-recap { display: grid; grid-template-columns: minmax(7rem, 34%) 1fr; gap: 6px 12px; margin: 12px 0; }
    .tc-recap dt { color: #71717a; font-size: 0.75rem; }
    .tc-recap dd { margin: 0; color: #e4e4e7; }
    .tc-price { color: #a1a1aa; font-size: 0.85rem; }
    .tc-errors { color: #fca5a5; }
    .tc-check { display: flex; gap: 8px; align-items: flex-start; text-transform: none; letter-spacing: 0; font-size: 0.9rem; font-weight: 400; color: #d4d4d8; }
    .tc-footnote { margin: 12px 0 0; font-size: 0.85rem; }
    .tc-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
    .tc-note a { color: #e4e4e7; text-decoration: underline; text-underline-offset: 3px; }
    @media (max-width: 640px) { .tc-recap { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(style);
}
