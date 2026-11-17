/**
 * Address rules and country-specific catalog matching.
 * Results are carriers that may serve an area. They are not a live availability check.
 */
import { COPY } from "./telecom-visitor-copy.mjs";

/** Catalog names that may serve Canada. Rogers is the Canada-only carrier on the page. */
export const CANADA_VENDORS = Object.freeze([
  "Rogers",
  "Starlink",
  "Viasat",
  "RingCentral",
  "Zoom",
  "8x8",
  "Dialpad",
  "GoTo",
  "Nextiva",
  "Vonage Business",
  "Net2Phone",
  "Ooma",
]);

export const CANADA_ONLY = Object.freeze(["Rogers"]);

const US_ORDER = [
  "Comcast",
  "AT&T",
  "Spectrum",
  "Cox",
  "Starlink",
  "T-Mobile for Business",
  "Verizon",
  "Lumen",
  "Viasat",
];

const CA_ORDER = [...CANADA_VENDORS];

const US_STATES = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

const CA_PROVINCES = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

const CA_ALIASES = {
  PEI: "PE",
  NFLD: "NL",
  NEWFOUNDLAND: "NL",
};

export function decodeHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code > 0 && code < 65536 ? String.fromCharCode(code) : "";
    })
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&reg;|&trade;/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function vendorId(name) {
  return decodeHtml(name)
    .toLowerCase()
    .replace(/&/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function normalizeCountry(raw) {
  const token = fold(raw);
  if (["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(token)) return "US";
  if (["CA", "CAN", "CANADA"].includes(token)) return "CA";
  return "";
}

export function countryLabel(code) {
  return code === "CA" ? COPY.address.canada : COPY.address.unitedStates;
}

function normalizeRegion(country, raw) {
  const token = fold(raw);
  if (!token) return "";
  const table = country === "CA" ? CA_PROVINCES : US_STATES;
  if (table[token]) return token;
  const alias = country === "CA" ? CA_ALIASES[token] : "";
  if (alias) return alias;
  const full = Object.entries(table).find(([, name]) => fold(name) === token);
  return full ? full[0] : "";
}

function formatPostal(raw) {
  const compact = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/.test(compact)) return "";
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

function formatZip(raw) {
  const text = String(raw || "").trim();
  const match = text.match(/^(\d{5})(?:-(\d{4}))?$/);
  if (!match) return "";
  return match[2] ? `${match[1]}-${match[2]}` : match[1];
}

function cleanText(value, max) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function clip(value, max) {
  const text = cleanText(value, max + 20);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

export function validateAddress(input) {
  const errors = [];
  const country = normalizeCountry(input?.country);
  if (!country) errors.push(COPY.validation.country);

  const street = cleanText(input?.street, 120);
  if (street.length < 4 || !/[A-Za-z]/.test(street)) errors.push(COPY.validation.street);

  const city = cleanText(input?.city, 80);
  if (!/^[\p{L}][\p{L}\s.'’-]{1,79}$/u.test(city)) errors.push(COPY.validation.city);

  let region = "";
  let postal = "";
  if (country === "US") {
    region = normalizeRegion("US", input?.region);
    if (!region) errors.push(COPY.validation.state);
    postal = formatZip(input?.postal);
    if (!postal) errors.push(COPY.validation.zip);
  } else if (country === "CA") {
    region = normalizeRegion("CA", input?.region);
    if (!region) errors.push(COPY.validation.province);
    postal = formatPostal(input?.postal);
    if (!postal) errors.push(COPY.validation.postal);
  }

  if (errors.length) return { ok: false, errors };
  const formatted = `${street}, ${city}, ${region} ${postal}`;
  return {
    ok: true,
    errors: [],
    address: { country, street, city, region, postal, formatted },
  };
}

export function parseVendorHtml(html) {
  const vendors = [];
  const re = /<details\b[^>]*class="[^"]*\bvendor-card\b[^"]*"[^>]*>[\s\S]*?<\/details>/gi;
  let match;
  while ((match = re.exec(html))) {
    const block = match[0];
    const categories = decodeHtml((block.match(/\bdata-categories="([^"]*)"/i) || [])[1] || "")
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
    const name = decodeHtml((block.match(/<span class="card-title">([\s\S]*?)<\/span>/i) || [])[1] || "");
    const description = decodeHtml((block.match(/<p class="card-desc">([\s\S]*?)<\/p>/i) || [])[1] || "");
    const offerings = [];
    const li = /<li>([\s\S]*?)<\/li>/gi;
    let item;
    while ((item = li.exec(block))) offerings.push(decodeHtml(item[1]));
    if (!name) continue;
    vendors.push({ name, categories, description, offerings: offerings.filter(Boolean) });
  }
  return vendors;
}

export function vendorsFromDocument(doc) {
  const root = doc && doc.querySelectorAll ? doc : null;
  if (!root) return [];
  return [...root.querySelectorAll(".vendor-card")]
    .map((card) => {
      const title = card.querySelector(".card-title");
      const desc = card.querySelector(".card-desc");
      const name = cleanText(title ? title.textContent : "", 120);
      const categories = String(card.getAttribute("data-categories") || "")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);
      const description = cleanText(desc ? desc.textContent : "", 600);
      const offerings = [...card.querySelectorAll(".offer-list li")]
        .map((li) => cleanText(li.textContent, 400))
        .filter(Boolean);
      return { name, categories, description, offerings };
    })
    .filter((vendor) => vendor.name);
}

function offeringLines(vendor) {
  const raw = vendor.offerings && vendor.offerings.length ? vendor.offerings : [vendor.description];
  return raw.map((line) => clip(line, 180)).filter(Boolean).slice(0, 3);
}

export function presentVendor(vendor) {
  return {
    id: vendorId(vendor.name),
    name: vendor.name,
    categories: vendor.categories || [],
    description: clip(vendor.description, 220),
    offerings: offeringLines(vendor),
    pricing: COPY.results.pricing,
    availability: COPY.results.mayServe,
  };
}

function byOrder(names, order) {
  return [...names].sort((a, b) => {
    const ia = order.indexOf(a.name);
    const ib = order.indexOf(b.name);
    if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export function carriersForCountry(vendors, country) {
  const code = normalizeCountry(country) || (country === "CA" ? "CA" : country === "US" ? "US" : "");
  if (code === "CA") {
    const allowed = new Set(CANADA_VENDORS);
    const picked = (vendors || []).filter((vendor) => allowed.has(vendor.name));
    return byOrder(picked, CA_ORDER).map(presentVendor);
  }
  if (code !== "US") return [];
  const blocked = new Set(CANADA_ONLY);
  const picked = (vendors || []).filter((vendor) => {
    if (blocked.has(vendor.name)) return false;
    return (vendor.categories || []).some((category) => category === "Network" || category === "Wireless");
  });
  return byOrder(picked, US_ORDER).map(presentVendor);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 120;
}

function validPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function validSeats(value) {
  const match = String(value || "").trim().match(/^(\d{1,6})(?:\s*seats?)?$/i);
  if (!match) return "";
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 1 || n > 100000) return "";
  return String(n);
}

function contactErrors(input, errors) {
  const contactName = cleanText(input?.contactName, 80);
  const contactEmail = cleanText(input?.contactEmail, 120);
  const contactPhone = cleanText(input?.contactPhone, 40);
  if (contactName.length < 2) errors.push(COPY.validation.contactName);
  if (!validEmail(contactEmail)) errors.push(COPY.validation.email);
  if (!validPhone(contactPhone)) errors.push(COPY.validation.phone);
  return { contactName, contactEmail, contactPhone };
}

function consentOk(input) {
  return input?.consent === true || input?.consent === "yes";
}

export function validateQuote(input, carriers) {
  const errors = [];
  const addressResult = validateAddress(input || {});
  if (!addressResult.ok) errors.push(...addressResult.errors);

  const company = cleanText(input?.company, 120);
  if (company.length < 2) errors.push(COPY.validation.company);

  const contact = contactErrors(input, errors);
  const bandwidth = cleanText(input?.bandwidth, 80);
  if (bandwidth.length < 2) errors.push(COPY.validation.bandwidth);

  const list = carriers || [];
  const carrier = list.find((item) => item.id === String(input?.vendorId || "").trim());
  if (!carrier) errors.push(COPY.validation.vendor);
  const offering = cleanText(input?.offering, 180);
  if (!carrier || !carrier.offerings.includes(offering)) errors.push(COPY.validation.offering);
  if (!consentOk(input)) errors.push(COPY.validation.consent);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      kind: "quote",
      ...addressResult.address,
      company,
      ...contact,
      bandwidth,
      vendorId: carrier.id,
      vendorName: carrier.name,
      offering,
      pricing: COPY.results.pricing,
    },
  };
}

export function validateOpportunity(input, vendors) {
  const errors = [];
  const company = cleanText(input?.company, 120);
  if (company.length < 2) errors.push(COPY.validation.company);
  const contact = contactErrors(input, errors);

  const seats = validSeats(input?.seats);
  if (!seats) errors.push(COPY.validation.seats);

  const currentProvider = cleanText(input?.currentProvider, 120);
  if (currentProvider.length < 2) errors.push(COPY.validation.current);
  const contractEnd = cleanText(input?.contractEnd, 80);
  if (contractEnd.length < 2) errors.push(COPY.validation.contract);
  const locations = cleanText(input?.locations, 200);
  if (locations.length < 2) errors.push(COPY.validation.locations);
  const needs = cleanText(input?.needs, 1000);
  if (needs.length < 2) errors.push(COPY.validation.needs);

  const presented = (vendors || []).map(presentVendor);
  const vendor = presented.find((item) => item.id === String(input?.vendorId || "").trim());
  if (!vendor) errors.push(COPY.validation.vendor);
  if (!consentOk(input)) errors.push(COPY.validation.consent);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      kind: "opportunity",
      company,
      ...contact,
      seats,
      currentProvider,
      contractEnd,
      locations,
      needs,
      vendorId: vendor.id,
      vendorName: vendor.name,
      pricing: COPY.results.pricing,
    },
  };
}

export function createSubmitGate(randomId) {
  let pending = false;
  let key = "";
  return {
    begin() {
      if (pending) return "";
      pending = true;
      if (!key) key = String(randomId());
      return key;
    },
    finish(saved) {
      if (!saved) pending = false;
    },
    reset() {
      pending = false;
      key = "";
    },
  };
}
