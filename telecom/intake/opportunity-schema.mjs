/**
 * Validate a draft against data/loc8/opportunity.schema.json.
 * Covers the keywords that schema uses, including allOf and if/then/else.
 * Internal only. Do not import this from a public page.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "../../data/loc8/opportunity.schema.json");

export function loadOpportunitySchema() {
  return JSON.parse(readFileSync(schemaPath, "utf8"));
}

export function validateOpportunityDraft(data, schema = loadOpportunitySchema()) {
  const errors = [];
  check(data, schema, "$", errors);
  return { ok: errors.length === 0, errors };
}

function check(data, schema, path, errors) {
  if (!schema || typeof schema !== "object") return;

  if (Object.hasOwn(schema, "const") && data !== schema.const) {
    errors.push(`${path} must be ${JSON.stringify(schema.const)}`);
    return;
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(data)) {
    errors.push(`${path} is not an allowed value`);
    return;
  }

  if (schema.type && !typeOk(data, schema.type)) {
    errors.push(`${path} has the wrong type`);
    return;
  }

  if (typeof schema.minLength === "number" && typeof data === "string" && data.length < schema.minLength) {
    errors.push(`${path} is too short`);
  }
  if (typeof schema.minimum === "number" && typeof data === "number" && data < schema.minimum) {
    errors.push(`${path} is below the minimum`);
  }
  if (schema.pattern && typeof data === "string" && !new RegExp(schema.pattern).test(data)) {
    errors.push(`${path} does not match the required pattern`);
  }
  if (schema.format) checkFormat(data, schema.format, path, errors);

  if (schema.required && isObject(data)) {
    for (const key of schema.required) {
      if (data[key] === undefined) errors.push(`${path}.${key} is required`);
    }
  }

  if (schema.properties && isObject(data)) {
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (data[key] !== undefined) check(data[key], sub, `${path}.${key}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(data)) {
        if (!Object.hasOwn(schema.properties, key)) errors.push(`${path}.${key} is not allowed`);
      }
    }
  }

  if (typeof schema.minItems === "number" && Array.isArray(data) && data.length < schema.minItems) {
    errors.push(`${path} needs at least ${schema.minItems} item`);
  }
  if (schema.uniqueItems && Array.isArray(data)) {
    const seen = new Set(data.map((item) => JSON.stringify(item)));
    if (seen.size !== data.length) errors.push(`${path} has duplicates`);
  }
  if (schema.items && Array.isArray(data)) {
    data.forEach((item, index) => check(item, schema.items, `${path}[${index}]`, errors));
  }
  if (schema.contains && Array.isArray(data)) {
    const found = data.some((item) => {
      const local = [];
      check(item, schema.contains, `${path}[]`, local);
      return local.length === 0;
    });
    if (!found) errors.push(`${path} is missing a required item`);
  }

  if (schema.if) {
    const local = [];
    check(data, schema.if, path, local);
    if (local.length === 0) {
      if (schema.then) check(data, schema.then, path, errors);
    } else if (schema.else) {
      check(data, schema.else, path, errors);
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) check(data, sub, path, errors);
  }
}

function checkFormat(data, format, path, errors) {
  if (typeof data !== "string") {
    errors.push(`${path} has the wrong type`);
    return;
  }
  if (format === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data)) errors.push(`${path} must be an email`);
    return;
  }
  if (format === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(`${data}T00:00:00Z`))) {
      errors.push(`${path} must be a date`);
    }
    return;
  }
  if (format === "date-time") {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(data) || Number.isNaN(Date.parse(data))) {
      errors.push(`${path} must be a date-time`);
    }
  }
}

function typeOk(data, type) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((kind) => {
    if (kind === "null") return data === null;
    if (kind === "string") return typeof data === "string";
    if (kind === "boolean") return typeof data === "boolean";
    if (kind === "integer") return Number.isInteger(data);
    if (kind === "number") return typeof data === "number" && Number.isFinite(data);
    if (kind === "array") return Array.isArray(data);
    if (kind === "object") return isObject(data);
    return false;
  });
}

function isObject(data) {
  return Boolean(data) && typeof data === "object" && !Array.isArray(data);
}
