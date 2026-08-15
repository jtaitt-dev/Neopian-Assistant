import assert from "node:assert/strict";
import test from "node:test";
import { claimInitialization, releaseInitialization } from "../src/content/lifecycle.js";

test("content initialization is idempotent and can be released on page teardown", () => {
  const target = {};
  assert.equal(claimInitialization(target), true);
  assert.equal(claimInitialization(target), false);
  releaseInitialization(target);
  assert.equal(claimInitialization(target), true);
});
