import assert from "node:assert/strict";
import test from "node:test";
import {
  areAppDataEquivalent,
  createDefaultData,
  migrateLegacyData,
  migrateStorageRecord,
  sanitizeAppData,
  storageRecordNeedsWrite,
} from "../src/shared/storage.js";
import { LEGACY_STORAGE_KEYS, SCHEMA_VERSION, STORAGE_KEYS } from "../src/shared/constants.js";

const legacy = {
  theme: { mode: "dark" },
  position: { top: "30px", right: "40px", width: "420px" },
  settings: { gridColumns: 4, pricer: { rule: "match", amount: 5, floor: 100 } },
  groups: [
    {
      name: "Custom",
      collapsed: false,
      items: [
        {
          name: "Test Daily",
          url: "https://www.neopets.com/test.phtml",
          iconUrl: "https://images.neopets.com/items/test.gif",
          cooldown: "daily",
          notes: "Test",
          category: "Custom",
        },
      ],
    },
  ],
  state: { "Test Daily": { completed: 1, lastCompleted: 1_700_000_000_000 } },
  history: [{ name: "Test Daily", time: 1_700_000_000_000 }],
};

test("legacy storage migrates once without enabling real auto pricing", () => {
  const migrated = migrateLegacyData(JSON.stringify(legacy));
  const item = migrated.groups[0].items[0];
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.settings.theme, "dark");
  assert.equal(migrated.settings.panel.width, 420);
  assert.equal(migrated.settings.autoPricing.rule, "match");
  assert.equal(migrated.settings.autoPricing.enabled, false);
  assert.equal(migrated.settings.autoPricing.dryRun, true);
  assert.equal(migrated.settings.autoBuy.enabled, false);
  assert.equal(migrated.settings.autoBuy.dryRun, true);
  assert.deepEqual(migrated.settings.autoBuy.watchlist, []);
  assert.equal(migrated.settings.autoBuy.requestIntervalMs, 8000);
  assert.equal(migrated.settings.mainShopBuy.enabled, false);
  assert.equal(migrated.settings.mainShopBuy.dryRun, true);
  assert.deepEqual(migrated.settings.mainShopBuy.watchlist, []);
  assert.equal(migrated.settings.mainShopBuy.requestIntervalMs, 10000);
  assert.equal(migrated.state[item.id].completed, 1);
  assert.equal(migrated.history[0].itemId, item.id);
  assert.deepEqual(sanitizeAppData(migrated), migrated);
});

test("new storage takes precedence over legacy data", () => {
  const current = createDefaultData();
  current.settings.theme = "light";
  const result = migrateStorageRecord({
    [STORAGE_KEYS.data]: current,
    [LEGACY_STORAGE_KEYS.data]: JSON.stringify(legacy),
  });
  assert.equal(result.migrated, false);
  assert.equal(result.data.settings.theme, "light");
});

test("schema upgrades and sanitized repairs are persisted idempotently", () => {
  const current = createDefaultData();
  assert.equal(storageRecordNeedsWrite({ [STORAGE_KEYS.data]: current }, current, false), false);
  assert.equal(
    storageRecordNeedsWrite(
      { [STORAGE_KEYS.data]: { ...current, schemaVersion: SCHEMA_VERSION - 1 } },
      current,
      false,
    ),
    true,
  );
  assert.equal(
    storageRecordNeedsWrite(
      { [STORAGE_KEYS.data]: { ...current, transientUiValue: "remove" } },
      current,
      false,
    ),
    true,
  );
  assert.equal(storageRecordNeedsWrite({}, current, false), true);
});

test("storage equivalence ignores key order and unknown transient properties", () => {
  const current = createDefaultData();
  const reordered = {
    history: current.history,
    state: current.state,
    groups: current.groups,
    settings: {
      theme: current.settings.theme,
      autoPricing: current.settings.autoPricing,
      autoBuy: current.settings.autoBuy,
      mainShopBuy: current.settings.mainShopBuy,
      dailiesEnabled: current.settings.dailiesEnabled,
      density: current.settings.density,
      enabled: current.settings.enabled,
      panel: current.settings.panel,
      privacyAcknowledged: current.settings.privacyAcknowledged,
      transientUiValue: "not persisted",
    },
    schemaVersion: current.schemaVersion,
  };

  assert.equal(areAppDataEquivalent(current, reordered), true);
  reordered.settings.autoPricing = { ...reordered.settings.autoPricing, enabled: true };
  assert.equal(areAppDataEquivalent(current, reordered), false);
});

test("corrupt storage recovers to complete defaults", () => {
  const result = migrateStorageRecord({ [LEGACY_STORAGE_KEYS.data]: "not-json" });
  assert.equal(result.data.schemaVersion, SCHEMA_VERSION);
  assert.ok(result.data.groups.length > 0);
  assert.equal(result.data.settings.autoPricing.enabled, false);
  assert.equal(result.data.settings.autoPricing.dryRun, true);
  assert.equal(result.data.settings.autoBuy.enabled, false);
  assert.equal(result.data.settings.autoBuy.dryRun, true);
  assert.deepEqual(result.data.settings.autoBuy.watchlist, []);
  assert.equal(result.data.settings.mainShopBuy.enabled, false);
  assert.equal(result.data.settings.mainShopBuy.dryRun, true);
  assert.deepEqual(result.data.settings.mainShopBuy.watchlist, []);
});

test("sanitization removes invalid groups, duplicate IDs, and unknown state", () => {
  const data = sanitizeAppData({
    settings: {},
    groups: [
      {
        name: "Valid",
        items: [
          { id: "daily-same", name: "One", url: "https://www.neopets.com/one", group: "Valid" },
          { id: "daily-same", name: "Two", url: "https://www.neopets.com/two", group: "Valid" },
          { name: "Bad", url: "https://example.com", group: "Valid" },
        ],
      },
    ],
    state: { unknown: { completed: 99 } },
    history: [{ itemId: "unknown", timestamp: Date.now() }],
  });
  assert.equal(data.groups[0].items.length, 2);
  assert.notEqual(data.groups[0].items[0].id, data.groups[0].items[1].id);
  assert.deepEqual(data.state, {});
  assert.deepEqual(data.history, []);
});
