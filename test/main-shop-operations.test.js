import assert from "node:assert/strict";
import test from "node:test";
import {
  createMainShopFingerprint,
  isActiveMainShopLock,
  isDuplicateMainShopHandoff,
  validateMainShopHandoffRequest,
  validateMainShopLookupRequest,
} from "../src/shared/main-shop-operations.js";

const operationId = "4b56a9ee-1432-4b39-a3fb-1df34b8a3e42";
const candidate = {
  itemName: "Test Healing Potion",
  objectId: "12345",
  stockId: "987654321",
  price: 1922,
  stock: 11,
  haggleUrl: "https://www.neopets.com/haggle.phtml?obj_info_id=12345&stock_id=987654321&g=1",
};
const settings = {
  enabled: true,
  dryRun: false,
  maximumPrice: 2000,
  watchlist: [candidate.itemName],
  requestIntervalMs: 10000,
};

test("MS Autobuy lookup authorization binds the exact saved watchlist", () => {
  assert.equal(
    validateMainShopLookupRequest({ runId: operationId, watchlist: [candidate.itemName] }, settings)
      .valid,
    true,
  );
  assert.equal(
    validateMainShopLookupRequest(
      { runId: operationId, watchlist: [candidate.itemName, "Injected"] },
      settings,
    ).valid,
    false,
  );
  assert.equal(
    validateMainShopLookupRequest({ runId: "invalid", watchlist: [candidate.itemName] }, settings)
      .valid,
    false,
  );
});

test("MS Autobuy handoffs require a watched exact item below the hard ceiling", () => {
  assert.equal(validateMainShopHandoffRequest({ operationId, candidate }, settings).valid, true);
  assert.equal(
    validateMainShopHandoffRequest(
      { operationId, candidate: { ...candidate, price: 2001 } },
      settings,
    ).valid,
    false,
  );
  assert.equal(
    validateMainShopHandoffRequest(
      {
        operationId,
        candidate: { ...candidate, haggleUrl: `${candidate.haggleUrl}&quantity=2` },
      },
      settings,
    ).valid,
    false,
  );
  assert.equal(
    validateMainShopHandoffRequest(
      { operationId, candidate: { ...candidate, itemName: "Not Watched" } },
      settings,
    ).valid,
    false,
  );
});

test("MS Autobuy fingerprints, duplicate windows, and locks are bounded", async () => {
  const fingerprint = await createMainShopFingerprint(candidate);
  assert.equal(fingerprint, await createMainShopFingerprint(candidate));
  assert.notEqual(
    fingerprint,
    await createMainShopFingerprint({
      ...candidate,
      stockId: "987654322",
      haggleUrl: candidate.haggleUrl.replace("stock_id=987654321", "stock_id=987654322"),
    }),
  );
  const now = 2_000_000_000_000;
  assert.equal(
    isDuplicateMainShopHandoff(
      [{ fingerprint, status: "opened", timestamp: now - 1000 }],
      fingerprint,
      now,
    ),
    true,
  );
  assert.equal(
    isDuplicateMainShopHandoff(
      [{ fingerprint, status: "failed", timestamp: now - 1000 }],
      fingerprint,
      now,
    ),
    false,
  );
  assert.equal(isActiveMainShopLock({ operationId, expiresAt: now + 1000 }, now), true);
  assert.equal(isActiveMainShopLock({ operationId, expiresAt: now }, now), false);
});
