import { MAIN_SHOP_LIMITS, SHOP_LIMITS } from "../shared/constants.js";
import {
  boundedString,
  parseNeopointValue,
  sanitizeMainShopCandidate,
} from "../shared/validation.js";

function normalizeName(value) {
  return boundedString(value, SHOP_LIMITS.maxItemNameLength).toLocaleLowerCase("en-US");
}

function parseStock(value) {
  const match = boundedString(value, 80).match(/^(\d{1,3})\s+in stock$/i);
  if (!match) return null;
  const stock = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(stock) && stock > 0 && stock <= 999 ? stock : null;
}

function parseMainShopCard(card) {
  const trigger = card.querySelector(".item-img[data-name][data-price][data-link]");
  if (!trigger) return null;
  const itemName = boundedString(trigger.getAttribute("data-name"), SHOP_LIMITS.maxItemNameLength);
  const visibleName = boundedString(
    card.querySelector(".item-name")?.textContent,
    SHOP_LIMITS.maxItemNameLength,
  );
  if (!itemName || normalizeName(itemName) !== normalizeName(visibleName)) return null;

  const dataPrice = parseNeopointValue(trigger.getAttribute("data-price"));
  const stockLines = [...card.querySelectorAll(".item-stock")].map((element) =>
    boundedString(element.textContent, 80),
  );
  const stock = stockLines.map(parseStock).find((value) => value !== null) ?? null;
  const costLine = stockLines.find((value) => /^Cost:/i.test(value));
  const visiblePrice = parseNeopointValue(costLine?.replace(/^Cost:\s*/i, ""));
  if (dataPrice === null || dataPrice < 1 || dataPrice !== visiblePrice || stock === null) {
    return null;
  }

  let url;
  try {
    url = new URL(trigger.getAttribute("data-link") ?? "", "https://www.neopets.com/");
  } catch {
    return null;
  }
  const candidate = sanitizeMainShopCandidate({
    itemName,
    objectId: url.searchParams.get("obj_info_id"),
    stockId: url.searchParams.get("stock_id"),
    price: dataPrice,
    stock,
    haggleUrl: url.href,
  });
  return candidate;
}

export function extractMainShopCandidates(documentObject = document) {
  const form = documentObject?.querySelector?.('form[name="items_for_sale"]');
  if (!form) return [];
  const cards = [...form.querySelectorAll(".shop-grid > .shop-item")].slice(
    0,
    SHOP_LIMITS.maxShopRows,
  );
  const candidates = cards.map(parseMainShopCard).filter(Boolean);
  const unique = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.objectId}:${candidate.stockId}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()].sort(
    (left, right) => left.price - right.price || left.itemName.localeCompare(right.itemName),
  );
}

export function parseMainShopCandidates(
  responseText,
  requestedItemName = "",
  parser = new DOMParser(),
) {
  if (typeof responseText !== "string" || responseText.length === 0) return [];
  const documentObject = parser.parseFromString(responseText, "text/html");
  const requested = normalizeName(requestedItemName);
  return extractMainShopCandidates(documentObject).filter(
    (candidate) => !requested || normalizeName(candidate.itemName) === requested,
  );
}

export function verifyFreshMainShopCandidate(
  responseText,
  expectedInput,
  parser = new DOMParser(),
) {
  const expected = sanitizeMainShopCandidate(expectedInput);
  if (!expected) {
    return { fresh: false, error: "The selected Kauvara item is invalid." };
  }
  const candidates = parseMainShopCandidates(responseText, expected.itemName, parser);
  const match = candidates.find(
    (candidate) =>
      candidate.itemName === expected.itemName &&
      candidate.objectId === expected.objectId &&
      candidate.stockId === expected.stockId &&
      candidate.price === expected.price &&
      candidate.haggleUrl === expected.haggleUrl &&
      candidate.stock > 0,
  );
  if (match) return { fresh: true, candidate: match, error: null };
  const changed = candidates.some(
    (candidate) =>
      candidate.objectId === expected.objectId || candidate.stockId === expected.stockId,
  );
  return {
    fresh: false,
    candidate: null,
    error: changed
      ? "The Kauvara listing changed and the purchase was stopped."
      : "The selected Kauvara listing sold out or is no longer available.",
  };
}

export function getMagicShopUrl() {
  return `https://www.neopets.com/objects.phtml?type=shop&obj_type=${MAIN_SHOP_LIMITS.shopId}`;
}
