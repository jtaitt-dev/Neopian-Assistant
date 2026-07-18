import {
  boundedString,
  parseNeopointValue,
  sanitizeAccountContext,
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
