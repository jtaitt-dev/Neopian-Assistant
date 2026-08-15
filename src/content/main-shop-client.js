import { MAIN_SHOP_LIMITS, SHOP_LIMITS } from "../shared/constants.js";
import { fetchWithDeadline } from "../shared/network.js";
import { getMagicShopUrl } from "./main-shop-parser.js";

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

export async function fetchMagicShopHtml({
  fetchImplementation = globalThis.fetch,
  controller = new AbortController(),
} = {}) {
  const shopUrl = getMagicShopUrl();
  let response;
  try {
    response = await fetchWithDeadline({
      fetchImplementation,
      url: shopUrl,
      options: {
        method: "GET",
        headers: { Accept: "text/html,application/xhtml+xml" },
        cache: "no-store",
        credentials: "include",
        redirect: "error",
        referrer: shopUrl,
        referrerPolicy: "strict-origin-when-cross-origin",
      },
      timeoutMs: MAIN_SHOP_LIMITS.requestTimeoutMs,
      controller,
    });
  } catch {
    if (controller.signal.aborted) {
      const reason = controller.signal.reason === "cancelled" ? "cancelled" : "timed out";
      throw new Error(`The Kauvara stock request was ${reason}.`);
    }
    throw new Error("The Kauvara stock request failed. Check your connection and try again.");
  }
  if (!response.ok) throw new Error(`Kauvara's shop returned HTTP ${response.status}.`);
  const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
  if (declaredLength > SHOP_LIMITS.maxResponseBytes) {
    throw new Error("The Kauvara stock response exceeded the safe size limit.");
  }
  const html = await response.text();
  if (byteLength(html) > SHOP_LIMITS.maxResponseBytes) {
    throw new Error("The Kauvara stock response exceeded the safe size limit.");
  }
  return html;
}
