import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(
  await readFile(new URL("../src/manifest.json", import.meta.url), "utf8"),
);
const packageMetadata = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const ciWorkflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const releaseWorkflow = await readFile(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);
const appSource = await readFile(new URL("../src/content/app.js", import.meta.url), "utf8");

test("manifest branding, version, and permission scope stay synchronized", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Neopian Assistant");
  assert.equal(manifest.short_name, "Neopian Assistant");
  assert.equal(manifest.version, packageMetadata.version);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://www.neopets.com/*"]);
  assert.equal(manifest.web_accessible_resources, undefined);
  assert.equal(manifest.externally_connectable, undefined);
});

test("manifest loads the intended isolated-world entry points only", () => {
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.content_scripts.length, 1);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://www.neopets.com/*"]);
  assert.equal(manifest.content_scripts[0].all_frames, false);
  assert.equal(manifest.action.default_popup, "popup/index.html");
  assert.equal(manifest.options_ui.page, "options/index.html");
});

test("CI uploads the synchronized production build and versioned release archive", () => {
  const releaseName = `neopian-assistant-${manifest.version}`;
  assert.match(ciWorkflow, new RegExp(`name: ${releaseName.replaceAll(".", "\\.")}`));
  assert.match(ciWorkflow, new RegExp(`release/${releaseName.replaceAll(".", "\\.")}\\.zip`));
  assert.match(ciWorkflow, /(?:^|\n)\s+dist\/\s*(?:\n|$)/);
});

test("tagged releases verify, package, and publish the synchronized archive", () => {
  assert.match(releaseWorkflow, /tags:\s*\n\s+- "v\*"/);
  assert.match(releaseWorkflow, /npm run verify && npm run package/);
  assert.match(releaseWorkflow, /gh release create/);
  assert.match(releaseWorkflow, /release\/neopian-assistant-\$\{version\}\.zip/);
  assert.match(releaseWorkflow, /test "v\$\{version\}" = "\$\{GITHUB_REF_NAME\}"/);
});

test("dashboard replaces the standalone Progress tab with MS Autobuy", () => {
  assert.match(appSource, /\["mainShop", "MS Autobuy"\]/);
  assert.doesNotMatch(appSource, /\["progress", "Progress"\]/);
});
