import {
  DEFAULT_DAILIES,
  DEFAULT_SETTINGS,
  LEGACY_STORAGE_KEYS,
  SCHEMA_VERSION,
  STORAGE_KEYS,
} from "./constants.js";
import {
  cloneValue,
  getNeopianDateKey,
  isPlainObject,
  makeStableItemId,
  sanitizeCompletionState,
  sanitizeDaily,
  sanitizeSettings,
} from "./validation.js";

const MAX_GROUPS = 50;
const MAX_ITEMS = 500;
const MAX_HISTORY = 100;

export function createDefaultData() {
  const groups = [];
  const groupMap = new Map();
  for (const item of DEFAULT_DAILIES) {
    if (!groupMap.has(item.group)) {
      const group = { name: item.group, collapsed: false, items: [] };
      groupMap.set(item.group, group);
      groups.push(group);
    }
    groupMap.get(item.group).items.push(cloneValue(item));
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: cloneValue(DEFAULT_SETTINGS),
    groups,
    state: {},
    history: [],
  };
}

function sanitizeGroup(raw, seenIds, itemBudget) {
  if (!isPlainObject(raw) || itemBudget.remaining <= 0) return null;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 60) : "";
  if (!name) return null;
  const items = [];
  if (Array.isArray(raw.items)) {
    for (const candidate of raw.items) {
      if (itemBudget.remaining <= 0) break;
      const item = sanitizeDaily(candidate, name);
      if (!item) continue;
      let id = item.id;
      if (seenIds.has(id)) id = makeStableItemId(`${item.name}-${items.length}`, item.url);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      items.push({ ...item, id, group: name });
      itemBudget.remaining -= 1;
    }
  }
  return { name, collapsed: raw.collapsed === true, items };
}

export function sanitizeAppData(raw) {
  if (!isPlainObject(raw)) return createDefaultData();
  const groups = [];
  const seenIds = new Set();
  const itemBudget = { remaining: MAX_ITEMS };
  if (Array.isArray(raw.groups)) {
    for (const candidate of raw.groups.slice(0, MAX_GROUPS)) {
      const group = sanitizeGroup(candidate, seenIds, itemBudget);
      if (group) groups.push(group);
    }
  }
  if (groups.length === 0) return createDefaultData();

  const state = {};
  if (isPlainObject(raw.state)) {
    for (const id of seenIds) {
      if (raw.state[id] !== undefined) state[id] = sanitizeCompletionState(raw.state[id]);
    }
  }

  const history = [];
  if (Array.isArray(raw.history)) {
    for (const entry of raw.history.slice(0, MAX_HISTORY)) {
      if (!isPlainObject(entry) || !seenIds.has(entry.itemId)) continue;
      const timestamp = Number.isSafeInteger(entry.timestamp ?? entry.time)
        ? (entry.timestamp ?? entry.time)
        : null;
      if (!timestamp || timestamp <= 0) continue;
      history.push({ itemId: entry.itemId, timestamp });
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    settings: sanitizeSettings(raw.settings),
    groups,
    state,
    history,
  };
}

export function areAppDataEquivalent(left, right) {
  return JSON.stringify(sanitizeAppData(left)) === JSON.stringify(sanitizeAppData(right));
}

export function migrateLegacyData(raw) {
  let legacy = raw;
  if (typeof legacy === "string") {
    try {
      legacy = JSON.parse(legacy);
    } catch {
      return createDefaultData();
    }
  }
  if (!isPlainObject(legacy) || !Array.isArray(legacy.groups)) return createDefaultData();

  const idByName = new Map();
  const migratedGroups = [];
  const seenIds = new Set();
  for (const rawGroup of legacy.groups.slice(0, MAX_GROUPS)) {
    if (!isPlainObject(rawGroup)) continue;
    const name = typeof rawGroup.name === "string" ? rawGroup.name.trim().slice(0, 60) : "";
    if (!name) continue;
    const items = [];
    for (const candidate of Array.isArray(rawGroup.items) ? rawGroup.items : []) {
      if (seenIds.size >= MAX_ITEMS) break;
      const item = sanitizeDaily(candidate, name);
      if (!item) continue;
      let id = makeStableItemId(item.name, item.url);
      if (seenIds.has(id)) id = makeStableItemId(`${item.name}-${seenIds.size}`, item.url);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      idByName.set(item.name, id);
      items.push({ ...item, id, group: name });
    }
    migratedGroups.push({ name, collapsed: rawGroup.collapsed === true, items });
  }

  if (migratedGroups.length === 0) return createDefaultData();
  const settings = sanitizeSettings({
    ...legacy.settings,
    theme: legacy.theme?.mode,
    panel: legacy.position
      ? {
          top: Number.parseInt(legacy.position.top, 10),
          right: Number.parseInt(legacy.position.right, 10),
          width: Number.parseInt(legacy.position.width, 10),
        }
      : undefined,
    autoPricing: legacy.settings?.pricer
      ? { ...legacy.settings.pricer, enabled: false, dryRun: true }
      : undefined,
  });

  const state = {};
  if (isPlainObject(legacy.state)) {
    for (const [name, value] of Object.entries(legacy.state)) {
      const id = idByName.get(name);
      if (!id) continue;
      const sanitized = sanitizeCompletionState(value);
      if (!sanitized.dateKey && sanitized.lastCompleted) {
        sanitized.dateKey = getNeopianDateKey(new Date(sanitized.lastCompleted));
      }
      state[id] = sanitized;
    }
  }

  const history = [];
  if (Array.isArray(legacy.history)) {
    for (const entry of legacy.history.slice(0, MAX_HISTORY)) {
      if (!isPlainObject(entry)) continue;
      const itemId = idByName.get(entry.name);
      if (!itemId || !Number.isSafeInteger(entry.time) || entry.time <= 0) continue;
      history.push({ itemId, timestamp: entry.time });
    }
  }

  return sanitizeAppData({
    schemaVersion: SCHEMA_VERSION,
    settings,
    groups: migratedGroups,
    state,
    history,
  });
}

export function migrateStorageRecord(record) {
  if (isPlainObject(record?.[STORAGE_KEYS.data])) {
    return { data: sanitizeAppData(record[STORAGE_KEYS.data]), migrated: false };
  }
  if (record?.[LEGACY_STORAGE_KEYS.data] !== undefined) {
    return { data: migrateLegacyData(record[LEGACY_STORAGE_KEYS.data]), migrated: true };
  }
  return { data: createDefaultData(), migrated: false };
}

export function storageRecordNeedsWrite(record, data, migrated) {
  const stored = record?.[STORAGE_KEYS.data];
  return (
    migrated === true ||
    !isPlainObject(stored) ||
    stored.schemaVersion !== SCHEMA_VERSION ||
    JSON.stringify(stored) !== JSON.stringify(data)
  );
}

export async function loadAppData() {
  const record = await chrome.storage.local.get([
    STORAGE_KEYS.data,
    STORAGE_KEYS.migrationComplete,
    LEGACY_STORAGE_KEYS.data,
  ]);
  const { data, migrated } = migrateStorageRecord(record);
  if (storageRecordNeedsWrite(record, data, migrated)) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.data]: data,
      [STORAGE_KEYS.migrationComplete]: SCHEMA_VERSION,
    });
  }
  return data;
}

export async function saveAppData(data) {
  const sanitized = sanitizeAppData(data);
  await chrome.storage.local.set({ [STORAGE_KEYS.data]: sanitized });
  return sanitized;
}

export async function updateSettings(patch) {
  const data = await loadAppData();
  data.settings = sanitizeSettings({ ...data.settings, ...patch });
  return saveAppData(data);
}

export async function clearAllData() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.data,
    STORAGE_KEYS.operationHistory,
    STORAGE_KEYS.purchaseHistory,
    STORAGE_KEYS.migrationComplete,
    LEGACY_STORAGE_KEYS.data,
    LEGACY_STORAGE_KEYS.lastResetDate,
  ]);
  await chrome.storage.session.clear();
  return createDefaultData();
}
