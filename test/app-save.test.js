import assert from "node:assert/strict";
import test from "node:test";
import { NeopianAssistantApp } from "../src/content/app.js";

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
