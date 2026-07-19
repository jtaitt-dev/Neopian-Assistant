import assert from "node:assert/strict";
import test from "node:test";
import {
  createPurchaseFingerprint,
  isActivePurchaseLock,
  isDuplicatePurchase,
  validatePurchaseLookupRequest,
  validatePurchaseRequest,
} from "../src/shared/purchase-operations.js";

const operationId = "4b56a9ee-1432-4b39-a3fb-1df34b8a3e42";
const candidate = {
  itemName: "Healing Potion I",
  owner: "safe_owner",
  objectId: "123456",
  price: 25,
  purchaseUrl:
    "https://www.neopets.com/browseshop.phtml?owner=safe_owner&buy_obj_info_id=123456&buy_cost_neopoints=25",
};

test("SW Autobuy lookup authorization is bound to a saved watchlist item", () => {
  const settings = {
    enabled: true,
    watchlist: ["Healing Potion I"],
    requestIntervalMs: 8000,
  };
  const valid = validatePurchaseLookupRequest(
    { runId: operationId, itemName: "healing potion i" },
    settings,
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.itemName, "Healing Potion I");
  assert.equal(
    validatePurchaseLookupRequest({ runId: operationId, itemName: "Not Watched" }, settings).valid,
    false,
  );
  assert.equal(
    validatePurchaseLookupRequest({ runId: "invalid", itemName: "Healing Potion I" }, settings)
      .valid,
    false,
  );
});

test("purchase validation enforces item integrity and the configured maximum price", () => {
  assert.equal(
    validatePurchaseRequest({ operationId, candidate }, { maximumPrice: 25 }).valid,
    true,
  );
  const overLimit = validatePurchaseRequest({ operationId, candidate }, { maximumPrice: 24 });
  assert.equal(overLimit.valid, false);
  assert.match(overLimit.error, /limit/i);
  assert.equal(
    validatePurchaseRequest(
      {
        operationId,
        candidate: { ...candidate, purchaseUrl: `${candidate.purchaseUrl}&quantity=2` },
      },
      { maximumPrice: 999 },
    ).valid,
    false,
  );
});

test("purchase fingerprints drive duplicate blocking without storing listing identity", async () => {
  const fingerprint = await createPurchaseFingerprint(candidate);
  assert.equal(fingerprint, await createPurchaseFingerprint(candidate));
  assert.notEqual(
    fingerprint,
    await createPurchaseFingerprint({
      ...candidate,
      price: 26,
      purchaseUrl: candidate.purchaseUrl.replace("buy_cost_neopoints=25", "buy_cost_neopoints=26"),
    }),
  );
  const now = 2_000_000_000_000;
  assert.equal(
    isDuplicatePurchase(
      [{ fingerprint, status: "verified", timestamp: now - 1000 }],
      fingerprint,
      now,
    ),
    true,
  );
  assert.equal(
    isDuplicatePurchase(
      [{ fingerprint, status: "failed", timestamp: now - 1000 }],
      fingerprint,
      now,
    ),
    false,
  );
  assert.equal(
    isDuplicatePurchase(
      [{ fingerprint, status: "pending_verification", timestamp: now - 1000 }],
      fingerprint,
      now,
    ),
    true,
  );
  assert.equal(
    isDuplicatePurchase(
      [{ fingerprint, status: "uncertain", timestamp: now - 86_400_001 }],
      fingerprint,
      now,
    ),
    false,
  );
});

test("purchase locks reject overlap only during their TTL", () => {
  assert.equal(isActivePurchaseLock({ operationId, expiresAt: 2000 }, 1000), true);
  assert.equal(isActivePurchaseLock({ operationId, expiresAt: 1000 }, 1000), false);
  assert.equal(isActivePurchaseLock({ operationId: "bad", expiresAt: 2000 }, 1000), false);
});
