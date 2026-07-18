import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSuggestedPrice,
  getDailyStatus,
  isAllowedItemIconUrl,
  isAllowedNeopetsPageUrl,
  isOwnShopStockUrl,
  isShopWizardUrl,
  makeStableItemId,
  parseCooldown,
  parseNeopointValue,
  sanitizeDaily,
  sanitizeSettings,
  sanitizeShopRow,
  sanitizePurchaseCandidate,
} from "../src/shared/validation.js";

test("URL validation permits only the audited Neopets HTTPS origins", () => {
  assert.equal(isAllowedNeopetsPageUrl("https://www.neopets.com/market.phtml"), true);
  assert.equal(isAllowedNeopetsPageUrl("http://www.neopets.com/market.phtml"), false);
  assert.equal(isAllowedNeopetsPageUrl("https://www.neopets.com:444/market.phtml"), false);
  assert.equal(
    isAllowedNeopetsPageUrl("https://evil.example/?next=https://www.neopets.com"),
    false,
  );
  assert.equal(isAllowedItemIconUrl("https://images.neopets.com/items/example.gif"), true);
  assert.equal(isAllowedItemIconUrl("https://www.neopets.com/items/example.gif"), false);
  assert.equal(isAllowedItemIconUrl("https://images.neopets.com:444/items/example.gif"), false);
  assert.equal(isOwnShopStockUrl("https://www.neopets.com/market.phtml?type=your"), true);
  assert.equal(isOwnShopStockUrl("https://www.neopets.com/market.phtml?type=till"), false);
  assert.equal(isShopWizardUrl("https://www.neopets.com/shops/wizard.phtml"), true);
  assert.equal(isShopWizardUrl("https://www.neopets.com/browseshop.phtml"), false);
});

test("currency parsing rejects malformed, negative, decimal, and excessive prices", () => {
  assert.equal(parseNeopointValue("1,234 NP"), 1234);
  assert.equal(parseNeopointValue(999_999), 999_999);
  assert.equal(parseNeopointValue("-1"), null);
  assert.equal(parseNeopointValue("12.5"), null);
  assert.equal(parseNeopointValue("1,000,000"), null);
  assert.equal(parseNeopointValue("1,2,3"), null);
  assert.equal(parseNeopointValue("1 234 NP"), null);
  assert.equal(parseNeopointValue("abc"), null);
});

test("suggested pricing applies bounded rule, adjustment, and floor behavior", () => {
  assert.equal(calculateSuggestedPrice(1000, { rule: "undercut", amount: 1, floor: 0 }), 999);
  assert.equal(calculateSuggestedPrice(1000, { rule: "match", amount: 50, floor: 0 }), 1000);
  assert.equal(calculateSuggestedPrice(1000, { rule: "overcut", amount: 50, floor: 0 }), 1050);
  assert.equal(calculateSuggestedPrice(5, { rule: "undercut", amount: 20, floor: 3 }), 3);
  assert.equal(calculateSuggestedPrice(1, { rule: "undercut", amount: 20, floor: 0 }), 1);
  assert.equal(
    calculateSuggestedPrice(999_999, { rule: "overcut", amount: 20, floor: 0 }),
    999_999,
  );
  assert.equal(calculateSuggestedPrice(0, { rule: "match", amount: 0, floor: 0 }), null);
});

test("settings recover safe defaults from corrupt or excessive values", () => {
  const settings = sanitizeSettings({
    enabled: "yes",
    autoPricing: {
      enabled: true,
      dryRun: false,
      rule: "invalid",
      amount: -5,
      floor: 2_000_000,
      maxItems: 900,
      requestIntervalMs: 1,
    },
    autoBuy: { enabled: true, dryRun: false, maximumPrice: 2_000_000 },
  });
  assert.equal(settings.enabled, true);
  assert.equal(settings.autoPricing.enabled, true);
  assert.equal(settings.autoPricing.dryRun, false);
  assert.equal(settings.autoPricing.rule, "undercut");
  assert.equal(settings.autoPricing.amount, 0);
  assert.equal(settings.autoPricing.floor, 999_999);
  assert.equal(settings.autoPricing.maxItems, 25);
  assert.equal(settings.autoPricing.requestIntervalMs, 6000);
  assert.equal(settings.autoBuy.enabled, true);
  assert.equal(settings.autoBuy.dryRun, false);
  assert.equal(settings.autoBuy.maximumPrice, 999_999);
});

test("daily validation strips control characters and rejects off-origin links", () => {
  const valid = sanitizeDaily({
    name: "Daily\u0000 Name",
    url: "https://www.neopets.com/example.phtml",
    category: "Custom",
    cooldown: "30m",
    iconUrl: "https://images.neopets.com/items/example.gif",
  });
  assert.equal(valid.name, "Daily  Name");
  assert.equal(valid.group, "Custom");
  assert.equal(valid.cooldown, "30m");
  assert.equal(sanitizeDaily({ name: "Bad", url: "https://example.com" }), null);
});

test("stable item identifiers are deterministic and distinct by URL", () => {
  const first = makeStableItemId("Example", "https://www.neopets.com/a");
  assert.equal(first, makeStableItemId("Example", "https://www.neopets.com/a"));
  assert.notEqual(first, makeStableItemId("Example", "https://www.neopets.com/b"));
});

test("cooldown parsing and daily state honor count and timer rules", () => {
  assert.deepEqual(parseCooldown("10/day"), {
    type: "count",
    period: "daily",
    limit: 10,
    durationMs: 0,
  });
  assert.equal(parseCooldown("2h").durationMs, 7_200_000);
  const item = { cooldown: "2h" };
  const now = Date.now();
  assert.equal(
    getDailyStatus(item, { completed: 1, lastCompleted: now, dateKey: null }, now).complete,
    true,
  );
  assert.equal(
    getDailyStatus(item, { completed: 1, lastCompleted: now - 7_200_001, dateKey: null }, now)
      .complete,
    false,
  );
  assert.equal(parseCooldown("anytime").period, "daily");
  assert.equal(
    getDailyStatus(
      { cooldown: "anytime" },
      { completed: 1, lastCompleted: Date.UTC(2026, 6, 18, 6), dateKey: "2026-07-17" },
      Date.UTC(2026, 6, 18, 8),
    ).complete,
    false,
  );
});

test("purchase candidates bind one positive price to an exact Neopets shop URL", () => {
  const candidate = sanitizePurchaseCandidate({
    itemName: "Healing Potion I",
    owner: "safe_owner",
    objectId: "123456",
    price: "25",
    purchaseUrl:
      "https://www.neopets.com/browseshop.phtml?owner=safe_owner&buy_obj_info_id=123456&buy_cost_neopoints=25",
  });
  assert.equal(candidate.price, 25);
  assert.equal(sanitizePurchaseCandidate({ ...candidate, price: 0 }), null);
  assert.equal(
    sanitizePurchaseCandidate({
      ...candidate,
      purchaseUrl: `${candidate.purchaseUrl}&quantity=2`,
    }),
    null,
  );
  assert.equal(
    sanitizePurchaseCandidate({
      ...candidate,
      purchaseUrl: candidate.purchaseUrl.replace("www.neopets.com", "evil.example"),
    }),
    null,
  );
});

test("shop row validation rejects invalid identifiers, fields, and prices", () => {
  const row = sanitizeShopRow({
    id: "123",
    name: "Valid Item",
    objectIdField: "obj_id_1",
    priceField: "cost_1",
    currentPrice: "100",
    proposedPrice: 99,
    include: true,
  });
  assert.equal(row.proposedPrice, 99);
  assert.equal(sanitizeShopRow({ ...row, id: "1&cost_2=1" }), null);
  assert.equal(sanitizeShopRow({ ...row, priceField: "sale_1" }), null);
  assert.equal(sanitizeShopRow({ ...row, proposedPrice: 1_000_000 }), null);
});
