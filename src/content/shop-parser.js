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
    const firstCell = row.querySelector("td:first-child");
    const name =
      boundedString(firstCell?.querySelector("img[alt]")?.getAttribute("alt"), 100) ||
      boundedString(firstCell?.querySelector("b, strong")?.textContent, 100);
    const candidate = sanitizeShopRow({
      id: objectIdInput.value,
      name,
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

function collectWizardHtmlFragments(value, fragments, depth = 0) {
  if (depth > 5 || fragments.length >= 50) return;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.includes("<") && trimmed.includes(">")) fragments.push(value);
    if (
      (trimmed.startsWith("{") ||
        trimmed.startsWith("[") ||
        (trimmed.startsWith('"') && trimmed.endsWith('"'))) &&
      trimmed.length <= 2_000_000
    ) {
      try {
        const nested = JSON.parse(trimmed);
        if (nested !== value) collectWizardHtmlFragments(nested, fragments, depth + 1);
      } catch {}
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectWizardHtmlFragments(entry, fragments, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      collectWizardHtmlFragments(entry, fragments, depth + 1);
    }
  }
}

function readDocumentText(documentObject) {
  try {
    return documentObject.body?.textContent || documentObject.documentElement?.textContent || "";
  } catch {
    return "";
  }
}

export function parseWizardResponse(responseText, parser = new DOMParser()) {
  if (typeof responseText !== "string" || responseText.length === 0) {
    return { prices: [], error: "The Shop Wizard returned an empty response." };
  }
  const fragments = [responseText];
  try {
    collectWizardHtmlFragments(JSON.parse(responseText.trim()), fragments);
  } catch {}
  const documents = [...new Set(fragments)].map((fragment) =>
    parser.parseFromString(fragment, "text/html"),
  );
  const prices = [
    ...new Set(documents.flatMap((documentObject) => parseWizardPrices(documentObject))),
  ].sort((left, right) => left - right);
  if (prices.length === 0) {
    const text = boundedString(
      [responseText, ...documents.map((documentObject) => readDocumentText(documentObject))].join(
        " ",
      ),
      1000,
    ).toLowerCase();
    if (text.includes("too many searches") || text.includes("please wait")) {
      return { prices: [], error: "The Shop Wizard asked you to wait before searching again." };
    }
    return { prices: [], error: "No valid Shop Wizard prices were found for this item." };
  }
  return { prices, error: null };
}

function matchShopRow(actualRows, expected, expectedPrice, claimedIds) {
  const exact = actualRows.find((row) => row.id === expected.id && !claimedIds.has(row.id));
  if (exact) return { row: exact, ambiguous: false };
  const sameName = actualRows.filter(
    (row) => row.name === expected.name && !claimedIds.has(row.id),
  );
  if (sameName.length === 1) return { row: sameName[0], ambiguous: false };
  if (sameName.length > 1) {
    const sameState = sameName.filter((row) => row.currentPrice === expectedPrice);
    if (sameState.length === 1) return { row: sameState[0], ambiguous: false };
    return { row: null, ambiguous: true };
  }
  return { row: null, ambiguous: false };
}

export function verifyAppliedPrices(responseText, expectedRows, parser = new DOMParser()) {
  if (typeof responseText !== "string" || responseText.length === 0) {
    return { verified: false, mismatches: ["Verification response was empty."] };
  }
  const documentObject = parser.parseFromString(responseText, "text/html");
  const actualRows = extractShopRows(documentObject);
  const mismatches = [];
  const claimedIds = new Set();
  for (const row of expectedRows.filter((entry) => entry.include)) {
    const match = matchShopRow(actualRows, row, row.proposedPrice, claimedIds);
    const actual = match.row;
    if (
      !actual ||
      actual.name !== row.name ||
      actual.currentPrice !== row.proposedPrice ||
      claimedIds.has(actual.id)
    ) {
      mismatches.push(
        `${row.name}: expected ${row.proposedPrice}, found ${actual?.currentPrice ?? "missing"}`,
      );
      continue;
    }
    claimedIds.add(actual.id);
  }
  return { verified: mismatches.length === 0, mismatches };
}

export function verifyFreshShopState(responseText, plan, parser = new DOMParser()) {
  if (typeof responseText !== "string" || responseText.length === 0) {
    return {
      fresh: false,
      mismatches: ["The fresh shop response was empty."],
      mismatchCodes: ["empty response"],
      plan: null,
      reboundCount: 0,
    };
  }
  const documentObject = parser.parseFromString(responseText, "text/html");
  const actualAccount = extractAccountContext(documentObject);
  const actualRows = extractShopRows(documentObject);
  const expectedRows = Array.isArray(plan?.rows)
    ? plan.rows.filter((row) => row.include === true)
    : [];
  const mismatches = [];
  const mismatchCodes = new Set();
  const reboundRows = [];
  const claimedIds = new Set();
  let reboundCount = 0;
  if (!actualAccount || actualAccount !== plan?.accountContext) {
    mismatches.push("The signed-in account no longer matches this review.");
    mismatchCodes.add("account");
  }
  for (const expected of expectedRows) {
    const match = matchShopRow(actualRows, expected, expected.currentPrice, claimedIds);
    const actual = match.row;
    if (!actual) {
      mismatchCodes.add(match.ambiguous ? "selected item ambiguous" : "selected item missing");
      mismatches.push(
        `${expected.name}: current shop state ${match.ambiguous ? "is ambiguous" : "changed"}.`,
      );
      continue;
    }
    if (actual.name !== expected.name) mismatchCodes.add("item name");
    if (actual.currentPrice !== expected.currentPrice) mismatchCodes.add("current price");
    if (actual.name !== expected.name || actual.currentPrice !== expected.currentPrice) {
      mismatches.push(`${expected.name}: current shop state changed.`);
      continue;
    }
    if (
      actual.id !== expected.id ||
      actual.objectIdField !== expected.objectIdField ||
      actual.priceField !== expected.priceField
    ) {
      reboundCount += 1;
    }
    claimedIds.add(actual.id);
    reboundRows.push({
      ...expected,
      id: actual.id,
      objectIdField: actual.objectIdField,
      priceField: actual.priceField,
    });
  }
  const fresh = mismatches.length === 0 && reboundRows.length === expectedRows.length;
  return {
    fresh,
    mismatches,
    mismatchCodes: [...mismatchCodes],
    plan: fresh ? { accountContext: plan.accountContext, rows: reboundRows } : null,
    reboundCount,
  };
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

export function parsePurchaseCandidates(responseText, itemName, parser = new DOMParser()) {
  const boundedItemName = boundedString(itemName, 100);
  if (typeof responseText !== "string" || responseText.length === 0 || !boundedItemName) return [];
  const fragments = [responseText];
  try {
    collectWizardHtmlFragments(JSON.parse(responseText.trim()), fragments);
  } catch {}
  const candidates = [...new Set(fragments)].flatMap((fragment) =>
    extractPurchaseCandidates(parser.parseFromString(fragment, "text/html"), boundedItemName),
  );
  return [
    ...new Map(candidates.map((candidate) => [candidate.purchaseUrl, candidate])).values(),
  ].sort((left, right) => left.price - right.price);
}

export function verifyFreshPurchaseCandidate(
  responseText,
  expectedCandidate,
  parser = new DOMParser(),
) {
  if (typeof responseText !== "string" || responseText.length === 0) {
    return { fresh: false, error: "The fresh Shop Wizard response was empty." };
  }
  const expected = sanitizePurchaseCandidate(expectedCandidate);
  const match = parsePurchaseCandidates(responseText, expected?.itemName, parser).find(
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
