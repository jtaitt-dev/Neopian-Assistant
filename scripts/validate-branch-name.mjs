import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const BRANCH_PREFIXES = Object.freeze([
  "feature",
  "fix",
  "hotfix",
  "refactor",
  "docs",
  "test",
  "chore",
]);

const MAX_BRANCH_LENGTH = 80;
const BRANCH_PATTERN = new RegExp(`^(?:${BRANCH_PREFIXES.join("|")})/[a-z0-9]+(?:-[a-z0-9]+)*$`);

export function validateBranchName(branchName) {
  if (typeof branchName !== "string" || branchName.length === 0) {
    return { valid: false, message: "A branch name is required." };
  }

  if (branchName.length > MAX_BRANCH_LENGTH) {
    return {
      valid: false,
      message: `Branch names must be ${MAX_BRANCH_LENGTH} characters or fewer.`,
    };
  }

  if (!BRANCH_PATTERN.test(branchName)) {
    return {
      valid: false,
      message:
        "Use an approved prefix followed by a lowercase kebab-case description, such as feature/add-shop-filter.",
    };
  }

  return { valid: true, message: `Branch name is valid: ${branchName}` };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = validateBranchName(process.argv[2]);
  const output = result.valid ? process.stdout : process.stderr;
  output.write(`${result.message}\n`);
  if (!result.valid) process.exitCode = 1;
}
