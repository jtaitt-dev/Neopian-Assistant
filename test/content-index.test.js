import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultData } from "../src/shared/storage.js";
import { STORAGE_KEYS } from "../src/shared/constants.js";

test("disabled startup still registers listeners so later settings can mount the dashboard", async () => {
  const data = createDefaultData();
  data.settings.enabled = false;
  const registered = { storage: null, runtime: null, pagehide: null };
  const previousChrome = globalThis.chrome;
  const previousWindow = globalThis.window;
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ [STORAGE_KEYS.data]: data }),
        set: async () => undefined,
      },
      onChanged: {
        addListener: (listener) => {
          registered.storage = listener;
        },
        removeListener: () => undefined,
      },
    },
    runtime: {
      id: "test-extension",
      onMessage: {
        addListener: (listener) => {
          registered.runtime = listener;
        },
        removeListener: () => undefined,
      },
    },
  };
  globalThis.window = {
    addEventListener: (type, listener) => {
      if (type === "pagehide") registered.pagehide = listener;
    },
  };
  try {
    await import(`../src/content/index.js?disabled-startup=${Date.now()}`);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(typeof registered.storage, "function");
    assert.equal(typeof registered.runtime, "function");
    assert.equal(typeof registered.pagehide, "function");
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.window = previousWindow;
  }
});
