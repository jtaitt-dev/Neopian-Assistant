import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import {
  extractAccountContext,
  extractPurchaseCandidates,
  extractShopRows,
  parseWizardResponse,
  verifyAppliedPrices,
  verifyFreshPurchaseCandidate,
  verifyFreshShopState,
  verifyPurchaseResponse,
} from "../src/content/shop-parser.js";

function parser() {
  return { parseFromString: (html) => parseHTML(html).document };
}

const shopHtml = `<!doctype html><html><body>
  <header id="header"><a href="/userlookup.phtml?user=Example_User">Profile</a></header>
  <form action="process_market.phtml"><table>
    <tr><td><b>Valid Item</b></td><td><input name="obj_id_1" value="123"><input name="cost_1" value="1,000"></td></tr>
    <tr><td><b>Bad Item</b></td><td><input name="obj_id_2" value="bad&id"><input name="cost_2" value="abc"></td></tr>
  </table></form>
</body></html>`;

test("shop page parsing validates account, identifiers, and prices", () => {
  const { document } = parseHTML(shopHtml);
  assert.equal(extractAccountContext(document), "Example_User");
  const rows = extractShopRows(document);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "123");
  assert.equal(rows[0].currentPrice, 1000);
});

test("Shop Wizard parsing rejects malformed prices and recognizes wait responses", () => {
  const valid = parseWizardResponse(
    `<ul class="wizard-results-grid-shop"><li><span class="wizard-results-price">1,234 NP</span></li><li><span class="wizard-results-price">900 NP</span></li></ul>`,
    parser(),
  );
  assert.deepEqual(valid.prices, [900, 1234]);
  assert.equal(valid.error, null);
  const wait = parseWizardResponse("<p>Too many searches. Please wait.</p>", parser());
  assert.match(wait.error, /wait/i);
});

test("verification reports exact mismatches instead of false success", () => {
  const expected = [
    {
      id: "123",
      name: "Valid Item",
      objectIdField: "obj_id_1",
      priceField: "cost_1",
      currentPrice: 1000,
      proposedPrice: 999,
      include: true,
    },
  ];
  assert.equal(
    verifyAppliedPrices(shopHtml.replace("1,000", "999"), expected, parser()).verified,
    true,
  );
  const failed = verifyAppliedPrices(shopHtml, expected, parser());
  assert.equal(failed.verified, false);
  assert.equal(failed.mismatches.length, 1);
});

test("fresh shop checks reject changed account, row identity, or current price", () => {
  const plan = {
    accountContext: "Example_User",
    rows: [
      {
        id: "123",
        name: "Valid Item",
        objectIdField: "obj_id_1",
        priceField: "cost_1",
        currentPrice: 1000,
        proposedPrice: 999,
        include: true,
      },
    ],
  };
  assert.equal(verifyFreshShopState(shopHtml, plan, parser()).fresh, true);
  assert.equal(verifyFreshShopState(shopHtml.replace("1,000", "998"), plan, parser()).fresh, false);
  assert.equal(
    verifyFreshShopState(shopHtml.replace("Example_User", "Other_User"), plan, parser()).fresh,
    false,
  );
});

const purchaseCandidate = {
  itemName: "Healing Potion I",
  owner: "safe_owner",
  objectId: "123456",
  price: 25,
  purchaseUrl:
    "https://www.neopets.com/browseshop.phtml?owner=safe_owner&buy_obj_info_id=123456&buy_cost_neopoints=25",
};

const wizardPurchaseHtml = `<!doctype html><html><body>
  <input id="shopwizard" value="Healing Potion I">
  <div class="wizard-results-grid-shop"><ul>
    <li class="wizard-results-grid-header">Shop Owner Stock Price</li>
    <li><a href="${purchaseCandidate.purchaseUrl}"><span>safe_owner</span><span>1</span><span class="wizard-results-price">25 NP</span></a></li>
    <li><a href="https://www.neopets.com/browseshop.phtml?owner=other_owner&buy_obj_info_id=654321&buy_cost_neopoints=30"><span>other_owner</span><span>1</span><span class="wizard-results-price">29 NP</span></a></li>
  </ul></div>
</body></html>`;

test("Shop Wizard purchase parsing requires visible and URL prices to match", () => {
  const { document } = parseHTML(wizardPurchaseHtml);
  const candidates = extractPurchaseCandidates(document);
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0], purchaseCandidate);
  assert.equal(
    verifyFreshPurchaseCandidate(wizardPurchaseHtml, purchaseCandidate, parser()).fresh,
    true,
  );
  assert.equal(
    verifyFreshPurchaseCandidate(
      wizardPurchaseHtml.replace("buy_cost_neopoints=25", "buy_cost_neopoints=26"),
      purchaseCandidate,
      parser(),
    ).fresh,
    false,
  );
});

test("Shop Wizard purchase parsing falls back to the live results heading after search clears", () => {
  const resultsOnly = wizardPurchaseHtml
    .replace('<input id="shopwizard" value="Healing Potion I">', "")
    .replace(
      '<div class="wizard-results-grid-shop">',
      '<div id="shopWizardFormResults"><div class="wizard-results-header"><h3>Healing Potion I</h3></div><div class="wizard-results-grid-shop">',
    )
    .replace("</body>", "</div></body>");
  const { document } = parseHTML(resultsOnly);
  assert.deepEqual(extractPurchaseCandidates(document)[0], purchaseCandidate);
});

test("purchase verification requires item identity and unambiguous success language", () => {
  assert.equal(
    verifyPurchaseResponse(
      "<main><h1>Healing Potion I</h1><p>Your purchase has been successful!</p></main>",
      purchaseCandidate,
      parser(),
    ).verified,
    true,
  );
  assert.equal(
    verifyPurchaseResponse(
      "<main><h1>Healing Potion I</h1><p>This item has been sold.</p></main>",
      purchaseCandidate,
      parser(),
    ).verified,
    false,
  );
});
