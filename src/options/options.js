import { APP_VERSION, STORAGE_KEYS } from "../shared/constants.js";
import { applyAppearance, showThemedDialog } from "../shared/appearance.js";
import { SettingsSaveState } from "../shared/settings-save-state.js";
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
  mainShopEnabled: document.getElementById("main-shop-enabled"),
  mainShopDryRun: document.getElementById("main-shop-dry-run"),
  mainShopInterval: document.getElementById("main-shop-interval"),
  mainShopWatchlist: document.getElementById("main-shop-watchlist"),
};

const status = document.getElementById("status");
const settingsRoot = document.getElementById("settings");

const saveButton = document.getElementById("save");
const saveStates = {
  unchanged: ["No changes", "neutral"],
  unsaved: ["Unsaved changes", "warning"],
  saving: ["Saving changes…", "neutral"],
  saved: ["Changes saved", "success"],
  failed: ["Save failed. Your edits are here; try again.", "error"],
};
const saveState = new SettingsSaveState(
  () =>
    JSON.stringify(
      Object.values(controls).map((control) =>
        control.type === "checkbox" ? control.checked : control.value,
      ),
    ),
  (state) => {
    saveButton.disabled = state === "unchanged" || state === "saving" || state === "saved";
    saveButton.textContent =
      state === "saving" ? "Saving…" : state === "failed" ? "Retry save" : "Save changes";
    status.dataset.saveState = state;
    setStatus(status, ...saveStates[state]);
  },
);

function updateAppearance() {
  applyAppearance(document.documentElement, {
    theme: controls.theme.value,
    density: controls.density.value,
  });
  for (const radio of document.querySelectorAll(".ui-segmented input")) {
    radio.checked = radio.value === controls[radio.name].value;
  }
}

function createSegments(name, choices) {
  const control = controls[name];
  control.hidden = true;
  const group = document.createElement("fieldset");
  group.className = "ui-segmented";
  const legend = document.createElement("legend");
  legend.className = "ui-visually-hidden";
  legend.textContent = name === "theme" ? "Theme" : "Panel density";
  group.append(legend);
  for (const [value, title] of choices) {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = name;
    radio.value = value;
    const text = document.createElement("span");
    text.textContent = title;
    label.append(radio, text);
    group.append(label);
    radio.addEventListener("change", () => {
      control.value = value;
      control.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  control.after(group);
}

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
  controls.mainShopEnabled.checked = data.settings.mainShopBuy.enabled;
  controls.mainShopDryRun.checked = data.settings.mainShopBuy.dryRun;
  controls.mainShopInterval.value = Math.round(data.settings.mainShopBuy.requestIntervalMs / 1000);
  controls.mainShopWatchlist.value = data.settings.mainShopBuy.watchlist.join("\n");
  updateAppearance();
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
  data.settings.mainShopBuy.enabled = controls.mainShopEnabled.checked;
  data.settings.mainShopBuy.dryRun = controls.mainShopDryRun.checked;
  data.settings.mainShopBuy.requestIntervalMs =
    Number.parseInt(controls.mainShopInterval.value, 10) * 1000;
  data.settings.mainShopBuy.watchlist = controls.mainShopWatchlist.value.split(/\r?\n/);
}

async function save() {
  if (!data) return;
  for (const control of Object.values(controls)) {
    if (!control.checkValidity()) {
      control.reportValidity();
      return;
    }
  }
  for (const [control, limit] of [
    [controls.buyingWatchlist, 10],
    [controls.mainShopWatchlist, 100],
  ]) {
    const names = control.value
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.length > limit || names.some((name) => Array.from(name).length > 100)) {
      setStatus(
        status,
        `Use up to ${limit} item names, each at most 100 characters. Your edits remain here.`,
        "error",
      );
      control.focus();
      return;
    }
  }
  await saveState.save(
    async () => {
      collectControls();
      const result = await saveAppData(data);
      data = result;
      return result;
    },
    () => populateControls(),
  );
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
  showThemedDialog(dialog, { theme: controls.theme.value, density: controls.density.value });
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
    saveState.loaded();
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
    saveState.loaded();
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
    saveState.loaded();
    await renderOperationHistory();
    await renderPurchaseHistory();
    settingsRoot.setAttribute("aria-busy", "false");
    saveState.loaded();
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
  for (const event of ["input", "change"])
    control.addEventListener(event, () => {
      if (!data) return;
      updateAppearance();
      saveState.changed();
    });
}

createSegments("theme", [
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
]);
createSegments("density", [
  ["comfortable", "Comfortable"],
  ["compact", "Compact"],
]);
const links = [...document.querySelectorAll(".options-nav a")];
const sections = [...document.querySelectorAll(".options-section")];
function updateSection() {
  const offset =
    document.querySelector(".options-header").getBoundingClientRect().height +
    (window.innerWidth <= 820
      ? document.querySelector(".options-nav").getBoundingClientRect().height
      : 0) +
    24;
  const active =
    sections.filter((section) => section.getBoundingClientRect().top <= offset).at(-1) ??
    sections[0];
  for (const link of links) {
    if (link.hash === `#${active.id}`) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
}
window.addEventListener("scroll", updateSection, { passive: true });
window.addEventListener("resize", updateSection);
const headerObserver = new ResizeObserver(() => {
  document.documentElement.style.setProperty(
    "--options-header-height",
    `${Math.ceil(document.querySelector(".options-header").getBoundingClientRect().height)}px`,
  );
});
headerObserver.observe(document.querySelector(".options-header"));
updateSection();
void initialize();
