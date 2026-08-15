import assert from "node:assert/strict";
import test from "node:test";
import { fetchMagicShopHtml, openKauvaraHagglePage } from "../src/content/main-shop-client.js";

function response({ text = "<main>ok</main>", contentLength = String(text.length) } = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-length": contentLength }),
    text: async () => text,
  };
}

const candidate = {
  itemName: "Test Healing Potion",
  objectId: "12345",
  stockId: "987654321",
  price: 1922,
  stock: 11,
  haggleUrl: "https://www.neopets.com/haggle.phtml?obj_info_id=12345&stock_id=987654321&g=1",
};

test("MS Autobuy reads only the exact authenticated Kauvara stock page", async () => {
  let request;
  await fetchMagicShopHtml({
    fetchImplementation: async (url, options) => {
      request = { url, options };
      return response();
    },
  });
  assert.equal(request.url, "https://www.neopets.com/objects.phtml?type=shop&obj_type=2");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.credentials, "include");
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.redirect, "error");
  assert.equal(request.options.referrer, request.url);
});

test("MS Autobuy rejects oversized stock responses", async () => {
  await assert.rejects(
    fetchMagicShopHtml({
      fetchImplementation: async () => response({ contentLength: "2000001" }),
    }),
    /safe size limit/i,
  );
});

test("MS Autobuy opens one exact worker-authorized haggle URL", () => {
  const navigations = [];
  const result = openKauvaraHagglePage(candidate, candidate.haggleUrl, (url) => {
    navigations.push(url);
  });
  assert.equal(result, candidate.haggleUrl);
  assert.deepEqual(navigations, [candidate.haggleUrl]);
  assert.throws(
    () => openKauvaraHagglePage(candidate, `${candidate.haggleUrl}&next=bad`, () => undefined),
    /handoff is invalid/i,
  );
});
