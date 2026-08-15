import { MAIN_SHOP_LIMITS } from "./constants.js";
import {
  isPlainObject,
  isValidUuid,
  sanitizeMainShopCandidate,
  sanitizeMainShopWatchlist,
  sanitizeSettings,
} from "./validation.js";

export function validateMainShopLookupRequest(message, settingsInput) {
  if (!isPlainObject(message) || !isValidUuid(message.runId) || !Array.isArray(message.watchlist)) {
    return { valid: false, error: "The MS Autobuy monitor request is invalid." };
  }
  const settings = sanitizeSettings({ mainShopBuy: settingsInput }).mainShopBuy;
  const savedWatchlist = sanitizeMainShopWatchlist(settings.watchlist);
  const requestedWatchlist = sanitizeMainShopWatchlist(message.watchlist);
  if (
    savedWatchlist.length === 0 ||
    message.watchlist.length !== requestedWatchlist.length ||
    requestedWatchlist.length !== savedWatchlist.length ||
    requestedWatchlist.some((itemName, index) => itemName !== savedWatchlist[index])
  ) {
    return { valid: false, error: "The MS Autobuy watchlist no longer matches saved settings." };
  }
  return { valid: true, runId: message.runId, watchlist: savedWatchlist, settings };
}

export function validateMainShopPurchaseRequest(message, settingsInput) {
  if (!isPlainObject(message) || !isValidUuid(message.operationId)) {
    return { valid: false, error: "The MS Autobuy operation identifier is invalid." };
  }
  const candidate = sanitizeMainShopCandidate(message.candidate);
  if (!candidate) return { valid: false, error: "The selected Kauvara item is invalid." };
  const settings = sanitizeSettings({ mainShopBuy: settingsInput }).mainShopBuy;
  const watched = settings.watchlist.some(
    (itemName) =>
      itemName.toLocaleLowerCase("en-US") === candidate.itemName.toLocaleLowerCase("en-US"),
  );
  if (!watched) {
    return { valid: false, error: "This item is not in the saved MS Autobuy watchlist." };
  }
  return { valid: true, operationId: message.operationId, candidate, settings };
}

export async function createMainShopFingerprint(candidateInput) {
  const candidate = sanitizeMainShopCandidate(candidateInput);
  if (!candidate) throw new TypeError("A valid Kauvara item is required.");
  const canonical = JSON.stringify([
    candidate.itemName,
    candidate.objectId,
    candidate.stockId,
    candidate.price,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isDuplicateMainShopPurchase(history, fingerprint, now = Date.now()) {
  if (!Array.isArray(history) || typeof fingerprint !== "string") return false;
  return history.some(
    (entry) =>
      isPlainObject(entry) &&
      entry.fingerprint === fingerprint &&
      ["submitting", "verified", "uncertain"].includes(entry.status) &&
      Number.isSafeInteger(entry.timestamp) &&
      now - entry.timestamp <= MAIN_SHOP_LIMITS.deduplicationWindowMs,
  );
}

export function isValidMainShopPurchaseTransition(currentPhase, nextPhase) {
  return (
    (currentPhase === "awaiting-listing" && nextPhase === "awaiting-verification") ||
    (currentPhase === "awaiting-verification" && nextPhase === "awaiting-haggle") ||
    (currentPhase === "awaiting-haggle" && nextPhase === "submitting")
  );
}

export function redactMainShopRecord(record) {
  return {
    operationId: record.operationId,
    timestamp: record.timestamp,
    itemCount: 1,
    status: record.status,
    fingerprint: record.fingerprint,
  };
}

export function isActiveMainShopLock(lock, now = Date.now()) {
  return (
    isPlainObject(lock) &&
    isValidUuid(lock.operationId) &&
    Number.isSafeInteger(lock.expiresAt) &&
    lock.expiresAt > now
  );
}
