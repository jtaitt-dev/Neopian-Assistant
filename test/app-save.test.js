import assert from "node:assert/strict";
import test from "node:test";
import {
  isExtensionContextInvalidatedError,
  NeopianAssistantApp,
  requestOptionsPage,
} from "../src/content/app.js";

test("content pages request settings through the validated background route", async () => {
  const messages = [];
  const response = await requestOptionsPage(async (message) => {
    messages.push(message);
    return { ok: true };
  });

  assert.deepEqual(messages, [{ type: "extension.openOptions" }]);
  assert.deepEqual(response, { ok: true });
});

test("content pages reject a failed settings request", async () => {
  await assert.rejects(
    requestOptionsPage(async () => ({ ok: false, error: "Settings route unavailable." })),
    /Settings route unavailable/,
  );
});

test("application saves are serialized without replacing shared controller data", async () => {
  const data = { settings: { autoPricing: { enabled: false } } };
  const persisted = [];
  let releaseFirstWrite;
  const firstWriteGate = new Promise((resolve) => {
    releaseFirstWrite = resolve;
  });
  const persistData = async (snapshot) => {
    persisted.push(snapshot);
    if (persisted.length === 1) await firstWriteGate;
    return structuredClone(snapshot);
  };
  const app = new NeopianAssistantApp(data, { persistData });
  const controllerDataReference = app.data;

  const firstSave = app.save();
  data.settings.autoPricing.enabled = true;
  const secondSave = app.save();
  releaseFirstWrite();
  await Promise.all([firstSave, secondSave]);

  assert.strictEqual(app.data, controllerDataReference);
  assert.deepEqual(
    persisted.map((snapshot) => snapshot.settings.autoPricing.enabled),
    [false, true],
  );
});

test("a failed save does not prevent the next queued save", async () => {
  const data = { settings: { autoPricing: { enabled: false } } };
  let attempt = 0;
  const persistData = async (snapshot) => {
    attempt += 1;
    if (attempt === 1) throw new Error("synthetic storage failure");
    return structuredClone(snapshot);
  };
  const app = new NeopianAssistantApp(data, { persistData });

  const failedSave = app.save();
  data.settings.autoPricing.enabled = true;
  const recoveredSave = app.save();

  await assert.rejects(failedSave, /synthetic storage failure/);
  await recoveredSave;
  assert.equal(attempt, 2);
  assert.equal(app.data.settings.autoPricing.enabled, true);
});

test("an invalidated extension context removes stale UI without an unhandled save rejection", async () => {
  let removed = false;
  let dialogClosed = false;
  const app = new NeopianAssistantApp(
    { settings: { autoPricing: { enabled: false } } },
    {
      persistData: async () => {
        throw new Error("Extension context invalidated.");
      },
    },
  );
  app.root = { remove: () => (removed = true) };
  app.dialogs.add({ open: true, close: () => (dialogClosed = true) });

  await app.save();

  assert.equal(removed, true);
  assert.equal(dialogClosed, true);
  assert.equal(app.dialogs.size, 0);
  assert.equal(app.root, null);
  assert.equal(app.closedForPage, true);
  assert.equal(
    isExtensionContextInvalidatedError(new Error("Extension context invalidated.")),
    true,
  );
  assert.equal(isExtensionContextInvalidatedError(new Error("ordinary storage failure")), false);
});

test("daily claims start cooldown tracking and cannot be double-counted while unavailable", async () => {
  const item = {
    id: "daily-test",
    name: "Test Daily",
    cooldown: "daily",
  };
  const data = {
    state: {},
    history: [],
    settings: { autoPricing: { enabled: false } },
  };
  const persisted = [];
  const announcements = [];
  const app = new NeopianAssistantApp(data, {
    persistData: async (snapshot) => {
      persisted.push(snapshot);
      return snapshot;
    },
  });
  app.announce = (message) => announcements.push(message);
  app.renderActiveTab = () => undefined;

  await app.claimDaily(item);
  await app.claimDaily(item);

  assert.equal(data.state[item.id].completed, 1);
  assert.equal(data.history.length, 1);
  assert.equal(persisted.length, 1);
  assert.match(announcements[0], /claim tracked/i);
  assert.match(announcements[1], /already tracked/i);
});

test("count-based daily claims remain ready until their daily limit is reached", async () => {
  const item = {
    id: "daily-count-test",
    name: "Count Test",
    cooldown: "2/day",
  };
  const data = {
    state: {},
    history: [],
    settings: { autoPricing: { enabled: false } },
  };
  const app = new NeopianAssistantApp(data, { persistData: async (snapshot) => snapshot });
  app.announce = () => undefined;
  app.renderActiveTab = () => undefined;

  await app.claimDaily(item);
  assert.match(
    app.getStatusText(item, {
      complete: false,
      availableAt: null,
      count: 1,
      limit: 2,
    }),
    /1 of 2 claimed.*ready again/i,
  );
  await app.claimDaily(item);
  await app.claimDaily(item);

  assert.equal(data.state[item.id].completed, 2);
  assert.equal(data.history.length, 2);
});
