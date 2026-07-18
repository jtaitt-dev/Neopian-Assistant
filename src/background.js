import { MESSAGE_TYPES, PURCHASE_LIMITS, SHOP_LIMITS, STORAGE_KEYS } from "./shared/constants.js";
import {
  classifyMutationFailure,
  createPlanFingerprint,
  createShopUpdatePayload,
  createTextFingerprint,
  createWizardPayload,
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
  validatePurchaseRequest,
} from "./shared/purchase-operations.js";
import { fetchWithDeadline } from "./shared/network.js";
import { validateExtensionSender } from "./shared/message-policy.js";
import { loadAppData } from "./shared/storage.js";
import { isPlainObject, isValidUuid } from "./shared/validation.js";

const RATE_KEY = "neopianAssistant.runtime.lookupRate";
const LOCK_KEY = "neopianAssistant.runtime.applyLock";
const REVIEW_PREFIX = "neopianAssistant.runtime.priceReview.";
const CONFIRMATION_PREFIX = "neopianAssistant.runtime.confirmation.";
const PURCHASE_LOCK_KEY = "neopianAssistant.runtime.purchaseLock";
const PURCHASE_REVIEW_PREFIX = "neopianAssistant.runtime.purchaseReview.";
const PURCHASE_CONFIRMATION_PREFIX = "neopianAssistant.runtime.purchaseConfirmation.";
const WIZARD_URL = "https://www.neopets.com/np-templates/ajax/wizard.php";
const SHOP_URL = "https://www.neopets.com/market.phtml";
const SHOP_STOCK_URL = "https://www.neopets.com/market.phtml?type=your";

const controllers = new Map();
const cancelledRuns = new Set();
let lookupQueue = Promise.resolve();
let operationQueue = Promise.resolve();

function userError(message) {
  const error = new Error(message);
  error.userVisible = true;
  return error;
}

function validatePricingSender(sender) {
  return validateExtensionSender(sender, chrome.runtime.id, "pricing");
}

function validatePurchaseSender(sender) {
  return validateExtensionSender(sender, chrome.runtime.id, "purchase");
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
    throw userError("Auto Buy is disabled in Neopian Assistant settings.");
  }
  return settings;
}

async function readBoundedText(response) {
  const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
  if (declaredLength > SHOP_LIMITS.maxResponseBytes) {
    throw userError("The Neopets response exceeded the safe size limit.");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > SHOP_LIMITS.maxResponseBytes) {
    throw userError("The Neopets response exceeded the safe size limit.");
  }
  return text;
}

async function fetchWithTimeout(url, options, timeoutMs, runId = null) {
  const controller = new AbortController();
  if (runId) controllers.set(runId, controller);
  try {
    return await fetchWithDeadline({
      fetchImplementation: fetch,
      url,
      options: { ...options, credentials: "include" },
      timeoutMs,
      controller,
    });
  } catch {
    if (controller.signal.aborted) {
      const reason = controller.signal.reason === "cancelled" ? "cancelled" : "timed out";
      throw userError(`The Neopets request was ${reason}.`);
    }
    throw userError("The Neopets request failed. Check your connection and try again.");
  } finally {
    if (runId) controllers.delete(runId);
  }
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

async function lookupPrice(message) {
  const validation = validateLookupRequest(message);
  if (!validation.valid) throw userError(validation.error);
  if (cancelledRuns.delete(validation.runId)) throw userError("The pricing run was cancelled.");
  const settings = await getPricingSettings();
  await enforceLookupRate(settings.requestIntervalMs);
  if (cancelledRuns.delete(validation.runId)) throw userError("The pricing run was cancelled.");

  const response = await fetchWithTimeout(
    WIZARD_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: createWizardPayload(validation.item.name),
    },
    SHOP_LIMITS.requestTimeoutMs,
    validation.runId,
  );
  if (!response.ok) throw userError(`The Shop Wizard returned HTTP ${response.status}.`);
  return { ok: true, responseText: await readBoundedText(response) };
}

function cancelRun(runId) {
  if (typeof runId !== "string" || runId.length > 80) return { ok: false };
  cancelledRuns.add(runId);
  while (cancelledRuns.size > 100) cancelledRuns.delete(cancelledRuns.values().next().value);
  const controller = controllers.get(runId);
  if (controller) controller.abort("cancelled");
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
  const settings = await getPricingSettings();
  const validation = validatePricingPlan(message.plan, settings);
  if (!validation.valid) throw userError(validation.error);
  const response = await fetchWithTimeout(
    SHOP_STOCK_URL,
    { method: "GET", cache: "no-store" },
    SHOP_LIMITS.requestTimeoutMs,
  );
  if (!response.ok) throw userError(`The fresh shop check returned HTTP ${response.status}.`);
  const freshShopHtml = await readBoundedText(response);
  const reviewId = crypto.randomUUID();
  const review = {
    operationId: message.operationId,
    tabId: sender.tab.id,
    accountContext: validation.plan.accountContext,
    itemCount: validation.selectedCount,
    planFingerprint: await createPlanFingerprint(validation.plan),
    responseFingerprint: await createTextFingerprint(freshShopHtml),
    expiresAt: Date.now() + SHOP_LIMITS.freshReviewTtlMs,
  };
  await chrome.storage.session.set({ [`${REVIEW_PREFIX}${reviewId}`]: review });
  return { ok: true, reviewId, itemCount: validation.selectedCount, freshShopHtml };
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
  let mutationSubmitted = false;
  try {
    await appendOperationRecord({
      operationId: message.operationId,
      timestamp: Date.now(),
      itemCount: validation.selectedCount,
      status: "running",
    });
    mutationSubmitted = true;
    const updateResponse = await fetchWithTimeout(
      SHOP_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: createShopUpdatePayload(validation.plan.rows),
      },
      SHOP_LIMITS.applyTimeoutMs,
    );
    if (!updateResponse.ok) {
      throw userError(`The shop update returned HTTP ${updateResponse.status}.`);
    }
    await readBoundedText(updateResponse);

    const verificationResponse = await fetchWithTimeout(
      SHOP_STOCK_URL,
      { method: "GET" },
      SHOP_LIMITS.requestTimeoutMs,
    );
    if (!verificationResponse.ok) {
      throw userError(`The verification request returned HTTP ${verificationResponse.status}.`);
    }
    const verificationHtml = await readBoundedText(verificationResponse);
    await appendOperationRecord({
      operationId: message.operationId,
      timestamp: Date.now(),
      itemCount: validation.selectedCount,
      status: "pending_verification",
    });
    return { ok: true, operationId: message.operationId, verificationHtml };
  } catch (error) {
    await appendOperationRecord({
      operationId: message.operationId,
      timestamp: Date.now(),
      itemCount: validation.selectedCount,
      status: classifyMutationFailure(mutationSubmitted),
    }).catch(() => undefined);
    await releaseApplyState(message.operationId, message.token).catch(() => undefined);
    if (mutationSubmitted) {
      throw userError(
        "The price request may have reached Neopets, but its final state could not be verified. Reload shop stock and inspect every price before any manual retry.",
      );
    }
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
    status: message.verified === true ? "verified" : "verification_failed",
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
  if (settings.dryRun) throw userError("Disable Auto Buy dry-run mode before a real purchase.");
  const validation = validatePurchaseRequest(message, settings);
  if (!validation.valid) throw userError(validation.error);
  const fingerprint = await createPurchaseFingerprint(validation.candidate);
  await assertPurchaseNotDuplicate(fingerprint);
  await enforceLookupRate(SHOP_LIMITS.minLookupIntervalMs);
  const response = await fetchWithTimeout(
    WIZARD_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: createWizardPayload(validation.candidate.itemName),
      cache: "no-store",
    },
    SHOP_LIMITS.requestTimeoutMs,
  );
  if (!response.ok)
    throw userError(`The fresh Shop Wizard check returned HTTP ${response.status}.`);
  const freshWizardHtml = await readBoundedText(response);
  const reviewId = crypto.randomUUID();
  await chrome.storage.session.set({
    [`${PURCHASE_REVIEW_PREFIX}${reviewId}`]: {
      operationId: validation.operationId,
      tabId: sender.tab.id,
      candidateFingerprint: fingerprint,
      responseFingerprint: await createTextFingerprint(freshWizardHtml),
      expiresAt: Date.now() + PURCHASE_LIMITS.reviewTtlMs,
    },
  });
  return { ok: true, reviewId, freshWizardHtml };
}

async function confirmPurchase(message, sender) {
  if (!isValidUuid(message.reviewId)) throw userError("The purchase review identifier is invalid.");
  const settings = await getPurchaseSettings();
  if (settings.dryRun) throw userError("Disable Auto Buy dry-run mode before a real purchase.");
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
  if (settings.dryRun) throw userError("Disable Auto Buy dry-run mode before a real purchase.");
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
  let mutationSubmitted = false;
  try {
    await appendPurchaseRecord({
      operationId: validation.operationId,
      timestamp: Date.now(),
      status: "running",
      fingerprint: candidateFingerprint,
    });
    mutationSubmitted = true;
    const response = await fetchWithTimeout(
      validation.candidate.purchaseUrl,
      { method: "GET", cache: "no-store", redirect: "follow" },
      PURCHASE_LIMITS.requestTimeoutMs,
    );
    if (!response.ok) throw userError(`The purchase request returned HTTP ${response.status}.`);
    const purchaseHtml = await readBoundedText(response);
    await appendPurchaseRecord({
      operationId: validation.operationId,
      timestamp: Date.now(),
      status: "pending_verification",
      fingerprint: candidateFingerprint,
    });
    return { ok: true, operationId: validation.operationId, purchaseHtml };
  } catch (error) {
    await appendPurchaseRecord({
      operationId: validation.operationId,
      timestamp: Date.now(),
      status: classifyMutationFailure(mutationSubmitted),
      fingerprint: candidateFingerprint,
    }).catch(() => undefined);
    await releasePurchaseState(validation.operationId, message.token).catch(() => undefined);
    if (mutationSubmitted) {
      throw userError(
        "The purchase request may have reached Neopets, but its final state could not be verified. Check inventory and do not retry this listing.",
      );
    }
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
    const task = lookupQueue.then(() => lookupPrice(message));
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
      throw userError("Auto Buy is only allowed on a Shop Wizard results page.");
    const task = operationQueue.then(() => preparePurchase(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.confirmPurchase) {
    if (!validatePurchaseSender(sender))
      throw userError("Auto Buy is only allowed on a Shop Wizard results page.");
    const task = operationQueue.then(() => confirmPurchase(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.purchaseItem) {
    if (!validatePurchaseSender(sender))
      throw userError("Auto Buy is only allowed on a Shop Wizard results page.");
    const task = operationQueue.then(() => purchaseItem(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.recordPurchaseVerification) {
    if (!validatePurchaseSender(sender))
      throw userError("Auto Buy is only allowed on a Shop Wizard results page.");
    const task = operationQueue.then(() => recordPurchaseVerification(message, sender));
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
