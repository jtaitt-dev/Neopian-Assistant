import assert from "node:assert/strict";
import test from "node:test";
import { fetchWizardHtml } from "../src/content/wizard-client.js";

function response({ text = "<div>ok</div>", contentLength = String(text.length) } = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-length": contentLength }),
    text: async () => text,
  };
}

test("Wizard client performs one bounded same-origin authenticated HTML request", async () => {
  let request;
  const html = await fetchWizardHtml("Tea & Biscuits", {
    fetchImplementation: async (url, options) => {
      request = { url, options };
      return response();
    },
  });
  assert.equal(html, "<div>ok</div>");
  assert.equal(request.url, "https://www.neopets.com/np-templates/ajax/wizard.php");
  assert.equal(request.options.credentials, "include");
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.redirect, "error");
  assert.equal(request.options.referrer, "https://www.neopets.com/shops/wizard.phtml");
  assert.equal(request.options.referrerPolicy, "strict-origin-when-cross-origin");
  assert.equal(request.options.headers["X-Requested-With"], "XMLHttpRequest");
  assert.equal(new URLSearchParams(request.options.body).get("shopwizard"), "Tea & Biscuits");
});

test("Wizard client rejects oversized and invalid responses", async () => {
  await assert.rejects(
    fetchWizardHtml("Test Item", {
      fetchImplementation: async () => response({ contentLength: "2000001" }),
    }),
    /safe size limit/i,
  );
  await assert.rejects(
    fetchWizardHtml("Test Item", {
      fetchImplementation: async () => ({ ...response(), ok: false, status: 503 }),
    }),
    /HTTP 503/,
  );
  await assert.rejects(fetchWizardHtml(""), /bounded item name/i);
});
