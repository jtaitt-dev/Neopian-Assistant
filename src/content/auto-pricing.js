import { BRAND, MESSAGE_TYPES, SHOP_LIMITS } from "../shared/constants.js";
import { element, icon, labeledControl, setStatus } from "../shared/dom.js";
import { calculateSuggestedPrice, isOwnShopStockUrl } from "../shared/validation.js";
import { createTextFingerprint } from "../shared/pricing-operations.js";
import {
  extractAccountContext,
  extractShopRows,
  parseWizardResponse,
  verifyAppliedPrices,
  verifyFreshShopState,
} from "./shop-parser.js";

function formatPrice(value) {
  return Number.isSafeInteger(value) ? `${value.toLocaleString()} NP` : "—";
}

function createNumberInput(value, minimum, maximum) {
  return element("input", {
    type: "number",
    value,
    min: minimum,
    max: maximum,
    step: 1,
    inputMode: "numeric",
  });
}

export class AutoPricingController {
  constructor({ data, save, announce }) {
    this.data = data;
    this.save = save;
    this.announce = announce;
    this.container = null;
    this.results = [];
    this.stockRows = [];
    this.running = false;
    this.cancelled = false;
    this.runId = null;
    this.status = null;
    this.progress = null;
    this.resultList = null;
    this.reviewButton = null;
  }

  get settings() {
    return this.data.settings.autoPricing;
  }

  async saveSettings() {
    await this.save();
    this.announce("Auto Pricing settings saved.", "success");
  }

  render(container) {
    this.container = container;
    container.replaceChildren();
    const heading = element("div", { className: "na-section-heading" }, [
      element("div", {}, [
        element("h2", { text: "Auto Pricing" }),
        element("p", {
          text: "Automatically checks Shop Wizard prices, prepares changes, and verifies every applied update.",
        }),
      ]),
    ]);

    const enabled = element("input", { type: "checkbox", checked: this.settings.enabled });
    enabled.addEventListener("change", async () => {
      this.settings.enabled = enabled.checked;
      await this.saveSettings();
      this.render(container);
    });

    const dryRun = element("input", { type: "checkbox", checked: this.settings.dryRun });
    dryRun.addEventListener("change", async () => {
      this.settings.dryRun = dryRun.checked;
      await this.saveSettings();
    });

    const rule = element("select", { value: this.settings.rule }, [
      element("option", { value: "undercut", text: "Undercut lowest" }),
      element("option", { value: "match", text: "Match lowest" }),
      element("option", { value: "overcut", text: "Price above lowest" }),
    ]);
    rule.value = this.settings.rule;
    rule.addEventListener("change", async () => {
      this.settings.rule = rule.value;
      await this.saveSettings();
      this.recalculateResults();
    });

    const amount = createNumberInput(this.settings.amount, 0, SHOP_LIMITS.maxPrice);
    const floor = createNumberInput(this.settings.floor, 1, SHOP_LIMITS.maxPrice);
    const maxItems = createNumberInput(this.settings.maxItems, 1, SHOP_LIMITS.maxItemsPerRun);
    const requestInterval = createNumberInput(
      Math.round(this.settings.requestIntervalMs / 1000),
      Math.ceil(SHOP_LIMITS.minLookupIntervalMs / 1000),
      Math.floor(SHOP_LIMITS.maxLookupIntervalMs / 1000),
    );

    const saveNumbers = async () => {
      this.settings.amount = Math.min(
        SHOP_LIMITS.maxPrice,
        Math.max(0, Number.parseInt(amount.value, 10) || 0),
      );
      this.settings.floor = Math.min(
        SHOP_LIMITS.maxPrice,
        Math.max(1, Number.parseInt(floor.value, 10) || 1),
      );
      this.settings.maxItems = Math.min(
        SHOP_LIMITS.maxItemsPerRun,
        Math.max(1, Number.parseInt(maxItems.value, 10) || 1),
      );
      this.settings.requestIntervalMs = Math.min(
        SHOP_LIMITS.maxLookupIntervalMs,
        Math.max(
          SHOP_LIMITS.minLookupIntervalMs,
          (Number.parseInt(requestInterval.value, 10) || 6) * 1000,
        ),
      );
      amount.value = this.settings.amount;
      floor.value = this.settings.floor;
      maxItems.value = this.settings.maxItems;
      requestInterval.value = Math.round(this.settings.requestIntervalMs / 1000);
      await this.saveSettings();
      this.recalculateResults();
    };
    for (const control of [amount, floor, maxItems, requestInterval]) {
      control.addEventListener("change", saveNumbers);
    }

    const settingsPanel = element("section", { className: "na-pricing-settings" }, [
      element("div", { className: "na-setting-row" }, [
        element("div", {}, [
          element("strong", { text: "Enable Auto Pricing" }),
          element("span", {
            text: "Off by default. Runs only after you start it on your own shop stock page.",
          }),
        ]),
        element("label", { className: "na-switch", ariaLabel: "Enable Auto Pricing" }, [
          enabled,
          element("span", { className: "na-switch__track" }),
        ]),
      ]),
      element("div", { className: "na-setting-row" }, [
        element("div", {}, [
          element("strong", { text: "Dry run" }),
          element("span", { text: "Scans and reviews prices without applying changes." }),
        ]),
        element("label", { className: "na-switch", ariaLabel: "Use dry-run mode" }, [
          dryRun,
          element("span", { className: "na-switch__track" }),
        ]),
      ]),
      element("div", { className: "na-field-grid" }, [
        labeledControl("Pricing rule", rule),
        labeledControl("Adjustment (NP)", amount),
        labeledControl("Price floor (NP)", floor),
        labeledControl("Maximum changed items", maxItems, `1–${SHOP_LIMITS.maxItemsPerRun}`),
        labeledControl(
          "Seconds between lookups",
          requestInterval,
          `${SHOP_LIMITS.minLookupIntervalMs / 1000}–${SHOP_LIMITS.maxLookupIntervalMs / 1000}`,
        ),
      ]),
    ]);

    const policy = element("div", { className: "na-notice na-notice--warning" }, [
      icon("info"),
      element("p", {
        text: "Project-specific approval is recorded by the repository owner. Keep request rates conservative, review every change, and use this feature only within that approval.",
      }),
    ]);

    const onShopPage = isOwnShopStockUrl(window.location.href);
    const requirement = element("div", { className: "na-notice" }, [
      icon("shield"),
      element("p", {
        text: onShopPage
          ? "Shop stock page detected. The extension will abort if the current account cannot be identified."
          : "Open your own shop stock page before starting Auto Pricing.",
      }),
      !onShopPage
        ? element(
            "a",
            {
              className: "na-button na-button--secondary",
              href: "https://www.neopets.com/market.phtml?type=your",
            },
            [icon("external"), "Open shop stock"],
          )
        : null,
    ]);

    const startButton = element(
      "button",
      {
        className: "na-button na-button--primary",
        type: "button",
        disabled: !this.settings.enabled || !onShopPage,
        onClick: () => this.startScan(),
      },
      [icon("search"), "Start price scan"],
    );
    const cancelButton = element(
      "button",
      {
        className: "na-button na-button--secondary",
        type: "button",
        hidden: true,
        onClick: () => this.cancelScan(),
      },
      [icon("close"), "Cancel"],
    );
    this.progress = element("progress", {
      className: "na-progress",
      value: 0,
      max: 1,
      hidden: true,
    });
    this.status = element("div", {
      className: "na-status",
      role: "status",
      ariaLive: "polite",
      text: this.settings.enabled
        ? "Ready. No requests run until you press Start price scan."
        : "Auto Pricing is disabled.",
    });
    this.resultList = element("div", { className: "na-pricing-results" });
    this.reviewButton = element(
      "button",
      {
        className: "na-button na-button--primary na-button--wide",
        type: "button",
        hidden: true,
        onClick: () => this.reviewChanges(),
      },
      [icon("check"), "Review price changes"],
    );

    const actions = element("div", { className: "na-action-row" }, [startButton, cancelButton]);
    this.startButton = startButton;
    this.cancelButton = cancelButton;
    container.append(
      heading,
      settingsPanel,
      policy,
      requirement,
      actions,
      this.progress,
      this.status,
      this.resultList,
      this.reviewButton,
    );
  }

  async send(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok)
      throw new Error(response?.error || "The extension did not return a valid response.");
    return response;
  }

  async startScan() {
    if (this.running) return;
    if (!isOwnShopStockUrl(window.location.href)) {
      setStatus(this.status, "Auto Pricing can only run on your own shop stock page.", "error");
      return;
    }
    const accountContext = extractAccountContext(document);
    if (!accountContext) {
      setStatus(
        this.status,
        "The current Neopets account could not be identified. No requests were made.",
        "error",
      );
      return;
    }
    this.stockRows = extractShopRows(document);
    if (this.stockRows.length === 0) {
      setStatus(this.status, "No valid shop stock rows were found on this page.", "error");
      return;
    }

    await this.save();
    this.running = true;
    this.cancelled = false;
    this.runId = crypto.randomUUID();
    this.results = [];
    this.resultList.replaceChildren();
    this.reviewButton.hidden = true;
    this.startButton.disabled = true;
    this.cancelButton.hidden = false;
    this.progress.hidden = false;

    const candidates = this.stockRows.slice(0, this.settings.maxItems);
    this.progress.max = candidates.length;
    this.progress.value = 0;
    for (let index = 0; index < candidates.length; index += 1) {
      if (this.cancelled) break;
      const row = candidates[index];
      setStatus(
        this.status,
        `Checking ${index + 1} of ${candidates.length}: ${row.name}`,
        "running",
      );
      try {
        const response = await this.send({
          type: MESSAGE_TYPES.lookupPrice,
          runId: this.runId,
          item: { id: row.id, name: row.name },
        });
        const parsed = parseWizardResponse(response.responseText);
        const lowestPrice = parsed.prices[0] ?? null;
        this.results.push({
          ...row,
          lowestPrice,
          proposedPrice: calculateSuggestedPrice(lowestPrice, this.settings),
          include: parsed.error === null,
          error: parsed.error,
        });
      } catch (error) {
        if (this.cancelled) break;
        this.results.push({
          ...row,
          lowestPrice: null,
          proposedPrice: row.currentPrice,
          include: false,
          error: error.message,
        });
      }
      this.progress.value = index + 1;
      this.renderResults();
    }

    this.running = false;
    this.startButton.disabled = false;
    this.cancelButton.hidden = true;
    if (this.cancelled) {
      setStatus(this.status, "Price scan cancelled. No prices were applied.", "warning");
      return;
    }
    const validChanges = this.getChangedResults();
    if (validChanges.length === 0) {
      setStatus(
        this.status,
        "Scan finished, but no valid price changes are ready to review.",
        "warning",
      );
      return;
    }
    this.reviewButton.hidden = false;
    this.reviewButton.lastChild.textContent = `Review ${validChanges.length} price change${validChanges.length === 1 ? "" : "s"}`;
    setStatus(
      this.status,
      `Scan finished. ${validChanges.length} validated change${validChanges.length === 1 ? " is" : "s are"} ready for review.`,
      "success",
    );
  }

  async cancelScan() {
    if (!this.running || !this.runId) return;
    this.cancelled = true;
    this.cancelButton.disabled = true;
    try {
      await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.cancelPriceRun, runId: this.runId });
    } finally {
      this.cancelButton.disabled = false;
    }
  }

  recalculateResults() {
    for (const result of this.results) {
      result.proposedPrice = calculateSuggestedPrice(result.lowestPrice, this.settings);
      if (result.proposedPrice === null) result.include = false;
    }
    this.renderResults();
  }

  getChangedResults() {
    return this.results.filter(
      (result) =>
        result.include &&
        Number.isSafeInteger(result.proposedPrice) &&
        result.proposedPrice !== result.currentPrice,
    );
  }

  renderResults() {
    this.resultList.replaceChildren();
    if (this.results.length === 0) return;
    const heading = element("div", { className: "na-results-heading" }, [
      element("h3", { text: `Scan results (${this.results.length})` }),
      element("span", { text: `${this.getChangedResults().length} selected changes` }),
    ]);
    const table = element("table", { className: "na-price-table" });
    const headRow = element("tr", {}, [
      element("th", { scope: "col", text: "Item" }),
      element("th", { scope: "col", text: "Current" }),
      element("th", { scope: "col", text: "Lowest" }),
      element("th", { scope: "col", text: "Suggested" }),
      element("th", { scope: "col", text: "Include" }),
    ]);
    table.append(element("thead", {}, headRow));
    const body = element("tbody");
    this.results.forEach((result, index) => {
      const checkbox = element("input", {
        type: "checkbox",
        checked: result.include,
        disabled: result.proposedPrice === null,
        ariaLabel: `Include ${result.name}`,
      });
      checkbox.addEventListener("change", () => {
        this.results[index].include = checkbox.checked;
        this.renderResults();
      });
      const itemCell = element("td", {}, [
        element("strong", { text: result.name }),
        result.error ? element("small", { className: "na-error-text", text: result.error }) : null,
      ]);
      body.append(
        element("tr", { className: result.error ? "na-row-error" : "" }, [
          itemCell,
          element("td", { text: formatPrice(result.currentPrice) }),
          element("td", { text: formatPrice(result.lowestPrice) }),
          element("td", { text: formatPrice(result.proposedPrice) }),
          element("td", {}, checkbox),
        ]),
      );
    });
    table.append(body);
    this.resultList.append(heading, element("div", { className: "na-table-scroll" }, table));
  }

  buildPlan() {
    const byId = new Map(this.results.map((result) => [result.id, result]));
    return {
      accountContext: extractAccountContext(document),
      rows: this.stockRows.map((row) => {
        const result = byId.get(row.id);
        return {
          ...row,
          proposedPrice: result?.proposedPrice ?? row.currentPrice,
          include:
            result?.include === true &&
            Number.isSafeInteger(result?.proposedPrice) &&
            result.proposedPrice !== row.currentPrice,
        };
      }),
    };
  }

  async reviewChanges() {
    if (this.running) return;
    const plan = this.buildPlan();
    const changedRows = plan.rows.filter((row) => row.include);
    if (!plan.accountContext || changedRows.length === 0) {
      setStatus(this.status, "The account or selected changes are no longer valid.", "error");
      return;
    }
    const operationId = crypto.randomUUID();
    this.openReviewDialog({ plan, changedRows, operationId });
  }

  openReviewDialog({ plan, changedRows, operationId }) {
    const dialog = element("dialog", { className: "na-dialog" });
    const confirmation = element("input", { type: "checkbox" });
    const applyButton = element(
      "button",
      {
        type: "button",
        className: "na-button na-button--primary",
        disabled: true,
      },
      this.settings.dryRun ? "Finish dry run" : "Apply and verify prices",
    );
    confirmation.addEventListener("change", () => {
      applyButton.disabled = !confirmation.checked;
    });
    const minimum = Math.min(...changedRows.map((row) => row.proposedPrice));
    const maximum = Math.max(...changedRows.map((row) => row.proposedPrice));
    const list = element(
      "ul",
      { className: "na-review-list" },
      changedRows.map((row) =>
        element("li", {}, [
          element("span", { text: row.name }),
          element("strong", {
            text: `${formatPrice(row.currentPrice)} → ${formatPrice(row.proposedPrice)}`,
          }),
        ]),
      ),
    );
    const close = () => dialog.close();
    applyButton.addEventListener("click", async () => {
      applyButton.disabled = true;
      if (this.settings.dryRun) {
        setStatus(
          this.status,
          `Dry run complete for ${changedRows.length} changes. No prices were submitted.`,
          "success",
        );
        close();
        return;
      }
      try {
        setStatus(this.status, "Rechecking fresh shop stock before submission…", "running");
        const review = await this.send({
          type: MESSAGE_TYPES.preparePriceApply,
          operationId,
          plan,
        });
        const freshState = verifyFreshShopState(review.freshShopHtml, plan);
        if (!freshState.fresh) {
          throw new Error(
            "Shop stock changed after the scan. Reload the stock page and start a new price scan.",
          );
        }
        const confirmation = await this.send({
          type: MESSAGE_TYPES.confirmPriceApply,
          operationId,
          reviewId: review.reviewId,
          plan,
          responseFingerprint: await createTextFingerprint(review.freshShopHtml),
          freshStateVerified: true,
        });
        setStatus(
          this.status,
          "Applying the confirmed prices. No automatic retry will occur…",
          "running",
        );
        const response = await this.send({
          type: MESSAGE_TYPES.applyPrices,
          operationId,
          token: confirmation.token,
          plan,
        });
        const verification = verifyAppliedPrices(response.verificationHtml, plan.rows);
        await this.send({
          type: MESSAGE_TYPES.recordVerification,
          operationId,
          token: confirmation.token,
          verified: verification.verified,
        });
        if (!verification.verified) {
          setStatus(
            this.status,
            `Price submission returned, but verification failed for ${verification.mismatches.length} item${verification.mismatches.length === 1 ? "" : "s"}. Reload your shop stock before retrying manually.`,
            "error",
          );
        } else {
          setStatus(
            this.status,
            `Verified ${changedRows.length} shop price change${changedRows.length === 1 ? "" : "s"}.`,
            "success",
          );
          this.announce("Shop prices were applied and verified.", "success");
        }
        close();
      } catch (error) {
        setStatus(this.status, `${error.message} No automatic retry was attempted.`, "error");
        applyButton.disabled = false;
      }
    });

    dialog.append(
      element("form", { method: "dialog", className: "na-dialog__card" }, [
        element("div", { className: "na-dialog__header" }, [
          element("div", {}, [
            element("h2", {
              text: this.settings.dryRun ? "Review dry run" : "Confirm price changes",
            }),
            element("p", { text: `Account: ${plan.accountContext}` }),
          ]),
          element(
            "button",
            { type: "button", className: "na-icon-button", ariaLabel: "Close", onClick: close },
            icon("close"),
          ),
        ]),
        element("dl", { className: "na-operation-summary" }, [
          element("div", {}, [
            element("dt", { text: "Operation ID" }),
            element("dd", { text: operationId }),
          ]),
          element("div", {}, [
            element("dt", { text: "Items" }),
            element("dd", { text: changedRows.length }),
          ]),
          element("div", {}, [
            element("dt", { text: "New price range" }),
            element("dd", { text: `${formatPrice(minimum)} – ${formatPrice(maximum)}` }),
          ]),
        ]),
        list,
        element("label", { className: "na-confirm-row" }, [
          confirmation,
          element("span", {
            text: this.settings.dryRun
              ? "I reviewed these suggestions and understand that no prices will change."
              : "I reviewed every selected item and authorize this one price update.",
          }),
        ]),
        element("p", {
          className: "na-dialog__note",
          text: this.settings.dryRun
            ? "Dry run mode will not submit a shop update."
            : "The extension will submit once, fetch your shop stock again, and report success only after exact verification.",
        }),
        element("div", { className: "na-dialog__actions" }, [
          element(
            "button",
            { type: "button", className: "na-button na-button--secondary", onClick: close },
            "Cancel",
          ),
          applyButton,
        ]),
      ]),
    );
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
    confirmation.focus();
  }

  cleanup() {
    if (this.running) void this.cancelScan();
  }
}

export function createPricingDisclaimer() {
  return element("p", { className: "na-disclaimer", text: BRAND.disclaimer });
}
