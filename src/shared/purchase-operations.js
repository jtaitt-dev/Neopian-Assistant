import { PURCHASE_LIMITS } from "./constants.js";
import {
  isPlainObject,
  isValidUuid,
  sanitizePurchaseCandidate,
  sanitizeSettings,
} from "./validation.js";

export function validatePurchaseRequest(message, settingsInput) {
  if (!isPlainObject(message) || !isValidUuid(message.operationId)) {
    return { valid: false, error: "The purchase operation identifier is invalid." };
  }
  const candidate = sanitizePurchaseCandidate(message.candidate);
  if (!candidate) return { valid: false, error: "The selected shop item is invalid." };
  const settings = sanitizeSettings({ autoBuy: settingsInput }).autoBuy;
  if (candidate.price > settings.maximumPrice) {
    return {
      valid: false,
      error: `The selected item exceeds the ${settings.maximumPrice.toLocaleString()} NP purchase limit.`,
    };
  }
  return { valid: true, operationId: message.operationId, candidate, settings };
}

export async function createPurchaseFingerprint(candidate) {
  const sanitized = sanitizePurchaseCandidate(candidate);
  if (!sanitized) throw new TypeError("A valid purchase candidate is required.");
  const canonical = JSON.stringify([
    sanitized.itemName,
    sanitized.owner,
    sanitized.objectId,
    sanitized.price,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isDuplicatePurchase(history, fingerprint, now = Date.now()) {
  if (!Array.isArray(history) || typeof fingerprint !== "string") return false;
  return history.some(
    (entry) =>
      isPlainObject(entry) &&
      entry.fingerprint === fingerprint &&
      ["running", "pending_verification", "verified", "uncertain"].includes(entry.status) &&
      Number.isSafeInteger(entry.timestamp) &&
      now - entry.timestamp <= PURCHASE_LIMITS.deduplicationWindowMs,
  );
}

export function redactPurchaseRecord(record) {
  return {
    operationId: record.operationId,
    timestamp: record.timestamp,
    itemCount: 1,
    status: record.status,
    fingerprint: record.fingerprint,
  };
}

export function isActivePurchaseLock(lock, now = Date.now()) {
  return (
    isPlainObject(lock) &&
    isValidUuid(lock.operationId) &&
    Number.isSafeInteger(lock.expiresAt) &&
    lock.expiresAt > now
  );
}
