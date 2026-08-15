import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import {
  continueMainShopPurchase,
  findExactMainShopTrigger,
  parseMainShopHaggleForm,
  parseMainShopPurchaseOutcome,
} from "../src/content/main-shop-purchase-flow.js";

const operationId = "4b56a9ee-1432-4b39-a3fb-1df34b8a3e42";
const candidate = {
  itemName: "Test Healing Potion",
  objectId: "12345",
  stockId: "987654321",
  price: 1922,
  stock: 11,
  haggleUrl: "https://www.neopets.com/haggle.phtml?obj_info_id=12345&stock_id=987654321&g=1",
};
const shopUrl = "https://www.neopets.com/objects.phtml?type=shop&obj_type=2";
const liveHaggleUrl = `${candidate.haggleUrl}&cf_token=opaque`;

function createShopDocument() {
  return parseHTML(`<!doctype html><html><body>
    <form name="items_for_sale"><div class="shop-grid"><div class="shop-item">
      <div class="item-img" data-name="Test Healing Potion" data-price="1,922"
        data-link="/haggle.phtml?obj_info_id=12345&stock_id=987654321&g=1"></div>
      <p class="item-name"><b>Test Healing Potion</b></p>
      <p class="item-stock">11 in stock</p><p class="item-stock">Cost: 1,922 NP</p>
    </div></div></form>
    <button id="confirm-link">Yes</button>
  </body></html>`).document;
}

function createHaggleDocument(body) {
  return parseHTML(`<!doctype html><html><body>${body}</body></html>`).document;
}

test("MS Autobuy binds the official confirmation to one exact live stock card", async () => {
  const document = createShopDocument();
  const trigger = findExactMainShopTrigger(document, candidate);
  assert.ok(trigger);
  assert.equal(findExactMainShopTrigger(document, { ...candidate, price: 1923 }), null);

  let itemClicks = 0;
  let confirmationClicks = 0;
  trigger.addEventListener("click", () => {
    itemClicks += 1;
  });
  document.getElementById("confirm-link").addEventListener("click", () => {
    confirmationClicks += 1;
  });
  const transitions = [];
  const result = await continueMainShopPurchase({
    documentObject: document,
    locationObject: { href: shopUrl },
    waitForConfirmation: async () => document.getElementById("confirm-link"),
    sendImplementation: async (message) => {
      if (message.type === "mainShop.getPurchase") {
        return {
          ok: true,
          pending: { operationId, candidate, phase: "awaiting-listing" },
        };
      }
      if (message.type === "mainShop.advancePurchase") {
        transitions.push(message.nextPhase);
        return { ok: true, phase: message.nextPhase };
      }
      return { ok: true };
    },
  });
  assert.equal(result.state, "awaiting-haggle");
  assert.equal(itemClicks, 1);
  assert.equal(confirmationClicks, 1);
  assert.deepEqual(transitions, ["awaiting-verification", "awaiting-haggle"]);
});

test("MS Autobuy fills and submits the exact listed price once after verification", async () => {
  const document = createHaggleDocument(`
    <h2>Haggle for Test Healing Potion</h2>
    <form><p>Previous Offer : 0 NP</p><p>Current Offer : 0 NP</p>
      <label>Your Offer: <input type="text" value="0"></label>
      <button type="submit">Haggle!</button>
    </form>`);
  const parsed = parseMainShopHaggleForm(document, candidate);
  assert.ok(parsed);
  let submissions = 0;
  parsed.form.requestSubmit = () => {
    submissions += 1;
  };
  const result = await continueMainShopPurchase({
    documentObject: document,
    locationObject: { href: liveHaggleUrl },
    sendImplementation: async (message) => {
      if (message.type === "mainShop.getPurchase") {
        return {
          ok: true,
          pending: { operationId, candidate, phase: "awaiting-haggle" },
        };
      }
      if (message.type === "mainShop.advancePurchase") {
        return { ok: true, phase: "submitting", offer: candidate.price };
      }
      return { ok: true };
    },
  });
  assert.equal(result.state, "submitting");
  assert.equal(result.offer, candidate.price);
  assert.equal(parsed.input.value, String(candidate.price));
  assert.equal(submissions, 1);
});

test("MS Autobuy records success only from the exact accepted-offer and inventory messages", async () => {
  const successDocument = createHaggleDocument(`
    <h2>Haggle for Test Healing Potion</h2>
    <p>The Shopkeeper says 'I accept your offer of 1,922 Neopoints!'</p>
    <p>Test Healing Potion has been added to your inventory</p>`);
  assert.equal(parseMainShopPurchaseOutcome(successDocument, candidate, 1922), "verified");
  assert.equal(
    parseMainShopPurchaseOutcome(
      createHaggleDocument("<p>Test Healing Potion has been added to your inventory</p>"),
      candidate,
      1922,
    ),
    "unknown",
  );
  const completions = [];
  const result = await continueMainShopPurchase({
    documentObject: successDocument,
    locationObject: { href: liveHaggleUrl },
    sendImplementation: async (message) => {
      if (message.type === "mainShop.getPurchase") {
        return {
          ok: true,
          pending: { operationId, candidate, phase: "submitting" },
        };
      }
      if (message.type === "mainShop.completePurchase") completions.push(message.outcome);
      return { ok: true };
    },
  });
  assert.equal(result.state, "verified");
  assert.deepEqual(completions, ["verified"]);
});
