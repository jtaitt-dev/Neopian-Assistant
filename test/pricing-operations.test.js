import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyMutationFailure,
  createPlanFingerprint,
  createShopUpdatePayload,
  createTextFingerprint,
  createWizardPayload,
  createWizardRequestOptions,
  isActiveOperationLock,
  isTextFingerprint,
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
  const runId = "4b56a9ee-1432-4b39-a3fb-1df34b8a3e42";
  assert.equal(validateLookupRequest({ runId, item: { id: "123", name: "Test" } }).valid, true);
  assert.equal(
    validateLookupRequest({ runId, item: { id: "123&x=1", name: "Test" } }).valid,
    false,
  );
  assert.equal(
    validateLookupRequest({ runId: "run", item: { id: "123", name: "Test" } }).valid,
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

test("fixed endpoint payload builders encode names and omit unselected prices", () => {
  const wizard = new URLSearchParams(createWizardPayload("Tea & Biscuits"));
  assert.equal(wizard.get("shopwizard"), "Tea & Biscuits");
  assert.equal(wizard.get("criteria"), "exact");
  const update = new URLSearchParams(
    createShopUpdatePayload([
      { ...row, objectIdField: "obj_id_8", priceField: "cost_8" },
      { ...row, id: "456", objectIdField: "obj_id_2", priceField: "cost_2", include: false },
    ]),
  );
  assert.equal(update.get("lim"), "1");
  assert.equal(update.get("obj_id_1"), row.id);
  assert.equal(update.get("oldcost_1"), String(row.currentPrice));
  assert.equal(update.get("cost_1"), "999");
  assert.equal(update.get("obj_id_8"), null);
  assert.equal(update.get("oldcost_8"), null);
  assert.equal(update.get("cost_8"), null);
  assert.equal(update.get("obj_id_2"), null);
  assert.equal(update.get("cost_2"), null);
});

test("Shop Wizard requests reproduce the authenticated HTML AJAX contract", () => {
  const request = createWizardRequestOptions("Tea & Biscuits");
  assert.equal(request.method, "POST");
  assert.deepEqual(request.headers, {
    Accept: "text/html, */*; q=0.01",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
  });
  assert.equal(new URLSearchParams(request.body).get("shopwizard"), "Tea & Biscuits");
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

test("text fingerprints accept only canonical SHA-256 hex", async () => {
  const fingerprint = await createTextFingerprint("bounded response");
  assert.equal(isTextFingerprint(fingerprint), true);
  assert.equal(isTextFingerprint(fingerprint.toUpperCase()), false);
  assert.equal(isTextFingerprint("0".repeat(63)), false);
  assert.equal(isTextFingerprint(null), false);
});

test("operation locks expire and remain active only within their TTL", () => {
  assert.equal(isActiveOperationLock({ operationId: "op", expiresAt: 2000 }, 1000), true);
  assert.equal(isActiveOperationLock({ operationId: "op", expiresAt: 1000 }, 1000), false);
  assert.equal(isActiveOperationLock({ expiresAt: 2000 }, 1000), false);
});
