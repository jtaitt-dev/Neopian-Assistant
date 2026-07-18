import {
  boundedString,
  parseNeopointValue,
  sanitizeAccountContext,
  sanitizePurchaseCandidate,
  sanitizeShopRow,
} from "../shared/validation.js";

export function extractAccountContext(documentObject) {
  const selectors = [
    "#header a[href*='userlookup.phtml?user=']",
    ".navprofile a[href*='userlookup.phtml?user=']",
    "a[href*='userlookup.phtml?user=']",
  ];
  for (const selector of selectors) {
    const anchor = documentObject.querySelector(selector);
    const href = anchor?.getAttribute("href");
    if (!href) continue;
    try {
      const username = new URL(href, "https://www.neopets.com").searchParams.get("user");
      const sanitized = sanitizeAccountContext(username);
      if (sanitized) return sanitized;
    } catch {}
  }
  return null;
}

export function extractShopRows(documentObject) {
  const form = documentObject.querySelector("form[action*='process_market.phtml']");
  if (!form) return [];
  const rows = [];
  for (const row of form.querySelectorAll("tr")) {
    const priceInput = row.querySelector("input[name^='cost_']");
    const objectIdInput = row.querySelector("input[name^='obj_id_']");
    if (!priceInput || !objectIdInput) continue;
    const nameElement = row.querySelector("td:first-child b, b");
    const candidate = sanitizeShopRow({
      id: objectIdInput.value,
      name: boundedString(nameElement?.textContent, 100),
      objectIdField: objectIdInput.name,
      priceField: priceInput.name,
      currentPrice: priceInput.value,
      proposedPrice: priceInput.value,
      include: true,
    });
    if (candidate) rows.push(candidate);
  }
  return rows;
}

export function parseWizardPrices(documentObject) {
  const values = [];
  const nodes = documentObject.querySelectorAll(
    ".wizard-results-grid-shop li:not(.wizard-results-grid-header) .wizard-results-price",
  );
  for (const node of nodes) {
    const value = parseNeopointValue(node.textContent);
    if (value !== null && value > 0) values.push(value);
  }
  return [...new Set(values)].sort((left, right) => left - right);
}

export function parseWizardResponse(responseText, parser = new DOMParser()) {
  if (typeof responseText !== "string" || responseText.length === 0) {
    return { prices: [], error: "The Shop Wizard returned an empty response." };
  }
  const documentObject = parser.parseFromString(responseText, "text/html");
  const prices = parseWizardPrices(documentObject);
  if (prices.length === 0) {
    const text = boundedString(
      documentObject.body?.textContent || documentObject.documentElement?.textContent || "",
      1000,
    ).toLowerCase();
    if (text.includes("too many searches") || text.includes("please wait")) {
      return { prices: [], error: "The Shop Wizard asked you to wait before searching again." };
    }
    return { prices: [], error: "No valid Shop Wizard prices were found for this item." };
  }
  return { prices, error: null };
}

export function verifyAppliedPrices(responseText, expectedRows, parser = new DOMParser()) {
  if (typeof responseText !== "string" || responseText.length === 0) {
    return { verified: false, mismatches: ["Verification response was empty."] };
  }
  const documentObject = parser.parseFromString(responseText, "text/html");
  const actualRows = extractShopRows(documentObject);
  const actualById = new Map(actualRows.map((row) => [row.id, row.currentPrice]));
  const mismatches = [];
  for (const row of expectedRows.filter((entry) => entry.include)) {
    const actualPrice = actualById.get(row.id);
    if (actualPrice !== row.proposedPrice) {
      mismatches.push(
        `${row.name}: expected ${row.proposedPrice}, found ${actualPrice ?? "missing"}`,
      );
    }
  }
  return { verified: mismatches.length === 0, mismatches };
}

export function verifyFreshShopState(responseText, plan, parser = new DOMParser()) {
  if (typeof responseText !== "string" || responseText.length === 0) {
    return { fresh: false, mismatches: ["The fresh shop response was empty."] };
  }
  const documentObject = parser.parseFromString(responseText, "text/html");
  const actualAccount = extractAccountContext(documentObject);
  const actualRows = extractShopRows(documentObject);
  const expectedRows = Array.isArray(plan?.rows) ? plan.rows : [];
  const mismatches = [];
  if (!actualAccount || actualAccount !== plan?.accountContext) {
    mismatches.push("The signed-in account no longer matches this review.");
  }
  if (actualRows.length !== expectedRows.length) {
    mismatches.push("Shop stock changed after the price scan.");
  }
  const actualById = new Map(actualRows.map((row) => [row.id, row]));
  for (const expected of expectedRows) {
    const actual = actualById.get(expected.id);
    if (
      !actual ||
      actual.name !== expected.name ||
      actual.objectIdField !== expected.objectIdField ||
      actual.priceField !== expected.priceField ||
      actual.currentPrice !== expected.currentPrice
    ) {
      mismatches.push(`${expected.name}: current shop state changed.`);
    }
  }
  return { fresh: mismatches.length === 0, mismatches };
}

export function extractPurchaseCandidates(documentObject, itemNameOverride = "") {
  const itemName = boundedString(
    itemNameOverride ||
      documentObject.querySelector("#shopwizard")?.value ||
      documentObject.querySelector("#shopWizardFormResults .wizard-results-header h3")?.textContent,
    100,
  );
  if (!itemName) return [];
  const candidates = [];
  const seenObjectIds = new Set();
  for (const row of documentObject.querySelectorAll(
    ".wizard-results-grid-shop li:not(.wizard-results-grid-header)",
  )) {
    const anchor = row.querySelector("a[href*='buy_obj_info_id']");
    if (!anchor) continue;
    let url;
    try {
      url = new URL(anchor.getAttribute("href"), "https://www.neopets.com");
    } catch {
      continue;
    }
    const visiblePrice = parseNeopointValue(
      row.querySelector(".wizard-results-price")?.textContent ?? "",
    );
    const candidate = sanitizePurchaseCandidate({
      itemName,
      owner: url.searchParams.get("owner"),
      objectId: url.searchParams.get("buy_obj_info_id"),
      price: url.searchParams.get("buy_cost_neopoints"),
      purchaseUrl: url.href,
    });
    if (!candidate || candidate.price !== visiblePrice || seenObjectIds.has(candidate.objectId)) {
      continue;
    }
    seenObjectIds.add(candidate.objectId);
    candidates.push(candidate);
  }
  return candidates.sort((left, right) => left.price - right.price);
}

export function verifyFreshPurchaseCandidate(
  responseText,
  expectedCandidate,
  parser = new DOMParser(),
) {
  if (typeof responseText !== "string" || responseText.length === 0) {
    return { fresh: false, error: "The fresh Shop Wizard response was empty." };
  }
  const documentObject = parser.parseFromString(responseText, "text/html");
  const expected = sanitizePurchaseCandidate(expectedCandidate);
  const match = extractPurchaseCandidates(documentObject, expected?.itemName).find(
    (candidate) =>
      expected &&
      candidate.itemName === expected.itemName &&
      candidate.owner === expected.owner &&
      candidate.objectId === expected.objectId &&
      candidate.price === expected.price &&
      candidate.purchaseUrl === expected.purchaseUrl,
  );
  return match
    ? { fresh: true, error: null }
    : { fresh: false, error: "The selected shop listing changed or is no longer available." };
}

export function verifyPurchaseResponse(responseText, expectedCandidate, parser = new DOMParser()) {
  if (typeof responseText !== "string" || responseText.length === 0) {
    return { verified: false, reason: "The purchase response was empty." };
  }
  const candidate = sanitizePurchaseCandidate(expectedCandidate);
  if (!candidate) return { verified: false, reason: "The expected purchase item is invalid." };
  const documentObject = parser.parseFromString(responseText, "text/html");
  const text = boundedString(
    documentObject.body?.textContent || documentObject.documentElement?.textContent || "",
    20_000,
  ).toLowerCase();
  const itemPresent = text.includes(candidate.itemName.toLowerCase());
  const failurePresent = [
    "item has been sold",
    "item is no longer available",
    "not enough neopoints",
    "cannot buy items from your own shop",
  ].some((phrase) => text.includes(phrase));
  const successPresent = [
    "purchase has been successful",
    "you have purchased",
    "added to your inventory",
  ].some((phrase) => text.includes(phrase));
  if (itemPresent && successPresent && !failurePresent) return { verified: true, reason: null };
  return {
    verified: false,
    reason: "Neopets did not return an unambiguous purchase-success confirmation.",
  };
}
