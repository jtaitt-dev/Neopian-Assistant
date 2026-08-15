import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import {
  extractMainShopCandidates,
  parseMainShopCandidates,
  verifyFreshMainShopCandidate,
} from "../src/content/main-shop-parser.js";

function parser() {
  return { parseFromString: (html) => parseHTML(html).document };
}

const candidate = {
  itemName: "Test Healing Potion",
  objectId: "12345",
  stockId: "987654321",
  price: 1922,
  stock: 11,
  haggleUrl: "https://www.neopets.com/haggle.phtml?obj_info_id=12345&stock_id=987654321&g=1",
};

const liveShapeHtml = `<!doctype html><html><body>
  <form name="items_for_sale" method="post" action="/objects.phtml?type=shop&obj_type=2">
    <div class="shop-grid">
      <div class="shop-item">
        <div class="item-img" data-name="Test Healing Potion" data-price="1,922"
          data-link="/haggle.phtml?obj_info_id=12345&stock_id=987654321&g=1"></div>
        <p class="item-name"><b>Test Healing Potion</b></p>
        <p class="item-stock">11 in stock</p>
        <p class="item-stock">Cost: 1,922 NP</p>
      </div>
      <div class="shop-item">
        <div class="item-img" data-name="Other Potion" data-price="900"
          data-link="/haggle.phtml?obj_info_id=54321&stock_id=123456789&g=0"></div>
        <p class="item-name"><b>Other Potion</b></p>
        <p class="item-stock">2 in stock</p>
        <p class="item-stock">Cost: 900 NP</p>
      </div>
    </div>
  </form>
</body></html>`;

test("Kauvara parser binds live names, stock, prices, and exact haggle URLs", () => {
  const { document } = parseHTML(liveShapeHtml);
  const candidates = extractMainShopCandidates(document);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[1].itemName, candidate.itemName);
  assert.deepEqual(candidates[1], candidate);
  assert.deepEqual(parseMainShopCandidates(liveShapeHtml, "test healing potion", parser()), [
    candidate,
  ]);
});

test("Kauvara parser rejects mismatched prices, names, and injected haggle parameters", () => {
  assert.equal(
    parseMainShopCandidates(
      liveShapeHtml.replace("Cost: 1,922 NP", "Cost: 1,923 NP"),
      candidate.itemName,
      parser(),
    ).length,
    0,
  );
  assert.equal(
    parseMainShopCandidates(
      liveShapeHtml.replace("<b>Test Healing Potion</b>", "<b>Different Potion</b>"),
      candidate.itemName,
      parser(),
    ).length,
    0,
  );
  assert.equal(
    parseMainShopCandidates(
      liveShapeHtml.replace('&g=1"', '&g=1&next=https://evil.example/"'),
      candidate.itemName,
      parser(),
    ).length,
    0,
  );
});

test("fresh Kauvara verification fails closed after stock or identity changes", () => {
  assert.equal(verifyFreshMainShopCandidate(liveShapeHtml, candidate, parser()).fresh, true);
  const soldOut = verifyFreshMainShopCandidate(
    liveShapeHtml.replace("11 in stock", "0 in stock"),
    candidate,
    parser(),
  );
  assert.equal(soldOut.fresh, false);
  assert.match(soldOut.error, /sold out|no longer available/i);
  const changed = verifyFreshMainShopCandidate(
    liveShapeHtml.replaceAll("1,922", "1,923"),
    candidate,
    parser(),
  );
  assert.equal(changed.fresh, false);
  assert.match(changed.error, /changed/i);
});
