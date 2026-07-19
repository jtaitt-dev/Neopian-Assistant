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
