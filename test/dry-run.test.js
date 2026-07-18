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
