import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distribution = resolve(root, "dist");
const manifest = JSON.parse(await readFile(resolve(distribution, "manifest.json"), "utf8"));
const packageMetadata = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

async function fileExists(relativePath) {
  try {
    await readFile(resolve(distribution, relativePath));
    return true;
  } catch {
    return false;
  }
}

check(manifest.manifest_version === 3, "Manifest must use version 3.");
check(manifest.name === "Neopian Assistant", "Manifest product name is inconsistent.");
check(manifest.short_name === "Neopian Assistant", "Manifest short name is inconsistent.");
check(manifest.version === packageMetadata.version, "Manifest and package versions differ.");
check(
  JSON.stringify(manifest.permissions) === JSON.stringify(["storage"]),
  "Required permissions are not minimal.",
);
check(
  JSON.stringify(manifest.host_permissions) === JSON.stringify(["https://www.neopets.com/*"]),
  "Host permissions are broader than the audited Neopets origin.",
);
check(
  manifest.web_accessible_resources === undefined,
  "No web-accessible resources should be exposed.",
);
check(
  manifest.externally_connectable === undefined,
  "External extension messages must not be enabled.",
);

const referencedFiles = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_ui.page,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
  ...manifest.content_scripts.flatMap((entry) => [...entry.js, ...entry.css]),
];
for (const path of referencedFiles)
  check(await fileExists(path), `Manifest file is missing: ${path}`);

for (const [size, path] of Object.entries(manifest.icons)) {
  const metadata = await sharp(resolve(distribution, path)).metadata();
  check(
    metadata.width === Number(size) && metadata.height === Number(size),
    `${path} has incorrect dimensions.`,
  );
  check(metadata.channels === 4, `${path} must include an alpha channel.`);
}

const textFiles = [];
async function collectText(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) await collectText(absolute);
    else if (/\.(?:js|css|html|json|svg)$/.test(entry.name)) textFiles.push(absolute);
  }
}
await collectText(distribution);
for (const file of textFiles) {
  const content = await readFile(file, "utf8");
  check(!/\b(?:eval|Function)\s*\(/.test(content), `${file} contains dynamic code execution.`);
  check(
    !/(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/.test(content),
    `${file} contains an unsafe HTML API.`,
  );
  check(!/\b(?:TODO|FIXME|HACK)\b/.test(content), `${file} contains an unresolved marker.`);
  check(
    !/(?:Dailies OS|DailiesOS|Neopets-Dailies-OS|JT\$)/i.test(content),
    `${file} contains stale display branding.`,
  );
  if (file.endsWith(".html")) {
    check(!/<script(?![^>]*\bsrc=)/i.test(content), `${file} contains inline JavaScript.`);
    check(!/\son[a-z]+\s*=/i.test(content), `${file} contains an inline event handler.`);
  }
}

if (errors.length > 0) {
  process.stderr.write(`Validation failed with ${errors.length} issue(s):\n${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Validated Manifest V3, ${referencedFiles.length} file references, icons, CSP-safe HTML, branding, and production APIs.\n`,
  );
}
