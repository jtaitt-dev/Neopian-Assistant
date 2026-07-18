import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyMutationFailure,
  createPlanFingerprint,
  createShopUpdatePayload,
  createWizardPayload,
  isActiveOperationLock,
  validateLookupRequest,
  validatePricingPlan,
} from "../src/shared/pricing-operations.js";

const row = {
  id: "123",
  name: "Test Item",
  objectIdField: "obj_id_1",
  priceField: "cost_1",
  currentPrice: 1000,
  proposedPrice: 999,
  include: true,
};

test("lookup messages accept bounded items and reject injected identifiers", () => {
  assert.equal(
    validateLookupRequest({ runId: "run", item: { id: "123", name: "Test" } }).valid,
    true,
  );
  assert.equal(
    validateLookupRequest({ runId: "run", item: { id: "123&x=1", name: "Test" } }).valid,
    false,
  );
});

test("pricing plans reject duplicates and per-run limit violations", () => {
  const valid = validatePricingPlan(
    { accountContext: "Example_User", rows: [row] },
    { maxItems: 1 },
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.selectedCount, 1);
  assert.equal(
    validatePricingPlan(
      { accountContext: "Example_User", rows: [row, { ...row }] },
      { maxItems: 2 },
    ).valid,
    false,
  );
  assert.equal(
    validatePricingPlan(
      { accountContext: "Example_User", rows: [{ ...row, proposedPrice: 0 }] },
      { maxItems: 1 },
    ).valid,
    false,
  );
  assert.equal(
    validatePricingPlan(
      {
        accountContext: "Example_User",
        rows: [row, { ...row, id: "456", objectIdField: "obj_id_2", priceField: "cost_2" }],
      },
      { maxItems: 1 },
    ).valid,
    false,
  );
});

test("submitted mutations become uncertain instead of ordinary failures", () => {
  assert.equal(classifyMutationFailure(false), "failed");
  assert.equal(classifyMutationFailure(true), "uncertain");
});

test("fixed endpoint payload builders encode names and preserve unselected prices", () => {
  const wizard = new URLSearchParams(createWizardPayload("Tea & Biscuits"));
  assert.equal(wizard.get("shopwizard"), "Tea & Biscuits");
  assert.equal(wizard.get("criteria"), "exact");
  const update = new URLSearchParams(
    createShopUpdatePayload([
      row,
      { ...row, id: "456", objectIdField: "obj_id_2", priceField: "cost_2", include: false },
    ]),
  );
  assert.equal(update.get("cost_1"), "999");
  assert.equal(update.get("cost_2"), "1000");
});

test("plan fingerprints are deterministic and change with any price", async () => {
  const plan = { accountContext: "Example_User", rows: [row] };
  const first = await createPlanFingerprint(plan);
  assert.equal(first, await createPlanFingerprint(plan));
  assert.notEqual(
    first,
    await createPlanFingerprint({ ...plan, rows: [{ ...row, proposedPrice: 998 }] }),
  );
});

test("operation locks expire and remain active only within their TTL", () => {
  assert.equal(isActiveOperationLock({ operationId: "op", expiresAt: 2000 }, 1000), true);
  assert.equal(isActiveOperationLock({ operationId: "op", expiresAt: 1000 }, 1000), false);
  assert.equal(isActiveOperationLock({ expiresAt: 2000 }, 1000), false);
});
