import { SHOP_LIMITS } from "./constants.js";
import {
  isPlainObject,
  isValidUuid,
  sanitizeAccountContext,
  sanitizeLookupItem,
  sanitizeSettings,
  sanitizeShopRow,
} from "./validation.js";

export function validateLookupRequest(message) {
  if (!isPlainObject(message)) return { valid: false, error: "Invalid lookup request." };
  const item = sanitizeLookupItem(message.item);
  if (!item) return { valid: false, error: "The item identifier or name is invalid." };
  if (!isValidUuid(message.runId)) {
    return { valid: false, error: "The pricing run identifier is invalid." };
  }
  return { valid: true, item, runId: message.runId };
}

export function validatePricingPlan(rawPlan, settingsInput) {
  if (!isPlainObject(rawPlan)) return { valid: false, error: "Invalid pricing plan." };
  const accountContext = sanitizeAccountContext(rawPlan.accountContext);
  if (!accountContext) return { valid: false, error: "The current account could not be verified." };
  if (!Array.isArray(rawPlan.rows) || rawPlan.rows.length === 0) {
    return { valid: false, error: "The pricing plan contains no shop rows." };
  }
  if (rawPlan.rows.length > SHOP_LIMITS.maxShopRows) {
    return { valid: false, error: "The pricing plan exceeds the safe shop-row limit." };
  }
  const rows = [];
  const ids = new Set();
  const objectFields = new Set();
  const priceFields = new Set();
  for (const rawRow of rawPlan.rows) {
    const row = sanitizeShopRow(rawRow);
    if (!row) return { valid: false, error: "A shop row contains invalid values." };
    if (ids.has(row.id) || objectFields.has(row.objectIdField) || priceFields.has(row.priceField)) {
      return { valid: false, error: "The pricing plan contains duplicate shop rows." };
    }
    ids.add(row.id);
    objectFields.add(row.objectIdField);
    priceFields.add(row.priceField);
    rows.push(row);
  }
  const settings = sanitizeSettings({ autoPricing: settingsInput }).autoPricing;
  const selected = rows.filter((row) => row.include && row.proposedPrice !== row.currentPrice);
  if (selected.length === 0) return { valid: false, error: "No changed prices were selected." };
  if (selected.length > settings.maxItems) {
    return { valid: false, error: "The selected changes exceed the configured per-run limit." };
  }
  if (selected.some((row) => row.proposedPrice < 1)) {
    return { valid: false, error: "Selected shop prices must be at least 1 NP." };
  }
  return { valid: true, plan: { accountContext, rows }, selectedCount: selected.length };
}

export function createWizardPayload(itemName) {
  const parameters = new URLSearchParams({
    type: "process_wizard",
    feedset: "0",
    shopwizard: itemName,
    table: "shop",
    criteria: "exact",
    min_price: "0",
    max_price: String(SHOP_LIMITS.maxPrice),
  });
  return parameters.toString();
}

export function createWizardRequestOptions(itemName) {
  return {
    method: "POST",
    headers: {
      Accept: "text/html, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: createWizardPayload(itemName),
  };
}

export function createShopUpdatePayload(rows) {
  const parameters = new URLSearchParams({ type: "update_prices" });
  for (const row of rows.filter((entry) => entry.include === true)) {
    parameters.set(row.objectIdField, row.id);
    parameters.set(row.priceField, String(row.proposedPrice));
  }
  return parameters.toString();
}

export async function createPlanFingerprint(plan) {
  const canonical = JSON.stringify({
    accountContext: plan.accountContext,
    rows: plan.rows.map((row) => [
      row.id,
      row.objectIdField,
      row.priceField,
      row.currentPrice,
      row.proposedPrice,
      row.include,
    ]),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createTextFingerprint(text) {
  if (typeof text !== "string") throw new TypeError("Fingerprint input must be text.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isTextFingerprint(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function redactOperationRecord(record) {
  return {
    operationId: record.operationId,
    timestamp: record.timestamp,
    itemCount: record.itemCount,
    status: record.status,
  };
}

export function isActiveOperationLock(lock, now = Date.now()) {
  return (
    isPlainObject(lock) &&
    typeof lock.operationId === "string" &&
    Number.isSafeInteger(lock.expiresAt) &&
    lock.expiresAt > now
  );
}

export function classifyMutationFailure(requestWasSubmitted) {
  return requestWasSubmitted === true ? "uncertain" : "failed";
}
