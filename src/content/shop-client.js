import { PURCHASE_LIMITS, SHOP_LIMITS } from "../shared/constants.js";
import { fetchWithDeadline } from "../shared/network.js";
import { sanitizePurchaseCandidate } from "../shared/validation.js";

const SHOP_STOCK_URL = "https://www.neopets.com/market.phtml?type=your";
const SHOP_UPDATE_URL = "https://www.neopets.com/process_market.phtml";

function serializedByteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function serializeDocumentElement(documentElement) {
  if (typeof globalThis.XMLSerializer !== "function") {
    throw new Error("The browser could not serialize the hydrated Neopets shop page.");
  }
  return new globalThis.XMLSerializer().serializeToString(documentElement);
}

function inspectHydratedShopFrame(frame, serializeImplementation) {
  let documentObject;
  try {
    documentObject = frame.contentDocument;
  } catch {
    return null;
  }
  if (!documentObject?.documentElement) return null;

  let url;
  try {
    url = new URL(documentObject.URL || documentObject.location?.href || "");
  } catch {
    return null;
  }
  if (
    url.origin !== "https://www.neopets.com" ||
    url.pathname !== "/market.phtml" ||
    url.searchParams.get("type") !== "your"
  ) {
    return null;
  }

  const form = documentObject.querySelector("form[action*='process_market.phtml']");
  if (!form) return null;
  const objectFields = [...form.querySelectorAll("input[name^='obj_id_']")];
  const priceFields = [...form.querySelectorAll("input[name^='cost_']")];
  if (objectFields.length === 0 || objectFields.length > SHOP_LIMITS.maxShopRows) return null;
  const priceNames = new Set(priceFields.map((field) => field.name));
  const pairedRows = objectFields.filter((field) =>
    priceNames.has(`cost_${field.name.slice("obj_id_".length)}`),
  );
  if (pairedRows.length !== objectFields.length || pairedRows.length !== priceFields.length) {
    return null;
  }

  const html = serializeImplementation(documentObject.documentElement);
  if (typeof html !== "string" || html.length === 0) return null;
  if (serializedByteLength(html) > SHOP_LIMITS.maxResponseBytes) {
    throw new Error("The hydrated Neopets shop page exceeded the safe size limit.");
  }
  return html;
}

async function readBoundedHtml(response) {
  const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
  if (declaredLength > SHOP_LIMITS.maxResponseBytes) {
    throw new Error("The Neopets response exceeded the safe size limit.");
  }
  const html = await response.text();
  if (serializedByteLength(html) > SHOP_LIMITS.maxResponseBytes) {
    throw new Error("The Neopets response exceeded the safe size limit.");
  }
  return html;
}

async function fetchAuthenticatedHtml({
  url,
  options,
  timeoutMs,
  fetchImplementation,
  controller,
  label,
}) {
  let response;
  try {
    response = await fetchWithDeadline({
      fetchImplementation,
      url,
      options: {
        ...options,
        cache: "no-store",
        credentials: "include",
        referrer: SHOP_STOCK_URL,
        referrerPolicy: "strict-origin-when-cross-origin",
      },
      timeoutMs,
      controller,
    });
  } catch {
    if (controller.signal.aborted) throw new Error(`The ${label} request timed out.`);
    throw new Error(`The ${label} request failed. Check your connection and do not retry blindly.`);
  }
  if (!response.ok) throw new Error(`The ${label} request returned HTTP ${response.status}.`);
  return readBoundedHtml(response);
}

function validateShopUpdatePayload(payload) {
  if (typeof payload !== "string" || payload.length === 0 || payload.length > 50_000) return false;
  const entries = [...new URLSearchParams(payload).entries()];
  if (entries.length < 3 || entries.length > SHOP_LIMITS.maxShopRows * 2 + 1) return false;
  const typeEntries = entries.filter(([key]) => key === "type");
  if (typeEntries.length !== 1 || typeEntries[0][1] !== "update_prices") return false;
  const objectIndexes = new Set();
  const priceIndexes = new Set();
  const keys = new Set();
  for (const [key, value] of entries) {
    if (keys.has(key)) return false;
    keys.add(key);
    if (key === "type") continue;
    const objectMatch = /^obj_id_(\d{1,6})$/.exec(key);
    const priceMatch = /^cost_(\d{1,6})$/.exec(key);
    if (!objectMatch && !priceMatch) return false;
    if (objectMatch) {
      if (!/^\d{1,16}$/.test(value)) return false;
      objectIndexes.add(objectMatch[1]);
      continue;
    }
    if (!/^\d{1,6}$/.test(value)) return false;
    const price = Number(value);
    if (!Number.isSafeInteger(price) || price < 0 || price > SHOP_LIMITS.maxPrice) return false;
    priceIndexes.add(priceMatch[1]);
  }
  return (
    objectIndexes.size > 0 &&
    objectIndexes.size === priceIndexes.size &&
    [...objectIndexes].every((index) => priceIndexes.has(index))
  );
}

export function loadHydratedShopStockHtml({
  documentObject = globalThis.document,
  timeoutMs = SHOP_LIMITS.requestTimeoutMs,
  pollIntervalMs = 100,
  setTimeoutImplementation = globalThis.setTimeout,
  clearTimeoutImplementation = globalThis.clearTimeout,
  serializeImplementation = serializeDocumentElement,
} = {}) {
  if (
    !documentObject?.createElement ||
    !(documentObject.body || documentObject.documentElement) ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isFinite(pollIntervalMs) ||
    pollIntervalMs <= 0 ||
    typeof serializeImplementation !== "function"
  ) {
    return Promise.reject(new TypeError("A valid document and hydration timeout are required."));
  }

  return new Promise((resolve, reject) => {
    const frame = documentObject.createElement("iframe");
    let pollTimer = null;
    let deadlineTimer = null;
    let settled = false;

    const cleanup = () => {
      if (pollTimer !== null) clearTimeoutImplementation(pollTimer);
      if (deadlineTimer !== null) clearTimeoutImplementation(deadlineTimer);
      frame.removeEventListener?.("load", inspect);
      frame.removeEventListener?.("error", failLoad);
      frame.remove?.();
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const inspect = () => {
      if (settled) return;
      try {
        const html = inspectHydratedShopFrame(frame, serializeImplementation);
        if (html) {
          finish(resolve, html);
          return;
        }
      } catch (error) {
        finish(reject, error);
        return;
      }
      pollTimer = setTimeoutImplementation(inspect, pollIntervalMs);
    };
    const failLoad = () => {
      finish(reject, new Error("The authenticated Neopets shop page could not be loaded."));
    };

    frame.hidden = true;
    frame.tabIndex = -1;
    frame.setAttribute?.("aria-hidden", "true");
    frame.setAttribute?.("title", "Neopian Assistant shop verification");
    frame.addEventListener?.("load", inspect);
    frame.addEventListener?.("error", failLoad);
    frame.src = SHOP_STOCK_URL;
    deadlineTimer = setTimeoutImplementation(() => {
      finish(
        reject,
        new Error("The authenticated Neopets shop page did not finish loading stock in time."),
      );
    }, timeoutMs);
    (documentObject.body || documentObject.documentElement).append(frame);
    inspect();
  });
}

export async function submitShopUpdate(
  payload,
  { fetchImplementation = globalThis.fetch, controller = new AbortController() } = {},
) {
  if (!validateShopUpdatePayload(payload)) {
    throw new TypeError("The authorized shop update payload is invalid.");
  }
  return fetchAuthenticatedHtml({
    url: SHOP_UPDATE_URL,
    options: {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: payload,
      redirect: "follow",
    },
    timeoutMs: SHOP_LIMITS.applyTimeoutMs,
    fetchImplementation,
    controller,
    label: "shop update",
  });
}

export async function fetchPurchaseHtml(
  candidateInput,
  { fetchImplementation = globalThis.fetch, controller = new AbortController() } = {},
) {
  const candidate = sanitizePurchaseCandidate(candidateInput);
  if (!candidate) throw new TypeError("The authorized purchase listing is invalid.");
  return fetchAuthenticatedHtml({
    url: candidate.purchaseUrl,
    options: { method: "GET", redirect: "follow" },
    timeoutMs: PURCHASE_LIMITS.requestTimeoutMs,
    fetchImplementation,
    controller,
    label: "purchase",
  });
}
