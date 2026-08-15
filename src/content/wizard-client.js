import { SHOP_LIMITS } from "../shared/constants.js";
import { fetchWithDeadline } from "../shared/network.js";
import { createWizardRequestOptions } from "../shared/pricing-operations.js";

const WIZARD_URL = "https://www.neopets.com/np-templates/ajax/wizard.php";
const WIZARD_PAGE_URL = "https://www.neopets.com/shops/wizard.phtml";

export async function fetchWizardHtml(
  itemName,
  { fetchImplementation = globalThis.fetch, controller = new AbortController() } = {},
) {
  if (typeof itemName !== "string" || itemName.length === 0 || itemName.length > 100) {
    throw new TypeError("A bounded item name is required for the Shop Wizard request.");
  }
  let response;
  try {
    response = await fetchWithDeadline({
      fetchImplementation,
      url: WIZARD_URL,
      options: {
        ...createWizardRequestOptions(itemName),
        cache: "no-store",
        credentials: "include",
        redirect: "error",
        referrer: WIZARD_PAGE_URL,
        referrerPolicy: "strict-origin-when-cross-origin",
      },
      timeoutMs: SHOP_LIMITS.requestTimeoutMs,
      controller,
    });
  } catch {
    if (controller.signal.aborted) {
      const reason = controller.signal.reason === "cancelled" ? "cancelled" : "timed out";
      throw new Error(`The Shop Wizard request was ${reason}.`);
    }
    throw new Error("The Shop Wizard request failed. Check your connection and try again.");
  }
  if (!response.ok) throw new Error(`The Shop Wizard returned HTTP ${response.status}.`);
  const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
  if (declaredLength > SHOP_LIMITS.maxResponseBytes) {
    throw new Error("The Shop Wizard response exceeded the safe size limit.");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > SHOP_LIMITS.maxResponseBytes) {
    throw new Error("The Shop Wizard response exceeded the safe size limit.");
  }
  return text;
}
