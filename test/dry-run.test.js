import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { AutoBuyController } from "../src/content/auto-buy.js";
import { AutoPricingController } from "../src/content/auto-pricing.js";

const candidate = {
  itemName: "Healing Potion I",
  owner: "safe_owner",
  objectId: "123456",
  price: 25,
  purchaseUrl:
    "https://www.neopets.com/browseshop.phtml?owner=safe_owner&buy_obj_info_id=123456&buy_cost_neopoints=25",
};

function installDom() {
  const { document, window } = parseHTML("<!doctype html><html><body></body></html>");
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = (tagName) => {
    const node = originalCreateElement(tagName);
    if (tagName.toLowerCase() === "dialog") {
      node.showModal = () => {
        node.open = true;
      };
      node.close = () => {
        node.open = false;
        node.dispatchEvent(new window.Event("close"));
      };
    }
    return node;
  };
  return { document, window };
}

async function confirmDialog(document, label) {
  const checkbox = document.querySelector(".na-confirm-row input");
  checkbox.checked = true;
  checkbox.dispatchEvent(new document.defaultView.Event("change"));
  const action = [...document.querySelectorAll("button")].find(
    (button) => button.textContent.trim() === label,
  );
  assert.ok(action);
  action.click();
  await new Promise((resolve) => setImmediate(resolve));
}

test("Auto Buy dry run never sends a purchase message", async () => {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    Node: globalThis.Node,
  };
  const dom = installDom();
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.Node = dom.window.Node;
  let messages = 0;
  try {
    const controller = new AutoBuyController({
      data: { settings: { autoBuy: { enabled: true, dryRun: true, maximumPrice: 1000 } } },
      save: async () => undefined,
      announce: () => undefined,
    });
    controller.status = document.createElement("div");
    controller.send = async () => {
      messages += 1;
      return { ok: true };
    };
    controller.openReviewDialog(candidate);
    await confirmDialog(document, "Finish dry run");
    assert.equal(messages, 0);
    assert.match(controller.status.textContent, /No purchase URL was followed/i);
  } finally {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.Node = previous.Node;
  }
});

test("SW Autobuy renders a 10-item watchlist and stops on an authorization mismatch", async () => {
  const previous = {
    chrome: globalThis.chrome,
    document: globalThis.document,
    window: globalThis.window,
    Node: globalThis.Node,
  };
  const dom = installDom();
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.Node = dom.window.Node;
  Object.defineProperty(globalThis.window, "location", {
    configurable: true,
    value: { href: "https://www.neopets.com/shops/wizard.phtml" },
  });
  globalThis.chrome = { runtime: { sendMessage: async () => ({ ok: true }) } };
  try {
    const watchlist = Array.from({ length: 10 }, (_, index) => `Watched Item ${index + 1}`);
    const controller = new AutoBuyController({
      data: {
        settings: {
          autoBuy: {
            enabled: true,
            dryRun: true,
            maximumPrice: 1000,
            requestIntervalMs: 6000,
            watchlist,
          },
        },
      },
      save: async () => undefined,
      announce: () => undefined,
    });
    controller.send = async () => ({ ok: true, itemName: "Different Item" });
    const container = document.createElement("div");
    document.body.append(container);
    controller.render(container);
    assert.match(container.textContent, /SW Autobuy/);
    assert.equal(container.querySelector("textarea").value.split("\n").length, 10);
    const start = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Start monitoring",
    );
    start.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(controller.monitoring, false);
    assert.match(controller.status.textContent, /did not match/i);
  } finally {
    globalThis.chrome = previous.chrome;
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.Node = previous.Node;
  }
});

test("SW Autobuy reports that monitoring stopped before opening an exact review", () => {
  const previous = {
    chrome: globalThis.chrome,
    document: globalThis.document,
    window: globalThis.window,
    Node: globalThis.Node,
  };
  const dom = installDom();
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.Node = dom.window.Node;
  globalThis.chrome = { runtime: { sendMessage: async () => ({ ok: true }) } };
  try {
    const controller = new AutoBuyController({
      data: {
        settings: {
          autoBuy: {
            enabled: true,
            dryRun: true,
            maximumPrice: 1000,
            requestIntervalMs: 6000,
            watchlist: [candidate.itemName],
          },
        },
      },
      save: async () => undefined,
      announce: () => undefined,
    });
    controller.status = document.createElement("div");
    controller.monitoring = true;
    controller.monitorRunId = "4b56a9ee-1432-4b39-a3fb-1df34b8a3e42";
    controller.beginReview(candidate);
    assert.equal(controller.monitoring, false);
    assert.match(controller.status.textContent, /monitoring stopped/i);
    assert.ok(controller.dialog?.open);
    controller.cleanup();
  } finally {
    globalThis.chrome = previous.chrome;
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.Node = previous.Node;
  }
});

test("SW Autobuy keeps a ready one-item result reviewable during the next paced lookup", async () => {
  const previous = {
    chrome: globalThis.chrome,
    document: globalThis.document,
    window: globalThis.window,
    Node: globalThis.Node,
  };
  const dom = installDom();
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.Node = dom.window.Node;
  globalThis.chrome = { runtime: { sendMessage: async () => ({ ok: true }) } };
  let releaseAuthorization;
  try {
    const controller = new AutoBuyController({
      data: {
        settings: {
          autoBuy: {
            enabled: true,
            dryRun: true,
            maximumPrice: 1000,
            requestIntervalMs: 6000,
            watchlist: [candidate.itemName],
          },
        },
      },
      save: async () => undefined,
      announce: () => undefined,
    });
    const runId = "4b56a9ee-1432-4b39-a3fb-1df34b8a3e42";
    controller.monitoring = true;
    controller.monitorRunId = runId;
    controller.monitorResults = new Map([[candidate.itemName, { state: "ready", candidate }]]);
    controller.monitorResultsRoot = document.createElement("div");
    controller.send = () =>
      new Promise((resolve) => {
        releaseAuthorization = resolve;
      });
    const monitor = controller.runMonitor(runId);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(controller.monitorResults.get(candidate.itemName).state, "ready");
    controller.stopMonitoring();
    releaseAuthorization({ ok: true, itemName: candidate.itemName });
    await monitor;
  } finally {
    globalThis.chrome = previous.chrome;
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.Node = previous.Node;
  }
});

test("SW Autobuy keeps an active purchase review visible until its request settles", async () => {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    Node: globalThis.Node,
  };
  const dom = installDom();
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.Node = dom.window.Node;
  try {
    const controller = new AutoBuyController({
      data: { settings: { autoBuy: { enabled: true, dryRun: false, maximumPrice: 1000 } } },
      save: async () => undefined,
      announce: () => undefined,
    });
    controller.status = document.createElement("div");
    controller.send = async () => new Promise(() => undefined);
    controller.openReviewDialog(candidate);
    const checkbox = document.querySelector(".na-confirm-row input");
    checkbox.checked = true;
    checkbox.dispatchEvent(new document.defaultView.Event("change"));
    const action = [...document.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Buy one item",
    );
    action.click();
    await new Promise((resolve) => setImmediate(resolve));
    const closeButton = document.querySelector("button[aria-label='Close']");
    const cancelButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === "Cancel",
    );
    assert.equal(closeButton.disabled, true);
    assert.equal(cancelButton.disabled, true);
    const cancelEvent = new document.defaultView.Event("cancel", { cancelable: true });
    controller.dialog.dispatchEvent(cancelEvent);
    assert.equal(cancelEvent.defaultPrevented, true);
    assert.equal(controller.dialog.open, true);
    controller.cleanup();
  } finally {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.Node = previous.Node;
  }
});

test("Auto Pricing dry run never sends a price-update message", async () => {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    Node: globalThis.Node,
  };
  const dom = installDom();
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.Node = dom.window.Node;
  let messages = 0;
  try {
    const controller = new AutoPricingController({
      data: {
        settings: {
          autoPricing: {
            enabled: true,
            dryRun: true,
            rule: "undercut",
            amount: 1,
            floor: 1,
            maxItems: 1,
            requestIntervalMs: 6000,
          },
        },
      },
      save: async () => undefined,
      announce: () => undefined,
    });
    controller.status = document.createElement("div");
    controller.send = async () => {
      messages += 1;
      return { ok: true };
    };
    const row = {
      id: "123",
      name: "Test Item",
      objectIdField: "obj_id_1",
      priceField: "cost_1",
      currentPrice: 100,
      proposedPrice: 99,
      include: true,
    };
    controller.openReviewDialog({
      plan: { accountContext: "Example_User", rows: [row] },
      changedRows: [row],
      operationId: "4b56a9ee-1432-4b39-a3fb-1df34b8a3e42",
    });
    await confirmDialog(document, "Finish dry run");
    assert.equal(messages, 0);
    assert.match(controller.status.textContent, /No prices were submitted/i);
  } finally {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.Node = previous.Node;
  }
});

test("Auto Pricing reviews and submits only currently selected rows", () => {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    Node: globalThis.Node,
  };
  const dom = installDom();
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.Node = dom.window.Node;
  try {
    const controller = new AutoPricingController({
      data: { settings: { autoPricing: { enabled: true, dryRun: false } } },
      save: async () => undefined,
      announce: () => undefined,
    });
    controller.resultList = document.createElement("div");
    controller.reviewButton = document.createElement("button");
    controller.reviewButton.append(document.createTextNode("Review 2 price changes"));
    controller.results = [
      {
        id: "123",
        name: "Selected Item",
        objectIdField: "obj_id_1",
        priceField: "cost_1",
        currentPrice: 100,
        lowestPrice: 90,
        proposedPrice: 89,
        include: true,
        error: null,
      },
      {
        id: "456",
        name: "Excluded Item",
        objectIdField: "obj_id_2",
        priceField: "cost_2",
        currentPrice: 200,
        lowestPrice: 190,
        proposedPrice: 189,
        include: true,
        error: null,
      },
    ];
    controller.renderResults();
    const checkboxes = controller.resultList.querySelectorAll("input[type='checkbox']");
    checkboxes[1].checked = false;
    checkboxes[1].dispatchEvent(new window.Event("change"));
    assert.equal(controller.reviewButton.textContent, "Review 1 price change");
    assert.deepEqual(
      controller.buildPlan().rows.map((row) => row.name),
      ["Selected Item"],
    );
  } finally {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.Node = previous.Node;
  }
});

test("Auto Pricing owns one review dialog and removes it during cleanup", () => {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    Node: globalThis.Node,
  };
  const dom = installDom();
  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.Node = dom.window.Node;
  try {
    const controller = new AutoPricingController({
      data: { settings: { autoPricing: { enabled: true, dryRun: true } } },
      save: async () => undefined,
      announce: () => undefined,
    });
    controller.status = document.createElement("div");
    const row = {
      id: "123",
      name: "Test Item",
      objectIdField: "obj_id_1",
      priceField: "cost_1",
      currentPrice: 100,
      proposedPrice: 99,
      include: true,
    };
    const review = {
      plan: { accountContext: "Example_User", rows: [row] },
      changedRows: [row],
      operationId: "4b56a9ee-1432-4b39-a3fb-1df34b8a3e42",
    };
    controller.openReviewDialog(review);
    controller.openReviewDialog(review);
    assert.equal(document.querySelectorAll("dialog").length, 1);
    controller.cleanup();
    assert.equal(document.querySelectorAll("dialog").length, 0);
    assert.equal(controller.dialog, null);
  } finally {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.Node = previous.Node;
  }
});
