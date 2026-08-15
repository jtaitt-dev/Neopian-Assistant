import assert from "node:assert/strict";
import test from "node:test";

import { BRANCH_PREFIXES, validateBranchName } from "../scripts/validate-branch-name.mjs";

test("branch validation accepts every approved prefix", () => {
  for (const prefix of BRANCH_PREFIXES) {
    assert.equal(validateBranchName(`${prefix}/clear-description`).valid, true);
  }
});

test("branch validation requires lowercase kebab-case descriptions", () => {
  const invalidNames = [
    "codex/legacy-prefix",
    "feature/Uppercase",
    "fix/uses_underscores",
    "docs/nested/description",
    "test/",
    "main",
    " feature/leading-space",
  ];

  for (const branchName of invalidNames) {
    assert.equal(validateBranchName(branchName).valid, false, branchName);
  }
});

test("branch validation rejects missing and excessive names", () => {
  assert.equal(validateBranchName().valid, false);
  assert.equal(validateBranchName(`feature/${"a".repeat(73)}`).valid, false);
});
