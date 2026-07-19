import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchPurchaseHtml,
  loadHydratedShopStockHtml,
  submitShopUpdate,
} from "../src/content/shop-client.js";
import { parseHTML } from "linkedom";

function response({ text = "<main>ok</main>", contentLength = String(text.length) } = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-length": contentLength }),
    text: async () => text,
  };
}

const purchaseCandidate = {
  itemName: "Healing Potion I",
  owner: "safe_owner",
  objectId: "123456",
  price: 25,
  purchaseUrl:
    "https://www.neopets.com/browseshop.phtml?owner=safe_owner&buy_obj_info_id=123456&buy_cost_neopoints=25",
};

const hydratedShopHtml = `<!doctype html><html><body>
  <form action="/process_market.phtml">
    <input name="obj_id_1" value="123456">
    <input name="cost_1" value="999">
  </form>
</body></html>`;

function hydrationHarness({
  html = hydratedShopHtml,
  hydrateAfterMs = 0,
  errorAfterMs = null,
} = {}) {
  const emptyDocument = parseHTML("<!doctype html><html><body></body></html>").document;
  const hydratedDocument = parseHTML(html).document;
  Object.defineProperty(emptyDocument, "URL", {
    configurable: true,
    value: "https://www.neopets.com/market.phtml?type=your",
  });
  Object.defineProperty(hydratedDocument, "URL", {
    configurable: true,
    value: "https://www.neopets.com/market.phtml?type=your",
  });
  const listeners = new Map();
  const frame = {
    contentDocument: emptyDocument,
    removed: false,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    setAttribute() {},
    remove() {
      this.removed = true;
    },
  };
  const documentObject = {
    body: {
      append(node) {
        assert.equal(node, frame);
        if (errorAfterMs !== null) {
          setTimeout(() => listeners.get("error")?.(), errorAfterMs);
        } else if (hydrateAfterMs !== null) {
          setTimeout(() => {
            frame.contentDocument = hydratedDocument;
            listeners.get("load")?.();
          }, hydrateAfterMs);
        }
      },
    },
    createElement(tagName) {
      assert.equal(tagName, "iframe");
      return frame;
    },
  };
  return { documentObject, frame, serializeImplementation: (element) => String(element) };
}

test("content shop client submits only a validated worker-authored update payload", async () => {
  let request;
  const payload = "type=update_prices&obj_id_1=123456&cost_1=999";
  await submitShopUpdate(payload, {
    fetchImplementation: async (url, options) => {
      request = { url, options };
      return response();
    },
  });
  assert.equal(request.url, "https://www.neopets.com/process_market.phtml");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.body, payload);
  assert.equal(request.options.credentials, "include");
  assert.equal(request.options.redirect, "follow");
  await assert.rejects(
    submitShopUpdate("type=update_prices&next=https%3A%2F%2Fevil.example", {
      fetchImplementation: async () => response(),
    }),
    /payload is invalid/i,
  );
});

test("content purchase client follows only an exact validated listing once", async () => {
  let request;
  await fetchPurchaseHtml(purchaseCandidate, {
    fetchImplementation: async (url, options) => {
      request = { url, options };
      return response();
    },
  });
  assert.equal(request.url, purchaseCandidate.purchaseUrl);
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.credentials, "include");
  assert.equal(request.options.redirect, "follow");
  await assert.rejects(
    fetchPurchaseHtml({ ...purchaseCandidate, purchaseUrl: "https://evil.example/" }),
    /listing is invalid/i,
  );
});

test("content shop client rejects oversized authenticated responses", async () => {
  await assert.rejects(
    submitShopUpdate("type=update_prices&obj_id_1=123456&cost_1=999", {
      fetchImplementation: async () => response({ contentLength: "2000001" }),
    }),
    /safe size limit/i,
  );
});

test("content shop client rejects a frame load failure and removes its frame", async () => {
  const { documentObject, frame, serializeImplementation } = hydrationHarness({
    hydrateAfterMs: null,
    errorAfterMs: 0,
  });
  await assert.rejects(
    loadHydratedShopStockHtml({
      documentObject,
      timeoutMs: 100,
      pollIntervalMs: 5,
      serializeImplementation,
    }),
    /could not be loaded/i,
  );
  assert.equal(frame.removed, true);
});

test("content shop client waits for a same-origin hydrated stock form and removes its frame", async () => {
  const { documentObject, frame, serializeImplementation } = hydrationHarness();
  const html = await loadHydratedShopStockHtml({
    documentObject,
    timeoutMs: 100,
    pollIntervalMs: 5,
    serializeImplementation,
  });
  assert.match(html, /obj_id_1/);
  assert.match(html, /cost_1/);
  assert.equal(frame.src, "https://www.neopets.com/market.phtml?type=your");
  assert.equal(frame.hidden, true);
  assert.equal(frame.tabIndex, -1);
  assert.equal(frame.removed, true);
});

test("content shop client times out incomplete hydration and removes its frame", async () => {
  const { documentObject, frame, serializeImplementation } = hydrationHarness({
    hydrateAfterMs: null,
  });
  await assert.rejects(
    loadHydratedShopStockHtml({
      documentObject,
      timeoutMs: 20,
      pollIntervalMs: 5,
      serializeImplementation,
    }),
    /did not finish loading stock in time/i,
  );
  assert.equal(frame.removed, true);
});

test("content shop client rejects oversized hydrated stock and removes its frame", async () => {
  const { documentObject, frame, serializeImplementation } = hydrationHarness({
    html: hydratedShopHtml.replace("</body>", `<div>${"x".repeat(2_000_000)}</div></body>`),
  });
  await assert.rejects(
    loadHydratedShopStockHtml({
      documentObject,
      timeoutMs: 100,
      pollIntervalMs: 5,
      serializeImplementation,
    }),
    /safe size limit/i,
  );
  assert.equal(frame.removed, true);
});
