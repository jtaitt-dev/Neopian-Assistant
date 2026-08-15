import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import {
  extractAccountContext,
  extractPurchaseCandidates,
  extractShopRows,
  parseWizardResponse,
  parsePurchaseCandidates,
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

test("shop page parsing uses the live item image label instead of the quantity cell", () => {
  const { document } = parseHTML(`<!doctype html><html><body>
    <form action="process_market.phtml"><table><tr>
      <td><img alt="Live Item Name">Live Item Name <span>rarity metadata</span></td>
      <td>Item description</td>
      <td><b>2</b> in stock</td>
      <td><input name="obj_id_7" value="456"><input name="cost_7" value="9,310"></td>
      <td>controls</td>
    </tr></table></form>
  </body></html>`);
  const rows = extractShopRows(document);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Live Item Name");
  assert.notEqual(rows[0].name, "2");
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

test("Shop Wizard parsing accepts bounded JSON-wrapped HTML responses", () => {
  const html = `<div class="wizard-results-grid-shop"><ul><li><span class="wizard-results-price">875 NP</span></li><li><span class="wizard-results-price">1,025 NP</span></li></ul></div>`;
  const wrapped = JSON.stringify({ success: true, payload: { html } });
  assert.deepEqual(parseWizardResponse(wrapped, parser()), {
    prices: [875, 1025],
    error: null,
  });
  assert.match(
    parseWizardResponse(
      JSON.stringify({ message: "Please wait before searching again." }),
      parser(),
    ).error,
    /wait/i,
  );
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
  assert.equal(
    verifyAppliedPrices(
      shopHtml.replace('value="123"', 'value="456"').replace("1,000", "999"),
      expected,
      parser(),
    ).verified,
    true,
  );
  const ambiguous = shopHtml
    .replace('value="123"', 'value="456"')
    .replace("1,000", "999")
    .replace(
      "</table>",
      `<tr><td><b>Valid Item</b></td><td><input name="obj_id_8" value="789"><input name="cost_8" value="999"></td></tr></table>`,
    );
  assert.equal(verifyAppliedPrices(ambiguous, expected, parser()).verified, false);
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
  const exact = verifyFreshShopState(shopHtml, plan, parser());
  assert.deepEqual(exact.mismatchCodes, []);
  assert.deepEqual(exact.plan, plan);
  assert.equal(exact.reboundCount, 0);
  assert.deepEqual(
    verifyFreshShopState(shopHtml.replace("1,000", "998"), plan, parser()).mismatchCodes,
    ["current price"],
  );
  assert.deepEqual(
    verifyFreshShopState(shopHtml.replace("Example_User", "Other_User"), plan, parser())
      .mismatchCodes,
    ["account"],
  );
  assert.deepEqual(
    verifyFreshShopState(shopHtml.replace("Valid Item", "Changed Item"), plan, parser())
      .mismatchCodes,
    ["item name"],
  );
  const reboundFields = verifyFreshShopState(shopHtml.replaceAll("_1", "_8"), plan, parser());
  assert.equal(reboundFields.fresh, true);
  assert.equal(reboundFields.reboundCount, 1);
  assert.equal(reboundFields.plan.rows[0].objectIdField, "obj_id_8");
  assert.equal(reboundFields.plan.rows[0].priceField, "cost_8");
  const reboundIdentity = verifyFreshShopState(
    shopHtml.replace('value="123"', 'value="456"'),
    plan,
    parser(),
  );
  assert.equal(reboundIdentity.fresh, true);
  assert.equal(reboundIdentity.reboundCount, 1);
  assert.equal(reboundIdentity.plan.rows[0].id, "456");
  assert.deepEqual(verifyFreshShopState("", plan, parser()).mismatchCodes, ["empty response"]);
});

test("fresh shop checks reject ambiguous replacement identities", () => {
  const ambiguousHtml = shopHtml.replace(
    "</table>",
    `<tr><td><b>Valid Item</b></td><td><input name="obj_id_8" value="456"><input name="cost_8" value="1,000"></td></tr></table>`,
  );
  const plan = {
    accountContext: "Example_User",
    rows: [
      {
        id: "999",
        name: "Valid Item",
        objectIdField: "obj_id_9",
        priceField: "cost_9",
        currentPrice: 1000,
        proposedPrice: 999,
        include: true,
      },
    ],
  };
  const result = verifyFreshShopState(ambiguousHtml, plan, parser());
  assert.equal(result.fresh, false);
  assert.equal(result.plan, null);
  assert.deepEqual(result.mismatchCodes, ["selected item ambiguous"]);
});

test("fresh shop checks bind selected rows without blocking on unrelated stock", () => {
  const expandedShopHtml = shopHtml.replace(
    "</table>",
    `<tr><td><b>Unrelated Item</b></td><td><input name="obj_id_9" value="999"><input name="cost_9" value="777"></td></tr></table>`,
  );
  const selected = {
    id: "123",
    name: "Valid Item",
    objectIdField: "obj_id_1",
    priceField: "cost_1",
    currentPrice: 1000,
    proposedPrice: 999,
    include: true,
  };
  const excluded = {
    id: "999",
    name: "Unrelated Item",
    objectIdField: "obj_id_9",
    priceField: "cost_9",
    currentPrice: 1,
    proposedPrice: 1,
    include: false,
  };
  assert.equal(
    verifyFreshShopState(
      expandedShopHtml,
      {
        accountContext: "Example_User",
        rows: [selected],
      },
      parser(),
    ).fresh,
    true,
  );
  assert.equal(
    verifyFreshShopState(
      expandedShopHtml,
      {
        accountContext: "Example_User",
        rows: [selected, excluded],
      },
      parser(),
    ).fresh,
    true,
  );
  assert.equal(
    verifyFreshShopState(
      expandedShopHtml.replace("1,000", "998"),
      {
        accountContext: "Example_User",
        rows: [selected],
      },
      parser(),
    ).fresh,
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
  assert.equal(
    verifyFreshPurchaseCandidate(
      wizardPurchaseHtml
        .replaceAll("25 NP", "26 NP")
        .replaceAll("buy_cost_neopoints=25", "buy_cost_neopoints=26"),
      purchaseCandidate,
      parser(),
    ).retryable,
    false,
  );
  assert.equal(
    verifyFreshPurchaseCandidate(
      "<main>No result in this market section.</main>",
      purchaseCandidate,
      parser(),
    ).retryable,
    true,
  );
});

test("SW Autobuy parses monitored response HTML against the requested exact item name", () => {
  assert.deepEqual(
    parsePurchaseCandidates(wizardPurchaseHtml, "Healing Potion I", parser())[0],
    purchaseCandidate,
  );
  assert.deepEqual(parsePurchaseCandidates("", "Healing Potion I", parser()), []);
  assert.deepEqual(parsePurchaseCandidates(wizardPurchaseHtml, "", parser()), []);
  assert.deepEqual(
    parsePurchaseCandidates(
      JSON.stringify({ success: true, payload: { html: wizardPurchaseHtml } }),
      "Healing Potion I",
      parser(),
    )[0],
    purchaseCandidate,
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
