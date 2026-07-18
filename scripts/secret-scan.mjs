import { readFile, readdir } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([
  ".git",
  ".playwright",
  ".playwright-cli",
  "coverage",
  "dist",
  "node_modules",
  "output",
  "playwright-report",
  "release",
  "test-results",
  "tmp",
]);
const ignoredBinaryExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".zip"]);
const secretPatterns = [
  /(?:api|access|auth|session|client)[_-]?(?:key|token|secret)\s*[:=]\s*["'][^"']{8,}["']/gi,
  /(?:password|passwd)\s*[:=]\s*["'][^"']+["']/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
];
const privatePatterns = [/[A-Z]:\\Users\\[^\\\s]+/gi, /\/Users\/[^/\s]+/g, /\/home\/[^/\s]+/g];
const sensitiveNamePattern =
  /(?:^|[._-])(?:cookie|session|credential|token|secret|password|profile|user.?data)(?:[._-]|$)/i;

async function listFiles(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) await listFiles(absolute, files);
    else files.push(absolute);
  }
  return files;
}

const findings = [];
for (const file of await listFiles(root)) {
  const projectPath = relative(root, file).replaceAll("\\", "/");
  if (
    projectPath.startsWith("docs/design/") ||
    ignoredBinaryExtensions.has(extname(file).toLowerCase())
  )
    continue;
  if (sensitiveNamePattern.test(projectPath) && !projectPath.endsWith("secret-scan.mjs")) {
    findings.push(`${projectPath}: sensitive filename`);
  }
  const content = await readFile(file, "utf8");
  if (
    secretPatterns.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(content);
    })
  ) {
    findings.push(`${projectPath}: credential-shaped content`);
  }
  if (
    privatePatterns.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(content);
    })
  ) {
    findings.push(`${projectPath}: private local path`);
  }
}

if (findings.length > 0) {
  process.stderr.write(`Secret scan found ${findings.length} issue(s):\n${findings.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    "Secret scan passed: no credential-shaped values, sensitive filenames, or private local paths found.\n",
  );
}
