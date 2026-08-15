import { MAIN_SHOP_LIMITS, MESSAGE_TYPES } from "../shared/constants.js";
import {
  isKauvaraHaggleUrl,
  isKauvaraMagicShopUrl,
  parseNeopointValue,
  sanitizeMainShopCandidate,
} from "../shared/validation.js";
import { extractMainShopCandidates } from "./main-shop-parser.js";

const FLOW_BANNER_ID = "neopian-assistant-ms-purchase";

function normalizeName(value) {
  return value.toLocaleLowerCase("en-US");
}

function normalizePageText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

async function sendChecked(sendImplementation, message) {
  const response = await sendImplementation(message);
  if (!response?.ok) {
    throw new Error(response?.error || "The extension did not return a valid response.");
  }
  return response;
}

function setBannerMessage(banner, message, tone = "running") {
  banner.root.dataset.tone = tone;
  banner.status.textContent = message;
}

function createFlowBanner(documentObject) {
  documentObject.getElementById(FLOW_BANNER_ID)?.remove();
  const root = documentObject.createElement("section");
  root.id = FLOW_BANNER_ID;
  root.className = "na-ms-purchase-flow";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.dataset.tone = "running";
  const heading = documentObject.createElement("strong");
  heading.textContent = "MS Autobuy";
  const status = documentObject.createElement("span");
  const cancel = documentObject.createElement("button");
  cancel.type = "button";
  cancel.className = "na-button na-button--secondary na-button--small";
  cancel.textContent = "Cancel";
  root.append(heading, status, cancel);
  documentObject.body.append(root);
  return { root, status, cancel };
}

export function findExactMainShopTrigger(documentObject, candidateInput) {
  const candidate = sanitizeMainShopCandidate(candidateInput);
  if (!candidate || !documentObject?.querySelectorAll) return null;
  const fresh = extractMainShopCandidates(documentObject).some(
    (item) =>
      item.itemName === candidate.itemName &&
      item.objectId === candidate.objectId &&
      item.stockId === candidate.stockId &&
      item.price === candidate.price &&
      item.haggleUrl === candidate.haggleUrl &&
      item.stock > 0,
  );
  if (!fresh) return null;
  const matches = [
    ...documentObject.querySelectorAll(".item-img[data-name][data-price][data-link]"),
  ].filter((trigger) => {
    let url;
    try {
      url = new URL(trigger.getAttribute("data-link") ?? "", "https://www.neopets.com/");
    } catch {
      return false;
    }
    return (
      normalizeName(trigger.getAttribute("data-name") ?? "") ===
        normalizeName(candidate.itemName) &&
      parseNeopointValue(trigger.getAttribute("data-price")) === candidate.price &&
      url.href === candidate.haggleUrl
    );
  });
  return matches.length === 1 ? matches[0] : null;
}

function isEnabledConfirmationButton(element) {
  return (
    element?.matches?.("button#confirm-link") === true &&
    element.disabled !== true &&
    element.getAttribute("aria-disabled") !== "true"
  );
}

export function waitForEnabledMainShopConfirmation(
  documentObject,
  {
    signal,
    timeoutMs = MAIN_SHOP_LIMITS.verificationTimeoutMs,
    MutationObserverImplementation = globalThis.MutationObserver,
  } = {},
) {
  const existing = documentObject.querySelector("button#confirm-link");
  if (isEnabledConfirmationButton(existing)) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    let observer;
    let timeout;
    const cleanup = () => {
      observer?.disconnect();
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };
    const succeedIfReady = () => {
      const button = documentObject.querySelector("button#confirm-link");
      if (!isEnabledConfirmationButton(button)) return false;
      cleanup();
      resolve(button);
      return true;
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("MS Autobuy was cancelled.", "AbortError"));
    };
    observer = new MutationObserverImplementation(succeedIfReady);
    observer.observe(documentObject.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error("The Neopets confirmation was not completed before it expired."));
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    succeedIfReady();
  });
}

function findHaggleButton(documentObject) {
  const buttons = [
    ...documentObject.querySelectorAll('button, input[type="submit"], input[type="button"]'),
  ].filter((element) => {
    const label = normalizePageText(element.textContent || element.getAttribute("value"));
    return /^Haggle!?$/i.test(label);
  });
  return buttons.length === 1 ? buttons[0] : null;
}

export function parseMainShopHaggleForm(documentObject, candidateInput) {
  const candidate = sanitizeMainShopCandidate(candidateInput);
  if (!candidate || !documentObject?.querySelectorAll) return null;
  const expectedHeading = normalizeName(`Haggle for ${candidate.itemName}`);
  const headingMatches = [...documentObject.querySelectorAll("h1, h2, h3")].filter(
    (heading) => normalizeName(normalizePageText(heading.textContent)) === expectedHeading,
  );
  const button = findHaggleButton(documentObject);
  const form = button?.closest("form") ?? null;
  const inputs = form
    ? [...form.querySelectorAll('input[type="text"], input[type="number"]')].filter(
        (input) => !input.disabled && !input.readOnly,
      )
    : [];
  if (
    headingMatches.length !== 1 ||
    !form ||
    inputs.length !== 1 ||
    !/Previous Offer\s*:\s*0 NP/i.test(normalizePageText(documentObject.body.textContent)) ||
    !/Current Offer\s*:\s*0 NP/i.test(normalizePageText(documentObject.body.textContent))
  ) {
    return null;
  }
  return { form, input: inputs[0], button };
}

export function parseMainShopPurchaseOutcome(documentObject, candidateInput, offerInput) {
  const candidate = sanitizeMainShopCandidate(candidateInput);
  const offer = parseNeopointValue(offerInput);
  if (!candidate || offer === null || !documentObject?.body) return "unknown";
  const text = normalizePageText(documentObject.body.textContent);
  const formattedOffer = offer.toLocaleString("en-US").replaceAll(",", "(?:,)?");
  const accepted = new RegExp(`I accept your offer of ${formattedOffer} Neopoints!?`, "i").test(
    text,
  );
  const added = text.includes(`${candidate.itemName} has been added to your inventory`);
  if (accepted && added) return "verified";
  if (
    /(?:sold out|already been sold|do not have enough Neopoints|offer was rejected|will not accept|won't accept|try another offer)/i.test(
      text,
    ) ||
    parseMainShopHaggleForm(documentObject, candidate)
  ) {
    return "failed";
  }
  return "unknown";
}

function setInputValue(input, value, documentObject) {
  const prototype = documentObject.defaultView?.HTMLInputElement?.prototype;
  const setter = prototype ? Object.getOwnPropertyDescriptor(prototype, "value")?.set : null;
  if (setter) setter.call(input, value);
  else input.value = value;
  const EventImplementation = documentObject.defaultView?.Event ?? globalThis.Event;
  input.dispatchEvent(new EventImplementation("input", { bubbles: true }));
  input.dispatchEvent(new EventImplementation("change", { bubbles: true }));
}

export async function continueMainShopPurchase({
  documentObject = document,
  locationObject = location,
  sendImplementation = (message) => chrome.runtime.sendMessage(message),
  waitForConfirmation = waitForEnabledMainShopConfirmation,
} = {}) {
  const pendingResponse = await sendChecked(sendImplementation, {
    type: MESSAGE_TYPES.getMainShopPurchase,
  });
  if (!pendingResponse.pending) return { state: "idle" };

  const pending = pendingResponse.pending;
  const candidate = sanitizeMainShopCandidate(pending.candidate);
  if (!candidate || typeof pending.operationId !== "string") {
    throw new Error("The pending MS Autobuy purchase is invalid.");
  }

  const banner = createFlowBanner(documentObject);
  const controller = new AbortController();
  let cancelled = false;
  const complete = async (outcome) =>
    sendChecked(sendImplementation, {
      type: MESSAGE_TYPES.completeMainShopPurchase,
      operationId: pending.operationId,
      outcome,
    });
  banner.cancel.addEventListener(
    "click",
    async () => {
      if (cancelled) return;
      cancelled = true;
      controller.abort();
      banner.cancel.disabled = true;
      await complete(pending.phase === "submitting" ? "uncertain" : "failed").catch(
        () => undefined,
      );
      setBannerMessage(banner, "Automatic purchase cancelled. No retry was attempted.", "error");
    },
    { once: true },
  );

  try {
    if (isKauvaraMagicShopUrl(locationObject.href)) {
      let phase = pending.phase;
      if (phase === "awaiting-listing") {
        const trigger = findExactMainShopTrigger(documentObject, candidate);
        if (!trigger) {
          await complete("failed");
          setBannerMessage(
            banner,
            `${candidate.itemName} changed or sold out before confirmation. No purchase was attempted.`,
            "error",
          );
          return { state: "failed" };
        }
        await sendChecked(sendImplementation, {
          type: MESSAGE_TYPES.advanceMainShopPurchase,
          operationId: pending.operationId,
          nextPhase: "awaiting-verification",
          pageVerified: true,
        });
        trigger.click();
        phase = "awaiting-verification";
      }
      if (phase === "awaiting-verification") {
        setBannerMessage(
          banner,
          `Found ${candidate.itemName} at ${candidate.price.toLocaleString()} NP. Complete Neopets' confirmation checkbox; the exact listed-price offer will continue automatically.`,
        );
        const confirmButton = await waitForConfirmation(documentObject, {
          signal: controller.signal,
        });
        if (cancelled) return { state: "cancelled" };
        await sendChecked(sendImplementation, {
          type: MESSAGE_TYPES.advanceMainShopPurchase,
          operationId: pending.operationId,
          nextPhase: "awaiting-haggle",
          pageVerified: true,
        });
        banner.cancel.disabled = true;
        setBannerMessage(banner, "Confirmation complete. Opening the exact haggle form…");
        confirmButton.click();
        return { state: "awaiting-haggle" };
      }
      return { state: phase };
    }

    if (!isKauvaraHaggleUrl(locationObject.href, candidate)) {
      await complete(pending.phase === "submitting" ? "uncertain" : "failed");
      setBannerMessage(banner, "The purchase reached an unexpected page and stopped.", "error");
      return { state: "failed" };
    }

    if (pending.phase === "awaiting-haggle") {
      const haggle = parseMainShopHaggleForm(documentObject, candidate);
      if (!haggle) {
        await complete("failed");
        setBannerMessage(banner, "The exact haggle form could not be verified.", "error");
        return { state: "failed" };
      }
      const response = await sendChecked(sendImplementation, {
        type: MESSAGE_TYPES.advanceMainShopPurchase,
        operationId: pending.operationId,
        nextPhase: "submitting",
        pageVerified: true,
      });
      if (parseNeopointValue(response.offer) !== candidate.price) {
        throw new Error("The authorized MS Autobuy offer no longer matches the listed price.");
      }
      setInputValue(haggle.input, String(candidate.price), documentObject);
      banner.cancel.disabled = true;
      setBannerMessage(
        banner,
        `Submitting one ${candidate.itemName} offer at the exact ${candidate.price.toLocaleString()} NP listed price…`,
      );
      if (typeof haggle.form.requestSubmit === "function") haggle.form.requestSubmit(haggle.button);
      else haggle.button.click();
      return { state: "submitting", offer: candidate.price };
    }

    if (pending.phase === "submitting") {
      const outcome = parseMainShopPurchaseOutcome(documentObject, candidate, candidate.price);
      const recordedOutcome = outcome === "unknown" ? "uncertain" : outcome;
      await complete(recordedOutcome);
      banner.cancel.disabled = true;
      if (recordedOutcome === "verified") {
        setBannerMessage(
          banner,
          `Verified purchase: ${candidate.itemName} was added to inventory for ${candidate.price.toLocaleString()} NP.`,
          "success",
        );
      } else {
        setBannerMessage(
          banner,
          recordedOutcome === "failed"
            ? "Neopets did not accept the purchase. No retry was attempted."
            : "The purchase result could not be verified. Inspect the page before trying again.",
          "error",
        );
      }
      return { state: recordedOutcome };
    }
    return { state: pending.phase };
  } catch (error) {
    if (error?.name === "AbortError" || cancelled) return { state: "cancelled" };
    await complete(pending.phase === "submitting" ? "uncertain" : "failed").catch(() => undefined);
    banner.cancel.disabled = true;
    setBannerMessage(banner, `${error.message} No automatic retry was attempted.`, "error");
    return { state: "failed", error: error.message };
  }
}
