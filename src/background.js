import {
  MAIN_SHOP_LIMITS,
  MESSAGE_TYPES,
  PURCHASE_LIMITS,
  SHOP_LIMITS,
  STORAGE_KEYS,
} from "./shared/constants.js";
import {
  createMainShopFingerprint,
  isActiveMainShopLock,
  isDuplicateMainShopPurchase,
  isValidMainShopPurchaseTransition,
  redactMainShopRecord,
  validateMainShopLookupRequest,
  validateMainShopPurchaseRequest,
} from "./shared/main-shop-operations.js";
import {
  createPlanFingerprint,
  createShopUpdatePayload,
  isTextFingerprint,
  isActiveOperationLock,
  redactOperationRecord,
  validateLookupRequest,
  validatePricingPlan,
} from "./shared/pricing-operations.js";
import {
  createPurchaseFingerprint,
  isActivePurchaseLock,
  isDuplicatePurchase,
  redactPurchaseRecord,
  validatePurchaseLookupRequest,
  validatePurchaseRequest,
} from "./shared/purchase-operations.js";
import { validateExtensionSender } from "./shared/message-policy.js";
import { collectExpiredRuntimeKeys } from "./shared/runtime-state.js";
import { loadAppData } from "./shared/storage.js";
import {
  isKauvaraHaggleUrl,
  isKauvaraMagicShopUrl,
  isPlainObject,
  isValidUuid,
  sanitizeMainShopCandidate,
} from "./shared/validation.js";

const RATE_KEY = "neopianAssistant.runtime.lookupRate";
const LOCK_KEY = "neopianAssistant.runtime.applyLock";
const REVIEW_PREFIX = "neopianAssistant.runtime.priceReview.";
const CONFIRMATION_PREFIX = "neopianAssistant.runtime.confirmation.";
const PURCHASE_LOCK_KEY = "neopianAssistant.runtime.purchaseLock";
const PURCHASE_REVIEW_PREFIX = "neopianAssistant.runtime.purchaseReview.";
const PURCHASE_CONFIRMATION_PREFIX = "neopianAssistant.runtime.purchaseConfirmation.";
const MAIN_SHOP_LOCK_KEY = "neopianAssistant.runtime.mainShopLock";
const MAIN_SHOP_REVIEW_PREFIX = "neopianAssistant.runtime.mainShopReview.";
const MAIN_SHOP_PURCHASE_PREFIX = "neopianAssistant.runtime.mainShopPurchase.";
const EPHEMERAL_OPERATION_PREFIXES = Object.freeze([
  REVIEW_PREFIX,
  CONFIRMATION_PREFIX,
  PURCHASE_REVIEW_PREFIX,
  PURCHASE_CONFIRMATION_PREFIX,
  MAIN_SHOP_REVIEW_PREFIX,
  MAIN_SHOP_PURCHASE_PREFIX,
]);

const cancelledRuns = new Set();
const cancelledPurchaseMonitors = new Set();
const cancelledMainShopMonitors = new Set();
let lookupQueue = Promise.resolve();
let operationQueue = Promise.resolve();

function userError(message) {
  const error = new Error(message);
  error.userVisible = true;
  return error;
}

async function pruneExpiredOperationState() {
  const stored = await chrome.storage.session.get(null);
  const expiredKeys = collectExpiredRuntimeKeys(stored, EPHEMERAL_OPERATION_PREFIXES);
  if (expiredKeys.length > 0) await chrome.storage.session.remove(expiredKeys);
}

function validatePricingSender(sender) {
  return validateExtensionSender(sender, chrome.runtime.id, "pricing");
}

function validatePurchaseSender(sender) {
  return validateExtensionSender(sender, chrome.runtime.id, "purchase");
}

function validateMainShopSender(sender) {
  return validateExtensionSender(sender, chrome.runtime.id, "mainShop");
}

function validateMainShopPurchaseSender(sender) {
  return validateExtensionSender(sender, chrome.runtime.id, "mainShopPurchase");
}

function validateNeopetsSender(sender) {
  return validateExtensionSender(sender, chrome.runtime.id, "neopets");
}

async function getPricingSettings() {
  const data = await loadAppData();
  const settings = data.settings.autoPricing;
  if (!data.settings.enabled || !settings.enabled) {
    throw userError("Auto Pricing is disabled in Neopian Assistant settings.");
  }
  return settings;
}

async function getPurchaseSettings() {
  const data = await loadAppData();
  const settings = data.settings.autoBuy;
  if (!data.settings.enabled || !settings.enabled) {
    throw userError("SW Autobuy is disabled in Neopian Assistant settings.");
  }
  return settings;
}

async function getMainShopSettings() {
  const data = await loadAppData();
  const settings = data.settings.mainShopBuy;
  if (!data.settings.enabled || !settings.enabled) {
    throw userError("MS Autobuy is disabled in Neopian Assistant settings.");
  }
  return settings;
}

async function enforceLookupRate(intervalMs) {
  const now = Date.now();
  const record = await chrome.storage.session.get(RATE_KEY);
  const lastLookupAt = Number.isSafeInteger(record[RATE_KEY]?.lastLookupAt)
    ? record[RATE_KEY].lastLookupAt
    : 0;
  const waitMs = Math.max(0, intervalMs - (now - lastLookupAt));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  await chrome.storage.session.set({ [RATE_KEY]: { lastLookupAt: Date.now() } });
}

async function authorizePriceLookup(message) {
  const validation = validateLookupRequest(message);
  if (!validation.valid) throw userError(validation.error);
  if (cancelledRuns.delete(validation.runId)) throw userError("The pricing run was cancelled.");
  const settings = await getPricingSettings();
  await enforceLookupRate(settings.requestIntervalMs);
  if (cancelledRuns.delete(validation.runId)) throw userError("The pricing run was cancelled.");

  return { ok: true };
}

async function authorizePurchaseLookup(message) {
  const settings = await getPurchaseSettings();
  const validation = validatePurchaseLookupRequest(message, settings);
  if (!validation.valid) throw userError(validation.error);
  if (cancelledPurchaseMonitors.delete(validation.runId)) {
    throw userError("The SW Autobuy monitor was stopped.");
  }
  await enforceLookupRate(settings.requestIntervalMs);
  if (cancelledPurchaseMonitors.delete(validation.runId)) {
    throw userError("The SW Autobuy monitor was stopped.");
  }
  return { ok: true, itemName: validation.itemName };
}

async function authorizeMainShopLookup(message) {
  const settings = await getMainShopSettings();
  const validation = validateMainShopLookupRequest(message, settings);
  if (!validation.valid) throw userError(validation.error);
  if (cancelledMainShopMonitors.delete(validation.runId)) {
    throw userError("The MS Autobuy monitor was stopped.");
  }
  await enforceLookupRate(settings.requestIntervalMs);
  if (cancelledMainShopMonitors.delete(validation.runId)) {
    throw userError("The MS Autobuy monitor was stopped.");
  }
  return { ok: true, watchlistCount: validation.watchlist.length };
}

function cancelRun(runId) {
  if (!isValidUuid(runId)) return { ok: false };
  cancelledRuns.add(runId);
  while (cancelledRuns.size > 100) cancelledRuns.delete(cancelledRuns.values().next().value);
  return { ok: true };
}

function cancelPurchaseMonitor(runId) {
  if (!isValidUuid(runId)) return { ok: false };
  cancelledPurchaseMonitors.add(runId);
  while (cancelledPurchaseMonitors.size > 100) {
    cancelledPurchaseMonitors.delete(cancelledPurchaseMonitors.values().next().value);
  }
  return { ok: true };
}

function cancelMainShopMonitor(runId) {
  if (!isValidUuid(runId)) return { ok: false };
  cancelledMainShopMonitors.add(runId);
  while (cancelledMainShopMonitors.size > 100) {
    cancelledMainShopMonitors.delete(cancelledMainShopMonitors.values().next().value);
  }
  return { ok: true };
}

async function appendOperationRecord(record) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.operationHistory);
  const history = Array.isArray(stored[STORAGE_KEYS.operationHistory])
    ? stored[STORAGE_KEYS.operationHistory]
    : [];
  const withoutDuplicate = history.filter((entry) => entry.operationId !== record.operationId);
  withoutDuplicate.unshift(redactOperationRecord(record));
  await chrome.storage.local.set({
    [STORAGE_KEYS.operationHistory]: withoutDuplicate.slice(0, 20),
  });
}

async function prepareApply(message, sender) {
  if (!isValidUuid(message.operationId)) throw userError("The operation identifier is invalid.");
  if (!isTextFingerprint(message.responseFingerprint) || message.freshStateVerified !== true) {
    throw userError("The fresh shop response proof is invalid.");
  }
  const settings = await getPricingSettings();
  const validation = validatePricingPlan(message.plan, settings);
  if (!validation.valid) throw userError(validation.error);
  await pruneExpiredOperationState();
  const reviewId = crypto.randomUUID();
  const review = {
    operationId: message.operationId,
    tabId: sender.tab.id,
    accountContext: validation.plan.accountContext,
    itemCount: validation.selectedCount,
    planFingerprint: await createPlanFingerprint(validation.plan),
    responseFingerprint: message.responseFingerprint,
    expiresAt: Date.now() + SHOP_LIMITS.freshReviewTtlMs,
  };
  await chrome.storage.session.set({ [`${REVIEW_PREFIX}${reviewId}`]: review });
  return { ok: true, reviewId, itemCount: validation.selectedCount };
}

async function confirmApply(message, sender) {
  if (!isValidUuid(message.operationId) || !isValidUuid(message.reviewId)) {
    throw userError("The fresh price-review identifiers are invalid.");
  }
  const settings = await getPricingSettings();
  const validation = validatePricingPlan(message.plan, settings);
  if (!validation.valid) throw userError(validation.error);
  const reviewKey = `${REVIEW_PREFIX}${message.reviewId}`;
  const stored = await chrome.storage.session.get(reviewKey);
  const review = stored[reviewKey];
  if (
    message.freshStateVerified !== true ||
    !isPlainObject(review) ||
    review.expiresAt <= Date.now() ||
    review.operationId !== message.operationId ||
    review.tabId !== sender.tab.id ||
    review.accountContext !== validation.plan.accountContext ||
    review.planFingerprint !== (await createPlanFingerprint(validation.plan)) ||
    review.responseFingerprint !== message.responseFingerprint
  ) {
    throw userError("The fresh shop review expired or no longer matches this pricing plan.");
  }
  const token = crypto.randomUUID();
  await chrome.storage.session.set({
    [`${CONFIRMATION_PREFIX}${token}`]: {
      operationId: message.operationId,
      tabId: sender.tab.id,
      accountContext: validation.plan.accountContext,
      itemCount: validation.selectedCount,
      fingerprint: review.planFingerprint,
      expiresAt: Date.now() + SHOP_LIMITS.confirmationTtlMs,
    },
  });
  await chrome.storage.session.remove(reviewKey);
  return { ok: true, token, itemCount: validation.selectedCount };
}

async function acquireApplyLock(operationId, tabId) {
  const stored = await chrome.storage.session.get(LOCK_KEY);
  const lock = stored[LOCK_KEY];
  if (isActiveOperationLock(lock)) {
    throw userError("Another price update is already running in a different tab.");
  }
  await chrome.storage.session.set({
    [LOCK_KEY]: {
      operationId,
      tabId,
      expiresAt: Date.now() + SHOP_LIMITS.lockTtlMs,
    },
  });
}

async function releaseApplyState(operationId, token) {
  const stored = await chrome.storage.session.get(LOCK_KEY);
  if (stored[LOCK_KEY]?.operationId === operationId) await chrome.storage.session.remove(LOCK_KEY);
  if (token) await chrome.storage.session.remove(`${CONFIRMATION_PREFIX}${token}`);
}

async function applyPrices(message, sender) {
  if (!isValidUuid(message.operationId) || !isValidUuid(message.token)) {
    throw userError("The confirmation token or operation identifier is invalid.");
  }
  const settings = await getPricingSettings();
  if (settings.dryRun) throw userError("Disable dry-run mode before applying real prices.");
  const validation = validatePricingPlan(message.plan, settings);
  if (!validation.valid) throw userError(validation.error);

  const confirmationKey = `${CONFIRMATION_PREFIX}${message.token}`;
  const stored = await chrome.storage.session.get(confirmationKey);
  const confirmation = stored[confirmationKey];
  if (
    !isPlainObject(confirmation) ||
    confirmation.expiresAt <= Date.now() ||
    confirmation.operationId !== message.operationId ||
    confirmation.tabId !== sender.tab.id ||
    confirmation.accountContext !== validation.plan.accountContext ||
    confirmation.fingerprint !== (await createPlanFingerprint(validation.plan))
  ) {
    throw userError("The price-review confirmation expired or no longer matches this plan.");
  }

  await acquireApplyLock(message.operationId, sender.tab.id);
  try {
    await appendOperationRecord({
      operationId: message.operationId,
      timestamp: Date.now(),
      itemCount: validation.selectedCount,
      status: "running",
    });
    return {
      ok: true,
      operationId: message.operationId,
      updatePayload: createShopUpdatePayload(validation.plan.rows),
    };
  } catch (error) {
    await releaseApplyState(message.operationId, message.token).catch(() => undefined);
    throw error;
  }
}

async function recordVerification(message, sender) {
  if (!isValidUuid(message.operationId) || !isValidUuid(message.token)) {
    throw userError("The verification identifiers are invalid.");
  }
  const confirmationKey = `${CONFIRMATION_PREFIX}${message.token}`;
  const stored = await chrome.storage.session.get([confirmationKey, LOCK_KEY]);
  const confirmation = stored[confirmationKey];
  const lock = stored[LOCK_KEY];
  if (
    confirmation?.operationId !== message.operationId ||
    confirmation?.tabId !== sender.tab.id ||
    lock?.operationId !== message.operationId
  ) {
    throw userError("The verification no longer matches the active operation.");
  }
  await appendOperationRecord({
    operationId: message.operationId,
    timestamp: Date.now(),
    itemCount: confirmation.itemCount,
    status: message.verified === true ? "verified" : "uncertain",
  });
  await releaseApplyState(message.operationId, message.token);
  return { ok: true };
}

async function readPurchaseHistory() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.purchaseHistory);
  return Array.isArray(stored[STORAGE_KEYS.purchaseHistory])
    ? stored[STORAGE_KEYS.purchaseHistory]
    : [];
}

async function appendPurchaseRecord(record) {
  const history = await readPurchaseHistory();
  const withoutDuplicate = history.filter((entry) => entry.operationId !== record.operationId);
  withoutDuplicate.unshift(redactPurchaseRecord(record));
  await chrome.storage.local.set({
    [STORAGE_KEYS.purchaseHistory]: withoutDuplicate.slice(0, 20),
  });
}

async function assertPurchaseNotDuplicate(fingerprint) {
  if (isDuplicatePurchase(await readPurchaseHistory(), fingerprint)) {
    throw userError(
      "This exact listing was already purchased or has an uncertain recent result. No duplicate request was sent.",
    );
  }
}

async function preparePurchase(message, sender) {
  const settings = await getPurchaseSettings();
  if (settings.dryRun) throw userError("Disable SW Autobuy dry-run mode before a real purchase.");
  const validation = validatePurchaseRequest(message, settings);
  if (!validation.valid) throw userError(validation.error);
  await pruneExpiredOperationState();
  const fingerprint = await createPurchaseFingerprint(validation.candidate);
  await assertPurchaseNotDuplicate(fingerprint);
  await enforceLookupRate(SHOP_LIMITS.minLookupIntervalMs);
  const reviewId = crypto.randomUUID();
  await chrome.storage.session.set({
    [`${PURCHASE_REVIEW_PREFIX}${reviewId}`]: {
      operationId: validation.operationId,
      tabId: sender.tab.id,
      candidateFingerprint: fingerprint,
      freshLookupCount: 1,
      responseFingerprint: null,
      expiresAt: Date.now() + PURCHASE_LIMITS.reviewTtlMs,
    },
  });
  return { ok: true, reviewId };
}

async function authorizePurchaseRecheck(message, sender) {
  if (!isValidUuid(message.reviewId)) throw userError("The purchase review identifier is invalid.");
  const settings = await getPurchaseSettings();
  if (settings.dryRun) throw userError("Disable SW Autobuy dry-run mode before a real purchase.");
  const validation = validatePurchaseRequest(message, settings);
  if (!validation.valid) throw userError(validation.error);
  const candidateFingerprint = await createPurchaseFingerprint(validation.candidate);
  const reviewKey = `${PURCHASE_REVIEW_PREFIX}${message.reviewId}`;
  const stored = await chrome.storage.session.get(reviewKey);
  const review = stored[reviewKey];
  if (
    !isPlainObject(review) ||
    review.expiresAt <= Date.now() ||
    review.operationId !== validation.operationId ||
    review.tabId !== sender.tab.id ||
    review.candidateFingerprint !== candidateFingerprint ||
    review.responseFingerprint !== null ||
    !Number.isSafeInteger(review.freshLookupCount) ||
    review.freshLookupCount < 1 ||
    review.freshLookupCount >= PURCHASE_LIMITS.freshLookupAttempts
  ) {
    throw userError("The fresh purchase review expired or cannot authorize another lookup.");
  }
  await enforceLookupRate(SHOP_LIMITS.minLookupIntervalMs);
  const refreshed = (await chrome.storage.session.get(reviewKey))[reviewKey];
  if (
    !isPlainObject(refreshed) ||
    refreshed.expiresAt <= Date.now() ||
    refreshed.operationId !== review.operationId ||
    refreshed.tabId !== review.tabId ||
    refreshed.candidateFingerprint !== review.candidateFingerprint ||
    refreshed.responseFingerprint !== null ||
    refreshed.freshLookupCount !== review.freshLookupCount
  ) {
    throw userError("The fresh purchase review expired while waiting for the next lookup.");
  }
  const freshLookupCount = refreshed.freshLookupCount + 1;
  await chrome.storage.session.set({ [reviewKey]: { ...refreshed, freshLookupCount } });
  return { ok: true, itemName: validation.candidate.itemName, freshLookupCount };
}

async function bindPurchaseReview(message, sender) {
  if (!isValidUuid(message.reviewId)) throw userError("The purchase review identifier is invalid.");
  if (!isTextFingerprint(message.responseFingerprint)) {
    throw userError("The fresh purchase response fingerprint is invalid.");
  }
  const settings = await getPurchaseSettings();
  if (settings.dryRun) throw userError("Disable SW Autobuy dry-run mode before a real purchase.");
  const validation = validatePurchaseRequest(message, settings);
  if (!validation.valid) throw userError(validation.error);
  const candidateFingerprint = await createPurchaseFingerprint(validation.candidate);
  const reviewKey = `${PURCHASE_REVIEW_PREFIX}${message.reviewId}`;
  const stored = await chrome.storage.session.get(reviewKey);
  const review = stored[reviewKey];
  if (
    message.freshStateVerified !== true ||
    !isPlainObject(review) ||
    review.expiresAt <= Date.now() ||
    review.operationId !== validation.operationId ||
    review.tabId !== sender.tab.id ||
    review.candidateFingerprint !== candidateFingerprint ||
    review.responseFingerprint !== null
  ) {
    throw userError("The fresh purchase review expired or no longer matches this listing.");
  }
  await chrome.storage.session.set({
    [reviewKey]: { ...review, responseFingerprint: message.responseFingerprint },
  });
  return { ok: true };
}

async function confirmPurchase(message, sender) {
  if (!isValidUuid(message.reviewId)) throw userError("The purchase review identifier is invalid.");
  if (!isTextFingerprint(message.responseFingerprint)) {
    throw userError("The fresh purchase response fingerprint is invalid.");
  }
  const settings = await getPurchaseSettings();
  if (settings.dryRun) throw userError("Disable SW Autobuy dry-run mode before a real purchase.");
  const validation = validatePurchaseRequest(message, settings);
  if (!validation.valid) throw userError(validation.error);
  const candidateFingerprint = await createPurchaseFingerprint(validation.candidate);
  const reviewKey = `${PURCHASE_REVIEW_PREFIX}${message.reviewId}`;
  const stored = await chrome.storage.session.get(reviewKey);
  const review = stored[reviewKey];
  if (
    message.freshStateVerified !== true ||
    !isPlainObject(review) ||
    review.expiresAt <= Date.now() ||
    review.operationId !== validation.operationId ||
    review.tabId !== sender.tab.id ||
    review.candidateFingerprint !== candidateFingerprint ||
    review.responseFingerprint !== message.responseFingerprint
  ) {
    throw userError("The fresh purchase review expired or no longer matches this listing.");
  }
  await assertPurchaseNotDuplicate(candidateFingerprint);
  const token = crypto.randomUUID();
  await chrome.storage.session.set({
    [`${PURCHASE_CONFIRMATION_PREFIX}${token}`]: {
      operationId: validation.operationId,
      tabId: sender.tab.id,
      candidateFingerprint,
      expiresAt: Date.now() + PURCHASE_LIMITS.confirmationTtlMs,
    },
  });
  await chrome.storage.session.remove(reviewKey);
  return { ok: true, token };
}

async function acquirePurchaseLock(operationId, tabId) {
  const stored = await chrome.storage.session.get(PURCHASE_LOCK_KEY);
  if (isActivePurchaseLock(stored[PURCHASE_LOCK_KEY])) {
    throw userError("Another purchase is already running in a different tab.");
  }
  await chrome.storage.session.set({
    [PURCHASE_LOCK_KEY]: {
      operationId,
      tabId,
      expiresAt: Date.now() + PURCHASE_LIMITS.lockTtlMs,
    },
  });
}

async function releasePurchaseState(operationId, token) {
  const stored = await chrome.storage.session.get(PURCHASE_LOCK_KEY);
  if (stored[PURCHASE_LOCK_KEY]?.operationId === operationId) {
    await chrome.storage.session.remove(PURCHASE_LOCK_KEY);
  }
  if (token) await chrome.storage.session.remove(`${PURCHASE_CONFIRMATION_PREFIX}${token}`);
}

async function purchaseItem(message, sender) {
  if (!isValidUuid(message.token)) throw userError("The purchase confirmation token is invalid.");
  const settings = await getPurchaseSettings();
  if (settings.dryRun) throw userError("Disable SW Autobuy dry-run mode before a real purchase.");
  const validation = validatePurchaseRequest(message, settings);
  if (!validation.valid) throw userError(validation.error);
  const candidateFingerprint = await createPurchaseFingerprint(validation.candidate);
  const confirmationKey = `${PURCHASE_CONFIRMATION_PREFIX}${message.token}`;
  const stored = await chrome.storage.session.get(confirmationKey);
  const confirmation = stored[confirmationKey];
  if (
    !isPlainObject(confirmation) ||
    confirmation.expiresAt <= Date.now() ||
    confirmation.operationId !== validation.operationId ||
    confirmation.tabId !== sender.tab.id ||
    confirmation.candidateFingerprint !== candidateFingerprint
  ) {
    throw userError("The purchase confirmation expired or no longer matches this listing.");
  }
  await assertPurchaseNotDuplicate(candidateFingerprint);
  await acquirePurchaseLock(validation.operationId, sender.tab.id);
  try {
    await appendPurchaseRecord({
      operationId: validation.operationId,
      timestamp: Date.now(),
      status: "running",
      fingerprint: candidateFingerprint,
    });
    return {
      ok: true,
      operationId: validation.operationId,
      purchaseUrl: validation.candidate.purchaseUrl,
    };
  } catch (error) {
    await releasePurchaseState(validation.operationId, message.token).catch(() => undefined);
    throw error;
  }
}

async function recordPurchaseVerification(message, sender) {
  if (!isValidUuid(message.operationId) || !isValidUuid(message.token)) {
    throw userError("The purchase verification identifiers are invalid.");
  }
  const confirmationKey = `${PURCHASE_CONFIRMATION_PREFIX}${message.token}`;
  const stored = await chrome.storage.session.get([confirmationKey, PURCHASE_LOCK_KEY]);
  const confirmation = stored[confirmationKey];
  const lock = stored[PURCHASE_LOCK_KEY];
  if (
    confirmation?.operationId !== message.operationId ||
    confirmation?.tabId !== sender.tab.id ||
    lock?.operationId !== message.operationId
  ) {
    throw userError("The purchase verification no longer matches the active operation.");
  }
  await appendPurchaseRecord({
    operationId: message.operationId,
    timestamp: Date.now(),
    status: message.verified === true ? "verified" : "uncertain",
    fingerprint: confirmation.candidateFingerprint,
  });
  await releasePurchaseState(message.operationId, message.token);
  return { ok: true };
}

async function readMainShopHistory() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.mainShopHistory);
  return Array.isArray(stored[STORAGE_KEYS.mainShopHistory])
    ? stored[STORAGE_KEYS.mainShopHistory]
    : [];
}

async function appendMainShopRecord(record) {
  const history = await readMainShopHistory();
  const withoutDuplicate = history.filter((entry) => entry.operationId !== record.operationId);
  withoutDuplicate.unshift(redactMainShopRecord(record));
  await chrome.storage.local.set({
    [STORAGE_KEYS.mainShopHistory]: withoutDuplicate.slice(0, 20),
  });
}

async function assertMainShopNotDuplicate(fingerprint) {
  if (isDuplicateMainShopPurchase(await readMainShopHistory(), fingerprint)) {
    throw userError(
      "This exact Kauvara listing already reached purchase submission recently. No duplicate purchase was created.",
    );
  }
}

async function acquireMainShopLock(operationId, tabId) {
  const stored = await chrome.storage.session.get(MAIN_SHOP_LOCK_KEY);
  if (isActiveMainShopLock(stored[MAIN_SHOP_LOCK_KEY])) {
    throw userError("Another MS Autobuy purchase is already active in a different tab.");
  }
  await chrome.storage.session.set({
    [MAIN_SHOP_LOCK_KEY]: {
      operationId,
      tabId,
      expiresAt: Date.now() + MAIN_SHOP_LIMITS.lockTtlMs,
    },
  });
}

async function prepareMainShopPurchase(message, sender) {
  const settings = await getMainShopSettings();
  if (settings.dryRun) throw userError("Disable MS Autobuy dry-run mode before purchasing.");
  const validation = validateMainShopPurchaseRequest(message, settings);
  if (!validation.valid) throw userError(validation.error);
  await pruneExpiredOperationState();
  const fingerprint = await createMainShopFingerprint(validation.candidate);
  await assertMainShopNotDuplicate(fingerprint);
  await enforceLookupRate(settings.requestIntervalMs);
  const reviewId = crypto.randomUUID();
  await chrome.storage.session.set({
    [`${MAIN_SHOP_REVIEW_PREFIX}${reviewId}`]: {
      operationId: validation.operationId,
      tabId: sender.tab.id,
      candidateFingerprint: fingerprint,
      expiresAt: Date.now() + MAIN_SHOP_LIMITS.reviewTtlMs,
    },
  });
  return { ok: true, reviewId };
}

async function confirmMainShopPurchase(message, sender) {
  if (!isValidUuid(message.reviewId) || !isTextFingerprint(message.responseFingerprint)) {
    throw userError("The fresh MS Autobuy review proof is invalid.");
  }
  const settings = await getMainShopSettings();
  if (settings.dryRun) throw userError("Disable MS Autobuy dry-run mode before purchasing.");
  const validation = validateMainShopPurchaseRequest(message, settings);
  if (!validation.valid) throw userError(validation.error);
  const fingerprint = await createMainShopFingerprint(validation.candidate);
  const reviewKey = `${MAIN_SHOP_REVIEW_PREFIX}${message.reviewId}`;
  const stored = await chrome.storage.session.get(reviewKey);
  const review = stored[reviewKey];
  if (
    message.freshStateVerified !== true ||
    !isPlainObject(review) ||
    review.expiresAt <= Date.now() ||
    review.operationId !== validation.operationId ||
    review.tabId !== sender.tab.id ||
    review.candidateFingerprint !== fingerprint
  ) {
    throw userError("The fresh Kauvara review expired or no longer matches this listing.");
  }
  await assertMainShopNotDuplicate(fingerprint);
  await acquireMainShopLock(validation.operationId, sender.tab.id);
  const purchaseKey = `${MAIN_SHOP_PURCHASE_PREFIX}${sender.tab.id}`;
  try {
    await chrome.storage.session.set({
      [purchaseKey]: {
        operationId: validation.operationId,
        tabId: sender.tab.id,
        candidate: validation.candidate,
        candidateFingerprint: fingerprint,
        phase: "awaiting-listing",
        expiresAt: Date.now() + MAIN_SHOP_LIMITS.purchaseTtlMs,
      },
    });
    await chrome.storage.session.remove(reviewKey);
    return { ok: true, purchaseArmed: true };
  } catch (error) {
    const lock = (await chrome.storage.session.get(MAIN_SHOP_LOCK_KEY))[MAIN_SHOP_LOCK_KEY];
    if (lock?.operationId === validation.operationId) {
      await chrome.storage.session.remove(MAIN_SHOP_LOCK_KEY);
    }
    await chrome.storage.session.remove(purchaseKey).catch(() => undefined);
    throw error;
  }
}

function getMainShopPurchaseKey(tabId) {
  return `${MAIN_SHOP_PURCHASE_PREFIX}${tabId}`;
}

function sanitizePendingMainShopPurchase(raw, tabId) {
  if (
    !isPlainObject(raw) ||
    raw.tabId !== tabId ||
    !isValidUuid(raw.operationId) ||
    !["awaiting-listing", "awaiting-verification", "awaiting-haggle", "submitting"].includes(
      raw.phase,
    ) ||
    !Number.isSafeInteger(raw.expiresAt) ||
    raw.expiresAt <= Date.now() ||
    !/^[a-f0-9]{64}$/.test(raw.candidateFingerprint)
  ) {
    return null;
  }
  const candidate = sanitizeMainShopCandidate(raw.candidate);
  return candidate ? { ...raw, candidate } : null;
}

async function readPendingMainShopPurchase(tabId) {
  const key = getMainShopPurchaseKey(tabId);
  const stored = await chrome.storage.session.get(key);
  return { key, pending: sanitizePendingMainShopPurchase(stored[key], tabId) };
}

async function releaseMainShopPurchase(operationId, tabId) {
  const key = getMainShopPurchaseKey(tabId);
  const stored = await chrome.storage.session.get([key, MAIN_SHOP_LOCK_KEY]);
  const removals = [];
  if (stored[key]?.operationId === operationId) removals.push(key);
  if (stored[MAIN_SHOP_LOCK_KEY]?.operationId === operationId) removals.push(MAIN_SHOP_LOCK_KEY);
  if (removals.length > 0) await chrome.storage.session.remove(removals);
}

async function getMainShopPurchase(sender) {
  await pruneExpiredOperationState();
  const { pending } = await readPendingMainShopPurchase(sender.tab.id);
  const data = await loadAppData();
  const settings = data.settings.mainShopBuy;
  if (!data.settings.enabled || !settings.enabled || settings.dryRun) {
    if (pending) await releaseMainShopPurchase(pending.operationId, sender.tab.id);
    return { ok: true, pending: null };
  }
  if (!pending) return { ok: true, pending: null };
  return {
    ok: true,
    pending: {
      operationId: pending.operationId,
      candidate: pending.candidate,
      phase: pending.phase,
    },
  };
}

async function advanceMainShopPurchase(message, sender) {
  if (
    !isValidUuid(message.operationId) ||
    message.pageVerified !== true ||
    typeof message.nextPhase !== "string"
  ) {
    throw userError("The MS Autobuy purchase transition is invalid.");
  }
  const settings = await getMainShopSettings();
  if (settings.dryRun) throw userError("Disable MS Autobuy dry-run mode before purchasing.");
  const { key, pending } = await readPendingMainShopPurchase(sender.tab.id);
  if (!pending || pending.operationId !== message.operationId) {
    throw userError("The pending MS Autobuy purchase expired or no longer matches this tab.");
  }
  if (!isValidMainShopPurchaseTransition(pending.phase, message.nextPhase)) {
    throw userError("The MS Autobuy purchase is no longer in the expected phase.");
  }
  const onShopPage = isKauvaraMagicShopUrl(sender.tab.url);
  const onExactHagglePage = isKauvaraHaggleUrl(sender.tab.url, pending.candidate);
  const hasVerificationToken =
    onExactHagglePage && new URL(sender.tab.url).searchParams.has("cf_token");
  if (
    (["awaiting-verification", "awaiting-haggle"].includes(message.nextPhase) && !onShopPage) ||
    (message.nextPhase === "submitting" && !hasVerificationToken)
  ) {
    throw userError("The current Neopets page does not match this MS Autobuy purchase phase.");
  }
  if (message.nextPhase === "submitting") {
    await assertMainShopNotDuplicate(pending.candidateFingerprint);
    await appendMainShopRecord({
      operationId: pending.operationId,
      timestamp: Date.now(),
      status: "submitting",
      fingerprint: pending.candidateFingerprint,
    });
  }
  await chrome.storage.session.set({
    [key]: {
      ...pending,
      phase: message.nextPhase,
      expiresAt: Date.now() + MAIN_SHOP_LIMITS.purchaseTtlMs,
    },
  });
  return {
    ok: true,
    phase: message.nextPhase,
    ...(message.nextPhase === "submitting" ? { offer: pending.candidate.price } : {}),
  };
}

async function completeMainShopPurchase(message, sender) {
  if (
    !isValidUuid(message.operationId) ||
    !["verified", "failed", "uncertain"].includes(message.outcome)
  ) {
    throw userError("The MS Autobuy purchase result is invalid.");
  }
  const { pending } = await readPendingMainShopPurchase(sender.tab.id);
  if (!pending || pending.operationId !== message.operationId) {
    throw userError("The pending MS Autobuy purchase expired or no longer matches this tab.");
  }
  if (
    ["verified", "uncertain"].includes(message.outcome) &&
    (pending.phase !== "submitting" ||
      !isKauvaraHaggleUrl(sender.tab.url, pending.candidate) ||
      !new URL(sender.tab.url).searchParams.has("cf_token"))
  ) {
    throw userError("The MS Autobuy result does not match a submitted haggle offer.");
  }
  await appendMainShopRecord({
    operationId: pending.operationId,
    timestamp: Date.now(),
    status: message.outcome,
    fingerprint: pending.candidateFingerprint,
  });
  await releaseMainShopPurchase(pending.operationId, sender.tab.id);
  return { ok: true };
}

async function routeMessage(message, sender) {
  if (!isPlainObject(message) || typeof message.type !== "string") {
    throw userError("Unexpected extension message.");
  }
  if (message.type === MESSAGE_TYPES.openOptions) {
    if (!validateNeopetsSender(sender)) {
      throw userError("Settings can only be opened from a supported Neopets page.");
    }
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  }
  if (message.type === MESSAGE_TYPES.lookupPrice) {
    if (!validatePricingSender(sender))
      throw userError("This operation is only allowed on your shop stock page.");
    const task = lookupQueue.then(() => authorizePriceLookup(message));
    lookupQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.authorizePurchaseLookup) {
    if (!validatePurchaseSender(sender)) {
      throw userError("SW Autobuy monitoring is only allowed on the Shop Wizard page.");
    }
    const task = lookupQueue.then(() => authorizePurchaseLookup(message));
    lookupQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.authorizeMainShopLookup) {
    if (!validateMainShopSender(sender)) {
      throw userError("MS Autobuy monitoring is only allowed in Kauvara's Magic Shop.");
    }
    const task = lookupQueue.then(() => authorizeMainShopLookup(message));
    lookupQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.preparePriceApply) {
    if (!validatePricingSender(sender))
      throw userError("This operation is only allowed on your shop stock page.");
    const task = operationQueue.then(() => prepareApply(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.confirmPriceApply) {
    if (!validatePricingSender(sender))
      throw userError("This operation is only allowed on your shop stock page.");
    const task = operationQueue.then(() => confirmApply(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.applyPrices) {
    if (!validatePricingSender(sender))
      throw userError("This operation is only allowed on your shop stock page.");
    const task = operationQueue.then(() => applyPrices(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.recordVerification) {
    if (!validatePricingSender(sender))
      throw userError("This operation is only allowed on your shop stock page.");
    const task = operationQueue.then(() => recordVerification(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.preparePurchase) {
    if (!validatePurchaseSender(sender))
      throw userError("SW Autobuy is only allowed on a Shop Wizard results page.");
    const task = operationQueue.then(() => preparePurchase(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.authorizePurchaseRecheck) {
    if (!validatePurchaseSender(sender)) {
      throw userError("SW Autobuy is only allowed on a Shop Wizard results page.");
    }
    const task = operationQueue.then(() => authorizePurchaseRecheck(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.bindPurchaseReview) {
    if (!validatePurchaseSender(sender))
      throw userError("SW Autobuy is only allowed on a Shop Wizard results page.");
    const task = operationQueue.then(() => bindPurchaseReview(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.confirmPurchase) {
    if (!validatePurchaseSender(sender))
      throw userError("SW Autobuy is only allowed on a Shop Wizard results page.");
    const task = operationQueue.then(() => confirmPurchase(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.purchaseItem) {
    if (!validatePurchaseSender(sender))
      throw userError("SW Autobuy is only allowed on a Shop Wizard results page.");
    const task = operationQueue.then(() => purchaseItem(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.recordPurchaseVerification) {
    if (!validatePurchaseSender(sender))
      throw userError("SW Autobuy is only allowed on a Shop Wizard results page.");
    const task = operationQueue.then(() => recordPurchaseVerification(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.prepareMainShopPurchase) {
    if (!validateMainShopSender(sender)) {
      throw userError("MS Autobuy purchases are only allowed in Kauvara's Magic Shop.");
    }
    const task = operationQueue.then(() => prepareMainShopPurchase(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.confirmMainShopPurchase) {
    if (!validateMainShopSender(sender)) {
      throw userError("MS Autobuy purchases are only allowed in Kauvara's Magic Shop.");
    }
    const task = operationQueue.then(() => confirmMainShopPurchase(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.getMainShopPurchase) {
    if (!validateMainShopPurchaseSender(sender)) {
      throw userError("MS Autobuy purchases are only allowed on the exact Kauvara flow.");
    }
    return getMainShopPurchase(sender);
  }
  if (message.type === MESSAGE_TYPES.advanceMainShopPurchase) {
    if (!validateMainShopPurchaseSender(sender)) {
      throw userError("MS Autobuy purchases are only allowed on the exact Kauvara flow.");
    }
    const task = operationQueue.then(() => advanceMainShopPurchase(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.completeMainShopPurchase) {
    if (!validateMainShopPurchaseSender(sender)) {
      throw userError("MS Autobuy purchases are only allowed on the exact Kauvara flow.");
    }
    const task = operationQueue.then(() => completeMainShopPurchase(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  throw userError("Unexpected extension message type.");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.cancelPriceRun) {
    if (!validatePricingSender(sender)) {
      sendResponse({ ok: false, error: "Cancellation is only allowed on your shop stock page." });
      return false;
    }
    sendResponse(cancelRun(message.runId));
    return false;
  }
  if (message?.type === MESSAGE_TYPES.cancelPurchaseMonitor) {
    if (!validatePurchaseSender(sender)) {
      sendResponse({ ok: false, error: "Monitoring can only be stopped on the Shop Wizard page." });
      return false;
    }
    sendResponse(cancelPurchaseMonitor(message.runId));
    return false;
  }
  if (message?.type === MESSAGE_TYPES.cancelMainShopMonitor) {
    if (!validateMainShopSender(sender)) {
      sendResponse({ ok: false, error: "MS monitoring can only stop in Kauvara's Magic Shop." });
      return false;
    }
    sendResponse(cancelMainShopMonitor(message.runId));
    return false;
  }
  routeMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error?.userVisible ? error.message : "The extension could not complete the request.",
      });
    });
  return true;
});

async function initializeStorage() {
  try {
    await loadAppData();
  } catch {
    console.warn("Neopian Assistant could not initialize extension storage.");
  }
}

chrome.runtime.onInstalled.addListener(initializeStorage);
chrome.runtime.onStartup.addListener(initializeStorage);
