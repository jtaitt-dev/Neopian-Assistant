import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithDeadline } from "../src/shared/network.js";

test("network helper forwards a caller abort", async () => {
  const controller = new AbortController();
  const pending = fetchWithDeadline({
    fetchImplementation: (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(new Error(String(options.signal.reason))),
          { once: true },
        );
      }),
    url: "https://www.neopets.com/",
    options: {},
    timeoutMs: 1000,
    controller,
  });
  controller.abort("cancelled");
  await assert.rejects(pending, /cancelled/);
});

test("network helper aborts requests when the deadline expires", async () => {
  await assert.rejects(
    fetchWithDeadline({
      fetchImplementation: (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(new Error(String(options.signal.reason))),
            { once: true },
          );
        }),
      url: "https://www.neopets.com/",
      options: {},
      timeoutMs: 10,
    }),
    /timeout/,
  );
});
