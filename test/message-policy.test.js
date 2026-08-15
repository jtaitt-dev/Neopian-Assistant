import assert from "node:assert/strict";
import test from "node:test";
import { validateExtensionSender } from "../src/shared/message-policy.js";

const extensionId = "trusted-extension";

test("message sender validation binds the extension ID, tab, and exact feature page", () => {
  const pricingSender = {
    id: extensionId,
    tab: { id: 1, url: "https://www.neopets.com/market.phtml?type=your" },
  };
  const purchaseSender = {
    id: extensionId,
    tab: { id: 2, url: "https://www.neopets.com/shops/wizard.phtml" },
  };
  const mainShopSender = {
    id: extensionId,
    tab: {
      id: 3,
      url: "https://www.neopets.com/objects.phtml?type=shop&obj_type=2",
    },
  };
  assert.equal(validateExtensionSender(pricingSender, extensionId, "pricing"), true);
  assert.equal(validateExtensionSender(pricingSender, extensionId, "neopets"), true);
  assert.equal(validateExtensionSender(pricingSender, extensionId, "purchase"), false);
  assert.equal(validateExtensionSender(purchaseSender, extensionId, "purchase"), true);
  assert.equal(validateExtensionSender(mainShopSender, extensionId, "mainShop"), true);
  assert.equal(validateExtensionSender(purchaseSender, extensionId, "mainShop"), false);
  assert.equal(
    validateExtensionSender(
      {
        ...mainShopSender,
        tab: {
          id: 4,
          url: "https://www.neopets.com/objects.phtml?type=shop&obj_type=3",
        },
      },
      extensionId,
      "mainShop",
    ),
    false,
  );
  assert.equal(
    validateExtensionSender({ ...purchaseSender, id: "other-extension" }, extensionId, "purchase"),
    false,
  );
  assert.equal(
    validateExtensionSender(
      {
        id: extensionId,
        tab: { id: 3, url: "https://evil.example/shops/wizard.phtml" },
      },
      extensionId,
      "purchase",
    ),
    false,
  );
  assert.equal(
    validateExtensionSender(
      {
        id: extensionId,
        tab: { id: 4, url: "https://evil.example/?next=https://www.neopets.com" },
      },
      extensionId,
      "neopets",
    ),
    false,
  );
  assert.equal(validateExtensionSender({ id: extensionId }, extensionId, "pricing"), false);
});
