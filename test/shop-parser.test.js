import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import {
  extractAccountContext,
  extractShopRows,
  parseWizardResponse,
  verifyAppliedPrices,
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
