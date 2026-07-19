import { DEFAULT_SETTINGS, PURCHASE_LIMITS, SHOP_LIMITS } from "./constants.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEM_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;
const SHOP_OBJECT_ID_PATTERN = /^\d{1,16}$/;
const SHOP_FIELD_PATTERN = /^(?:obj_id|cost)_\d{1,4}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_ -]{2,40}$/;
const SHOP_OWNER_PATTERN = /^[A-Za-z0-9_]{2,40}$/;
const COOLDOWN_PATTERN = /^(?:daily|monthly|anytime|\d{1,2}[hm]|\d{1,2}\/day)$/;

export function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

export function boundedString(value, maximumLength, fallback = "") {
  if (typeof value !== "string") return fallback;
  const normalized = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  })
    .join("")
    .trim();
  return normalized.length > maximumLength ? normalized.slice(0, maximumLength) : normalized;
}

export function boundedInteger(value, minimum, maximum, fallback) {
  const number = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isSafeInteger(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

export function isAllowedNeopetsPageUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://www.neopets.com";
  } catch {
    return false;
  }
}

export function isOwnShopStockUrl(value) {
  if (!isAllowedNeopetsPageUrl(value)) return false;
  const url = new URL(value);
  return url.pathname === "/market.phtml" && url.searchParams.get("type") === "your";
}

export function isShopWizardUrl(value) {
  if (!isAllowedNeopetsPageUrl(value)) return false;
  return new URL(value).pathname === "/shops/wizard.phtml";
}

export function isAllowedItemIconUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://images.neopets.com";
  } catch {
    return false;
  }
}

export function makeStableItemId(name, url) {
  const slug = boundedString(name, 80, "daily")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  let hash = 0x811c9dc5;
  for (const character of `${name}|${url}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `daily-${slug || "item"}-${hash.toString(16).padStart(8, "0")}`;
}

export function sanitizeDaily(raw, fallbackGroup = "Custom") {
  if (!isPlainObject(raw)) return null;
  const name = boundedString(raw.name, 80);
  const url = boundedString(raw.url, 500);
  if (!name || !isAllowedNeopetsPageUrl(url)) return null;
  const candidateId = boundedString(raw.id, 80).toLowerCase();
  const id = ITEM_ID_PATTERN.test(candidateId) ? candidateId : makeStableItemId(name, url);
  const group = boundedString(raw.group ?? raw.category, 60, fallbackGroup) || fallbackGroup;
  const cooldownCandidate = boundedString(raw.cooldown, 24, "daily").toLowerCase();
  const cooldown = COOLDOWN_PATTERN.test(cooldownCandidate) ? cooldownCandidate : "anytime";
  const notes = boundedString(raw.notes, 140);
  const iconCandidate = boundedString(raw.iconUrl, 500);
  const iconUrl = isAllowedItemIconUrl(iconCandidate) ? iconCandidate : "";
  return { id, name, url, group, cooldown, notes, iconUrl };
}

export function sanitizeSettings(raw) {
  const defaults = cloneValue(DEFAULT_SETTINGS);
  if (!isPlainObject(raw)) return defaults;
  defaults.enabled = typeof raw.enabled === "boolean" ? raw.enabled : defaults.enabled;
  defaults.theme = ["system", "light", "dark"].includes(raw.theme) ? raw.theme : defaults.theme;
  defaults.density = ["comfortable", "compact"].includes(raw.density)
    ? raw.density
    : defaults.density;
  defaults.dailiesEnabled =
    typeof raw.dailiesEnabled === "boolean" ? raw.dailiesEnabled : defaults.dailiesEnabled;
  defaults.privacyAcknowledged = raw.privacyAcknowledged === true;

  if (isPlainObject(raw.panel)) {
    defaults.panel.top = boundedInteger(raw.panel.top, 4, 2000, defaults.panel.top);
    defaults.panel.right = boundedInteger(raw.panel.right, 4, 4000, defaults.panel.right);
    defaults.panel.width = boundedInteger(raw.panel.width, 340, 640, defaults.panel.width);
    defaults.panel.minimized = raw.panel.minimized === true;
  }

  const pricing = isPlainObject(raw.autoPricing)
    ? raw.autoPricing
    : isPlainObject(raw.pricer)
      ? raw.pricer
      : null;
  if (pricing) {
    defaults.autoPricing.enabled = pricing.enabled === true;
    defaults.autoPricing.dryRun = pricing.dryRun !== false;
    defaults.autoPricing.rule = ["undercut", "match", "overcut"].includes(pricing.rule)
      ? pricing.rule
      : defaults.autoPricing.rule;
    defaults.autoPricing.amount = boundedInteger(
      pricing.amount,
      0,
      SHOP_LIMITS.maxPrice,
      defaults.autoPricing.amount,
    );
    defaults.autoPricing.floor = boundedInteger(
      pricing.floor,
      1,
      SHOP_LIMITS.maxPrice,
      defaults.autoPricing.floor,
    );
    defaults.autoPricing.maxItems = boundedInteger(
      pricing.maxItems,
      1,
      SHOP_LIMITS.maxItemsPerRun,
      defaults.autoPricing.maxItems,
    );
    defaults.autoPricing.requestIntervalMs = boundedInteger(
      pricing.requestIntervalMs,
      SHOP_LIMITS.minLookupIntervalMs,
      SHOP_LIMITS.maxLookupIntervalMs,
      defaults.autoPricing.requestIntervalMs,
    );
  }

  if (isPlainObject(raw.autoBuy)) {
    defaults.autoBuy.enabled = raw.autoBuy.enabled === true;
    defaults.autoBuy.dryRun = raw.autoBuy.dryRun !== false;
    defaults.autoBuy.maximumPrice = boundedInteger(
      raw.autoBuy.maximumPrice,
      1,
      PURCHASE_LIMITS.absoluteMaximumPrice,
      defaults.autoBuy.maximumPrice,
    );
    defaults.autoBuy.watchlist = sanitizePurchaseWatchlist(raw.autoBuy.watchlist);
    defaults.autoBuy.requestIntervalMs = boundedInteger(
      raw.autoBuy.requestIntervalMs,
      SHOP_LIMITS.minLookupIntervalMs,
      SHOP_LIMITS.maxLookupIntervalMs,
      defaults.autoBuy.requestIntervalMs,
    );
  }
  return defaults;
}

export function sanitizePurchaseWatchlist(raw) {
  if (!Array.isArray(raw)) return [];
  const watchlist = [];
  const seen = new Set();
  for (const value of raw) {
    const itemName = boundedString(value, SHOP_LIMITS.maxItemNameLength);
    const key = itemName.toLocaleLowerCase("en-US");
    if (!itemName || seen.has(key)) continue;
    seen.add(key);
    watchlist.push(itemName);
    if (watchlist.length >= SHOP_LIMITS.maxPurchaseWatchlistItems) break;
  }
  return watchlist;
}

export function sanitizeCompletionState(raw) {
  if (!isPlainObject(raw)) return { completed: 0, lastCompleted: null, dateKey: null };
  const completed = boundedInteger(raw.completed, 0, 100, 0);
  const lastCompleted =
    Number.isSafeInteger(raw.lastCompleted) && raw.lastCompleted > 0 ? raw.lastCompleted : null;
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(raw.dateKey) ? raw.dateKey : null;
  return { completed, lastCompleted, dateKey };
}

export function parseNeopointValue(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 && value <= SHOP_LIMITS.maxPrice
      ? value
      : null;
  }
  if (typeof value !== "string") return null;
  const match = value.match(/^\s*(\d{1,6}|\d{1,3}(?:,\d{3}){1,2})\s*(?:NP)?\s*$/i);
  if (!match) return null;
  const compact = match[1].replace(/,/g, "");
  const price = Number.parseInt(compact, 10);
  return price <= SHOP_LIMITS.maxPrice ? price : null;
}

export function calculateSuggestedPrice(lowestPrice, settings) {
  const lowest = parseNeopointValue(lowestPrice);
  if (lowest === null || lowest === 0) return null;
  const sanitized = sanitizeSettings({ autoPricing: settings }).autoPricing;
  let result = lowest;
  if (sanitized.rule === "undercut") result -= sanitized.amount;
  if (sanitized.rule === "overcut") result += sanitized.amount;
  return Math.min(SHOP_LIMITS.maxPrice, Math.max(1, sanitized.floor, result));
}

export function isValidUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function sanitizeAccountContext(value) {
  const candidate = boundedString(value, 40);
  return USERNAME_PATTERN.test(candidate) ? candidate : null;
}

export function sanitizeLookupItem(raw) {
  if (!isPlainObject(raw)) return null;
  const id = boundedString(raw.id, SHOP_LIMITS.maxItemIdLength);
  const name = boundedString(raw.name, SHOP_LIMITS.maxItemNameLength);
  if (!SHOP_OBJECT_ID_PATTERN.test(id) || !name) return null;
  return { id, name };
}

export function sanitizeShopRow(raw) {
  if (!isPlainObject(raw)) return null;
  const id = boundedString(raw.id, SHOP_LIMITS.maxItemIdLength);
  const name = boundedString(raw.name, SHOP_LIMITS.maxItemNameLength);
  const objectIdField = boundedString(raw.objectIdField, 32);
  const priceField = boundedString(raw.priceField, 32);
  const currentPrice = parseNeopointValue(raw.currentPrice);
  const proposedPrice = parseNeopointValue(raw.proposedPrice);
  if (
    !SHOP_OBJECT_ID_PATTERN.test(id) ||
    !name ||
    !SHOP_FIELD_PATTERN.test(objectIdField) ||
    !SHOP_FIELD_PATTERN.test(priceField) ||
    !objectIdField.startsWith("obj_id_") ||
    !priceField.startsWith("cost_") ||
    currentPrice === null ||
    proposedPrice === null
  ) {
    return null;
  }
  return {
    id,
    name,
    objectIdField,
    priceField,
    currentPrice,
    proposedPrice,
    include: raw.include === true,
  };
}

export function sanitizePurchaseCandidate(raw) {
  if (!isPlainObject(raw)) return null;
  const itemName = boundedString(raw.itemName, SHOP_LIMITS.maxItemNameLength);
  const owner = boundedString(raw.owner, 40);
  const objectId = boundedString(raw.objectId, SHOP_LIMITS.maxItemIdLength);
  const price = parseNeopointValue(raw.price);
  const purchaseUrl = boundedString(raw.purchaseUrl, 500);
  if (
    !itemName ||
    !SHOP_OWNER_PATTERN.test(owner) ||
    !SHOP_OBJECT_ID_PATTERN.test(objectId) ||
    price === null ||
    price < 1 ||
    !isAllowedNeopetsPageUrl(purchaseUrl)
  ) {
    return null;
  }
  const url = new URL(purchaseUrl);
  const allowedKeys = ["owner", "buy_obj_info_id", "buy_cost_neopoints"];
  const actualKeys = [...url.searchParams.keys()];
  if (
    url.pathname !== "/browseshop.phtml" ||
    actualKeys.length !== allowedKeys.length ||
    allowedKeys.some((key) => !actualKeys.includes(key)) ||
    url.searchParams.get("owner") !== owner ||
    url.searchParams.get("buy_obj_info_id") !== objectId ||
    parseNeopointValue(url.searchParams.get("buy_cost_neopoints")) !== price
  ) {
    return null;
  }
  url.hash = "";
  return { itemName, owner, objectId, price, purchaseUrl: url.href };
}

export function parseCooldown(value) {
  const cooldown = COOLDOWN_PATTERN.test(value) ? value : "anytime";
  if (cooldown === "daily") return { type: "reset", period: "daily", limit: 1, durationMs: 0 };
  if (cooldown === "monthly") return { type: "reset", period: "monthly", limit: 1, durationMs: 0 };
  if (cooldown === "anytime") return { type: "manual", period: "daily", limit: 1, durationMs: 0 };
  const count = cooldown.match(/^(\d{1,2})\/day$/);
  if (count)
    return { type: "count", period: "daily", limit: Number.parseInt(count[1], 10), durationMs: 0 };
  const timer = cooldown.match(/^(\d{1,2})([hm])$/);
  if (timer) {
    const amount = Number.parseInt(timer[1], 10);
    const multiplier = timer[2] === "h" ? 3_600_000 : 60_000;
    return { type: "timer", period: null, limit: 1, durationMs: amount * multiplier };
  }
  return { type: "manual", period: "daily", limit: 1, durationMs: 0 };
}

export function getNeopianDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function getDailyStatus(item, state, now = Date.now()) {
  const cooldown = parseCooldown(item.cooldown);
  const safeState = sanitizeCompletionState(state);
  const today = getNeopianDateKey(new Date(now));
  const sameDay = safeState.dateKey === today;
  if (cooldown.type === "timer") {
    const availableAt = (safeState.lastCompleted ?? 0) + cooldown.durationMs;
    return { complete: availableAt > now, availableAt, count: safeState.completed, limit: 1 };
  }
  if (cooldown.period === "daily" && !sameDay) {
    return { complete: false, availableAt: null, count: 0, limit: cooldown.limit };
  }
  if (cooldown.period === "monthly" && safeState.dateKey?.slice(0, 7) !== today.slice(0, 7)) {
    return { complete: false, availableAt: null, count: 0, limit: 1 };
  }
  return {
    complete: safeState.completed >= cooldown.limit,
    availableAt: null,
    count: safeState.completed,
    limit: cooldown.limit,
  };
}
