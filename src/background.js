import { MESSAGE_TYPES, SHOP_LIMITS, STORAGE_KEYS } from "./shared/constants.js";
import {
  createPlanFingerprint,
  createShopUpdatePayload,
  createWizardPayload,
  isActiveOperationLock,
  redactOperationRecord,
  validateLookupRequest,
  validatePricingPlan,
} from "./shared/pricing-operations.js";
import { fetchWithDeadline } from "./shared/network.js";
import { loadAppData } from "./shared/storage.js";
import { isOwnShopStockUrl, isPlainObject, isValidUuid } from "./shared/validation.js";

const RATE_KEY = "neopianAssistant.runtime.lookupRate";
const LOCK_KEY = "neopianAssistant.runtime.applyLock";
const CONFIRMATION_PREFIX = "neopianAssistant.runtime.confirmation.";
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

function validateSender(sender) {
  return (
    sender?.id === chrome.runtime.id &&
    Number.isInteger(sender.tab?.id) &&
    typeof sender.tab?.url === "string" &&
    isOwnShopStockUrl(sender.tab.url)
  );
}

async function getPricingSettings() {
  const data = await loadAppData();
  const settings = data.settings.autoPricing;
  if (!data.settings.enabled || !settings.enabled) {
    throw userError("Auto Pricing is disabled in Neopian Assistant settings.");
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
  const token = crypto.randomUUID();
  const confirmation = {
    operationId: message.operationId,
    tabId: sender.tab.id,
    accountContext: validation.plan.accountContext,
    itemCount: validation.selectedCount,
    fingerprint: await createPlanFingerprint(validation.plan),
    expiresAt: Date.now() + SHOP_LIMITS.confirmationTtlMs,
  };
  await chrome.storage.session.set({ [`${CONFIRMATION_PREFIX}${token}`]: confirmation });
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
  await appendOperationRecord({
    operationId: message.operationId,
    timestamp: Date.now(),
    itemCount: validation.selectedCount,
    status: "running",
  });
  try {
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
      status: "failed",
    });
    await releaseApplyState(message.operationId, message.token);
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

async function routeMessage(message, sender) {
  if (!isPlainObject(message) || typeof message.type !== "string") {
    throw userError("Unexpected extension message.");
  }
  if (!validateSender(sender))
    throw userError("This operation is only allowed on your shop stock page.");
  if (message.type === MESSAGE_TYPES.lookupPrice) {
    const task = lookupQueue.then(() => lookupPrice(message));
    lookupQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.preparePriceApply) {
    const task = operationQueue.then(() => prepareApply(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.applyPrices) {
    const task = operationQueue.then(() => applyPrices(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  if (message.type === MESSAGE_TYPES.recordVerification) {
    const task = operationQueue.then(() => recordVerification(message, sender));
    operationQueue = task.catch(() => undefined);
    return task;
  }
  throw userError("Unexpected extension message type.");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MESSAGE_TYPES.cancelPriceRun) {
    if (!validateSender(sender)) {
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
