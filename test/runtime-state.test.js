import assert from "node:assert/strict";
import test from "node:test";
import { collectExpiredRuntimeKeys } from "../src/shared/runtime-state.js";

test("expired runtime reviews are pruned without touching active or unrelated state", () => {
  const now = 10_000;
  assert.deepEqual(
    collectExpiredRuntimeKeys(
      {
        "runtime.review.expired": { expiresAt: now },
        "runtime.review.active": { expiresAt: now + 1 },
        "runtime.confirmation.malformed": { expiresAt: "later" },
        "runtime.confirmation.invalid": null,
        "unrelated.expired": { expiresAt: 0 },
      },
      ["runtime.review.", "runtime.confirmation."],
      now,
    ).sort(),
    ["runtime.confirmation.invalid", "runtime.confirmation.malformed", "runtime.review.expired"],
  );
});
