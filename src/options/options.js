import { APP_VERSION, STORAGE_KEYS } from "../shared/constants.js";
import { setStatus } from "../shared/dom.js";
import {
  clearAllData,
  loadAppData,
  migrateLegacyData,
  sanitizeAppData,
  saveAppData,
} from "../shared/storage.js";
import { isPlainObject } from "../shared/validation.js";

const MAX_IMPORT_BYTES = 1_000_000;
let data = null;

const controls = {
  enabled: document.getElementById("enabled"),
  theme: document.getElementById("theme"),
  density: document.getElementById("density"),
  dailiesEnabled: document.getElementById("dailies-enabled"),
  pricingEnabled: document.getElementById("pricing-enabled"),
  dryRun: document.getElementById("dry-run"),
  pricingRule: document.getElementById("pricing-rule"),
  pricingAmount: document.getElementById("pricing-amount"),
  pricingFloor: document.getElementById("pricing-floor"),
  pricingMaxItems: document.getElementById("pricing-max-items"),
  pricingInterval: document.getElementById("pricing-interval"),
  buyingEnabled: document.getElementById("buying-enabled"),
  buyingDryRun: document.getElementById("buying-dry-run"),
  buyingMaximumPrice: document.getElementById("buying-maximum-price"),
  buyingWatchlist: document.getElementById("buying-watchlist"),
  buyingInterval: document.getElementById("buying-interval"),
};

const status = document.getElementById("status");
const settingsRoot = document.getElementById("settings");

function populateControls() {
  controls.enabled.checked = data.settings.enabled;
  controls.theme.value = data.settings.theme;
  controls.density.value = data.settings.density;
  controls.dailiesEnabled.checked = data.settings.dailiesEnabled;
  controls.pricingEnabled.checked = data.settings.autoPricing.enabled;
  controls.dryRun.checked = data.settings.autoPricing.dryRun;
  controls.pricingRule.value = data.settings.autoPricing.rule;
  controls.pricingAmount.value = data.settings.autoPricing.amount;
  controls.pricingFloor.value = data.settings.autoPricing.floor;
  controls.pricingMaxItems.value = data.settings.autoPricing.maxItems;
  controls.pricingInterval.value = Math.round(data.settings.autoPricing.requestIntervalMs / 1000);
  controls.buyingEnabled.checked = data.settings.autoBuy.enabled;
  controls.buyingDryRun.checked = data.settings.autoBuy.dryRun;
  controls.buyingMaximumPrice.value = data.settings.autoBuy.maximumPrice;
  controls.buyingWatchlist.value = data.settings.autoBuy.watchlist.join("\n");
  controls.buyingInterval.value = Math.round(data.settings.autoBuy.requestIntervalMs / 1000);
}

function collectControls() {
  data.settings.enabled = controls.enabled.checked;
  data.settings.theme = controls.theme.value;
  data.settings.density = controls.density.value;
  data.settings.dailiesEnabled = controls.dailiesEnabled.checked;
  data.settings.autoPricing.enabled = controls.pricingEnabled.checked;
  data.settings.autoPricing.dryRun = controls.dryRun.checked;
  data.settings.autoPricing.rule = controls.pricingRule.value;
  data.settings.autoPricing.amount = Number.parseInt(controls.pricingAmount.value, 10);
  data.settings.autoPricing.floor = Number.parseInt(controls.pricingFloor.value, 10);
  data.settings.autoPricing.maxItems = Number.parseInt(controls.pricingMaxItems.value, 10);
  data.settings.autoPricing.requestIntervalMs =
    Number.parseInt(controls.pricingInterval.value, 10) * 1000;
  data.settings.autoBuy.enabled = controls.buyingEnabled.checked;
  data.settings.autoBuy.dryRun = controls.buyingDryRun.checked;
  data.settings.autoBuy.maximumPrice = Number.parseInt(controls.buyingMaximumPrice.value, 10);
  data.settings.autoBuy.watchlist = controls.buyingWatchlist.value.split(/\r?\n/);
  data.settings.autoBuy.requestIntervalMs =
    Number.parseInt(controls.buyingInterval.value, 10) * 1000;
}

async function save() {
  const saveButton = document.getElementById("save");
  saveButton.disabled = true;
  setStatus(status, "Saving changes…", "neutral");
  try {
    collectControls();
    data = await saveAppData(data);
    populateControls();
    setStatus(status, "All changes saved.", "success");
  } catch {
    setStatus(status, "Settings could not be saved. No confirmation was recorded.", "error");
  } finally {
    saveButton.disabled = false;
  }
}

function downloadExport() {
  const payload = JSON.stringify(
    {
      product: "Neopian Assistant",
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      data,
    },
    null,
    2,
  );
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `neopian-assistant-backup-v${APP_VERSION}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  setStatus(status, "A local data export was created.", "success");
}

function confirmAction(title, message, confirmLabel) {
  const dialog = document.getElementById("confirm-dialog");
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-message").textContent = message;
  document.getElementById("confirm-action").textContent = confirmLabel;
  dialog.returnValue = "cancel";
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), {
      once: true,
    });
  });
}

async function importData(file) {
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) {
    setStatus(status, "The import file exceeds the 1 MB safety limit.", "error");
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    setStatus(status, "The selected file is not valid JSON.", "error");
    return;
  }
  const candidate = isPlainObject(parsed?.data) ? parsed.data : parsed;
  if (!isPlainObject(candidate) || !Array.isArray(candidate.groups)) {
    setStatus(
      status,
      "The selected file does not contain Neopian Assistant routine data.",
      "error",
    );
    return;
  }
  const imported = candidate.schemaVersion
    ? sanitizeAppData(candidate)
    : migrateLegacyData(candidate);
  const itemCount = imported.groups.reduce((total, group) => total + group.items.length, 0);
  const confirmed = await confirmAction(
    "Replace local extension data?",
    `This validated import contains ${imported.groups.length} groups and ${itemCount} routines. It will replace the current local settings and tracking history.`,
    "Replace data",
  );
  if (!confirmed) {
    setStatus(status, "Import cancelled. Existing data was not changed.", "neutral");
    return;
  }
  try {
    data = await saveAppData(imported);
    populateControls();
    await renderOperationHistory();
    await renderPurchaseHistory();
    setStatus(status, "Validated extension data imported successfully.", "success");
  } catch {
    setStatus(status, "The validated import could not be saved.", "error");
  }
}

async function clearData() {
  const confirmed = await confirmAction(
    "Clear all Neopian Assistant data?",
    "This removes settings, routines, completion history, legacy data, and redacted operation history from this browser. The default data will be recreated.",
    "Clear all data",
  );
  if (!confirmed) {
    setStatus(status, "Data clearing cancelled.", "neutral");
    return;
  }
  try {
    data = await clearAllData();
    data = await saveAppData(data);
    populateControls();
    await renderOperationHistory();
    await renderPurchaseHistory();
    setStatus(status, "Local extension data was cleared and defaults were restored.", "success");
  } catch {
    setStatus(status, "Extension data could not be cleared.", "error");
  }
}

async function renderOperationHistory() {
  const container = document.getElementById("operation-history");
  const stored = await chrome.storage.local.get(STORAGE_KEYS.operationHistory);
  const history = Array.isArray(stored[STORAGE_KEYS.operationHistory])
    ? stored[STORAGE_KEYS.operationHistory]
    : [];
  container.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = "Recent price-operation status";
  container.append(heading);
  if (history.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No price operations are recorded on this device.";
    container.append(empty);
    return;
  }
  const list = document.createElement("ol");
  for (const record of history.slice(0, 10)) {
    const item = document.createElement("li");
    const summary = document.createElement("span");
    summary.textContent = `${record.itemCount} item${record.itemCount === 1 ? "" : "s"} — ${record.status}`;
    const time = document.createElement("time");
    time.dateTime = new Date(record.timestamp).toISOString();
    time.textContent = new Date(record.timestamp).toLocaleString();
    item.append(summary, time);
    list.append(item);
  }
  container.append(list);
}

async function renderPurchaseHistory() {
  const container = document.getElementById("purchase-history");
  const stored = await chrome.storage.local.get(STORAGE_KEYS.purchaseHistory);
  const history = Array.isArray(stored[STORAGE_KEYS.purchaseHistory])
    ? stored[STORAGE_KEYS.purchaseHistory]
    : [];
  container.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = "Recent one-item purchase status";
  container.append(heading);
  if (history.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No SW Autobuy operations are recorded on this device.";
    container.append(empty);
    return;
  }
  const list = document.createElement("ol");
  for (const record of history.slice(0, 10)) {
    const item = document.createElement("li");
    const summary = document.createElement("span");
    summary.textContent = `1 item — ${record.status}`;
    const time = document.createElement("time");
    time.dateTime = new Date(record.timestamp).toISOString();
    time.textContent = new Date(record.timestamp).toLocaleString();
    item.append(summary, time);
    list.append(item);
  }
  container.append(list);
}

async function initialize() {
  try {
    data = await loadAppData();
    populateControls();
    await renderOperationHistory();
    await renderPurchaseHistory();
    settingsRoot.setAttribute("aria-busy", "false");
    setStatus(status, "Settings loaded.", "success");
  } catch {
    settingsRoot.setAttribute("aria-busy", "false");
    settingsRoot.setAttribute("aria-disabled", "true");
    setStatus(
      status,
      "Settings could not be loaded. Reload the extension before making changes.",
      "error",
    );
  }
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("export").addEventListener("click", downloadExport);
document.getElementById("import").addEventListener("change", (event) => {
  void importData(event.target.files?.[0]);
  event.target.value = "";
});
document.getElementById("clear").addEventListener("click", clearData);

for (const control of Object.values(controls)) {
  control.addEventListener("change", () => setStatus(status, "Unsaved changes.", "warning"));
}

void initialize();
