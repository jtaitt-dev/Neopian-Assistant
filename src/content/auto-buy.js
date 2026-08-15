import { MESSAGE_TYPES, PURCHASE_LIMITS, SHOP_LIMITS } from "../shared/constants.js";
import { element, icon, labeledControl, setStatus } from "../shared/dom.js";
import { createTextFingerprint } from "../shared/pricing-operations.js";
import { isShopWizardUrl, sanitizePurchaseWatchlist } from "../shared/validation.js";
import {
  extractPurchaseCandidates,
  parsePurchaseCandidates,
  verifyFreshPurchaseCandidate,
  verifyPurchaseResponse,
} from "./shop-parser.js";
import { fetchPurchaseHtml } from "./shop-client.js";
import { fetchWizardHtml } from "./wizard-client.js";

function formatPrice(value) {
  return `${value.toLocaleString()} NP`;
}

export class AutoBuyController {
  constructor({
    data,
    save,
    announce,
    wizardFetcher = fetchWizardHtml,
    purchaseFetcher = fetchPurchaseHtml,
  }) {
    this.data = data;
    this.save = save;
    this.announce = announce;
    this.wizardFetcher = wizardFetcher;
    this.purchaseFetcher = purchaseFetcher;
    this.status = null;
    this.dialog = null;
    this.monitoring = false;
    this.monitorRunId = null;
    this.monitorController = null;
    this.monitorResults = new Map();
    this.monitorResultsRoot = null;
    this.monitorStartButton = null;
    this.monitorStopButton = null;
  }

  get settings() {
    return this.data.settings.autoBuy;
  }

  async send(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) {
      throw new Error(response?.error || "The extension did not return a valid response.");
    }
    return response;
  }

  async saveSettings(message) {
    await this.save();
    this.announce(message, "success");
  }

  async recheckPurchaseCandidate({ candidate, operationId, reviewId }) {
    let lastFreshState = null;
    for (let attempt = 1; attempt <= PURCHASE_LIMITS.freshLookupAttempts; attempt += 1) {
      if (attempt > 1) {
        setStatus(
          this.status,
          `Checking Shop Wizard section ${attempt} of ${PURCHASE_LIMITS.freshLookupAttempts} for the exact listing…`,
          "running",
        );
        const authorization = await this.send({
          type: MESSAGE_TYPES.authorizePurchaseRecheck,
          operationId,
          reviewId,
          candidate,
        });
        if (
          authorization.itemName !== candidate.itemName ||
          authorization.freshLookupCount !== attempt
        ) {
          throw new Error("The Shop Wizard recheck authorization did not match this listing.");
        }
      }
      const freshWizardHtml = await this.wizardFetcher(candidate.itemName);
      lastFreshState = verifyFreshPurchaseCandidate(freshWizardHtml, candidate);
      if (lastFreshState.fresh) return freshWizardHtml;
      if (!lastFreshState.retryable) throw new Error(lastFreshState.error);
    }
    throw new Error(
      `${lastFreshState?.error || "The selected shop listing was not found."} All ${PURCHASE_LIMITS.freshLookupAttempts} Shop Wizard sections were checked safely.`,
    );
  }

  render(container) {
    this.stopMonitoring();
    container.replaceChildren();
    const onWizardPage = isShopWizardUrl(window.location.href);
    const candidate = onWizardPage ? (extractPurchaseCandidates(document)[0] ?? null) : null;

    const enabled = element("input", { type: "checkbox", checked: this.settings.enabled });
    enabled.addEventListener("change", async () => {
      this.settings.enabled = enabled.checked;
      await this.saveSettings("SW Autobuy settings saved.");
      this.render(container);
    });
    const dryRun = element("input", { type: "checkbox", checked: this.settings.dryRun });
    dryRun.addEventListener("change", async () => {
      this.settings.dryRun = dryRun.checked;
      await this.saveSettings("SW Autobuy settings saved.");
    });
    const maximumPrice = element("input", {
      type: "number",
      min: 1,
      max: PURCHASE_LIMITS.absoluteMaximumPrice,
      step: 1,
      inputMode: "numeric",
      value: this.settings.maximumPrice,
    });
    maximumPrice.addEventListener("change", async () => {
      this.settings.maximumPrice = Math.min(
        PURCHASE_LIMITS.absoluteMaximumPrice,
        Math.max(1, Number.parseInt(maximumPrice.value, 10) || 1),
      );
      maximumPrice.value = this.settings.maximumPrice;
      await this.saveSettings("SW Autobuy purchase limit saved.");
      this.render(container);
    });
    const requestInterval = element("input", {
      type: "number",
      min: SHOP_LIMITS.minLookupIntervalMs / 1000,
      max: SHOP_LIMITS.maxLookupIntervalMs / 1000,
      step: 1,
      inputMode: "numeric",
      value: Math.round(this.settings.requestIntervalMs / 1000),
    });
    requestInterval.addEventListener("change", async () => {
      const seconds = Math.min(
        SHOP_LIMITS.maxLookupIntervalMs / 1000,
        Math.max(
          SHOP_LIMITS.minLookupIntervalMs / 1000,
          Number.parseInt(requestInterval.value, 10) || SHOP_LIMITS.minLookupIntervalMs / 1000,
        ),
      );
      this.settings.requestIntervalMs = seconds * 1000;
      requestInterval.value = seconds;
      await this.saveSettings("SW Autobuy monitoring interval saved.");
      this.render(container);
    });
    const watchlist = element("textarea", {
      rows: 6,
      maxLength: SHOP_LIMITS.maxPurchaseWatchlistItems * (SHOP_LIMITS.maxItemNameLength + 1),
      value: this.settings.watchlist.join("\n"),
      placeholder: "One exact item name per line",
      ariaLabel: "SW Autobuy watchlist",
    });
    const saveWatchlist = element(
      "button",
      {
        className: "na-button na-button--secondary",
        type: "button",
        onClick: async () => {
          const entries = watchlist.value
            .split(/\r?\n/)
            .map((value) => value.trim())
            .filter(Boolean);
          if (entries.length > SHOP_LIMITS.maxPurchaseWatchlistItems) {
            setStatus(
              this.status,
              `Enter no more than ${SHOP_LIMITS.maxPurchaseWatchlistItems} item names. Nothing was saved.`,
              "error",
            );
            return;
          }
          if (entries.some((value) => Array.from(value).length > SHOP_LIMITS.maxItemNameLength)) {
            setStatus(
              this.status,
              `Each item name must be ${SHOP_LIMITS.maxItemNameLength} characters or fewer. Nothing was saved.`,
              "error",
            );
            return;
          }
          this.settings.watchlist = sanitizePurchaseWatchlist(entries);
          await this.saveSettings(
            `Saved ${this.settings.watchlist.length} SW Autobuy watchlist item${this.settings.watchlist.length === 1 ? "" : "s"}.`,
          );
          this.render(container);
        },
      },
      [icon("check"), "Save watchlist"],
    );

    const settingsPanel = element("section", { className: "na-pricing-settings" }, [
      element("div", { className: "na-setting-row" }, [
        element("div", {}, [
          element("strong", { text: "Enable SW Autobuy" }),
          element("span", {
            text: "Off by default. Monitors saved names and reviews one exact listing at a time.",
          }),
        ]),
        element("label", { className: "na-switch", ariaLabel: "Enable SW Autobuy" }, [
          enabled,
          element("span", { className: "na-switch__track" }),
        ]),
      ]),
      element("div", { className: "na-setting-row" }, [
        element("div", {}, [
          element("strong", { text: "Dry run" }),
          element("span", {
            text: "Review the safest listing without following its purchase URL.",
          }),
        ]),
        element("label", { className: "na-switch", ariaLabel: "Use SW Autobuy dry-run mode" }, [
          dryRun,
          element("span", { className: "na-switch__track" }),
        ]),
      ]),
      element("div", { className: "na-field-grid" }, [
        labeledControl(
          "Maximum purchase price (NP)",
          maximumPrice,
          "A hard per-item ceiling; quantity is always one.",
        ),
        labeledControl(
          "Seconds between lookups",
          requestInterval,
          "Sequential global pacing; minimum six seconds.",
        ),
      ]),
      element("div", { className: "na-watchlist-field" }, [
        element("label", { className: "na-field__label" }, [
          "Watchlist (one exact name per line)",
          watchlist,
          element("span", {
            className: "na-field__hint",
            text: `Up to ${SHOP_LIMITS.maxPurchaseWatchlistItems} names. Duplicates are removed.`,
          }),
        ]),
        saveWatchlist,
      ]),
    ]);

    const listingWithinLimit = candidate && candidate.price <= this.settings.maximumPrice;
    const requirement = element("div", { className: "na-notice" }, [
      icon("shield"),
      element("p", {
        text: !onWizardPage
          ? "Open the Shop Wizard page to monitor saved items and review a listing."
          : !candidate
            ? "No fully validated Shop Wizard listing was found on this page."
            : listingWithinLimit
              ? `Lowest validated listing: ${candidate.itemName} at ${formatPrice(candidate.price)}.`
              : `The lowest listing is ${formatPrice(candidate.price)}, above your ${formatPrice(this.settings.maximumPrice)} limit.`,
      }),
      !onWizardPage
        ? element(
            "a",
            {
              className: "na-button na-button--secondary",
              href: "https://www.neopets.com/shops/wizard.phtml",
            },
            [icon("external"), "Open Shop Wizard"],
          )
        : null,
    ]);

    const reviewButton = element(
      "button",
      {
        className: "na-button na-button--primary na-button--wide",
        type: "button",
        disabled: !this.settings.enabled || !listingWithinLimit,
        onClick: () => this.beginReview(candidate),
      },
      [icon("check"), this.settings.dryRun ? "Review dry run" : "Review one purchase"],
    );
    this.status = element("div", {
      className: "na-status",
      role: "status",
      ariaLive: "polite",
      text: this.settings.enabled
        ? "Ready. No purchase URL is followed until the review is confirmed."
        : "SW Autobuy is disabled.",
    });
    this.monitorStartButton = element(
      "button",
      {
        className: "na-button na-button--primary",
        type: "button",
        disabled: !this.settings.enabled || !onWizardPage || this.settings.watchlist.length === 0,
        onClick: () => this.startMonitoring(),
      },
      [icon("search"), "Start monitoring"],
    );
    this.monitorStopButton = element(
      "button",
      {
        className: "na-button na-button--secondary",
        type: "button",
        disabled: true,
        onClick: () => this.stopMonitoring({ announce: true }),
      },
      [icon("close"), "Stop"],
    );
    this.monitorResultsRoot = element("div", { className: "na-watchlist-results" });
    this.renderMonitorResults();
    container.append(
      element("div", { className: "na-section-heading" }, [
        element("div", {}, [
          element("h2", { text: "SW Autobuy" }),
          element("p", {
            text: "A live 10-item Shop Wizard watchlist with guarded one-item review, fresh checks, duplicate blocking, and no retries.",
          }),
        ]),
      ]),
      settingsPanel,
      element("div", { className: "na-notice na-notice--warning" }, [
        icon("info"),
        element("p", {
          text: "Real purchases spend Neopoints. The extension never buys in bulk and never retries an uncertain result.",
        }),
      ]),
      requirement,
      reviewButton,
      element("div", { className: "na-action-row" }, [
        this.monitorStartButton,
        this.monitorStopButton,
      ]),
      element("div", { className: "na-notice" }, [
        icon("shield"),
        element("p", {
          text: "Monitoring is read-only and runs only while this dashboard tab stays open. A match is never purchased until you review and authorize that exact listing.",
        }),
      ]),
      this.monitorResultsRoot,
      this.status,
    );
  }

  isMonitorActive(runId) {
    return this.monitoring && this.monitorRunId === runId;
  }

  syncMonitorControls() {
    if (this.monitorStartButton) this.monitorStartButton.disabled = this.monitoring;
    if (this.monitorStopButton) this.monitorStopButton.disabled = !this.monitoring;
  }

  renderMonitorResults() {
    if (!this.monitorResultsRoot) return;
    this.monitorResultsRoot.replaceChildren();
    const names = this.settings.watchlist;
    if (names.length === 0) {
      this.monitorResultsRoot.append(
        element("p", {
          className: "na-watchlist-empty",
          text: "Save item names to begin monitoring.",
        }),
      );
      return;
    }
    this.monitorResultsRoot.append(
      element("div", { className: "na-results-heading" }, [
        element("strong", { text: "Live watchlist" }),
        element("span", {
          text: this.monitoring
            ? `Monitoring ${names.length} item${names.length === 1 ? "" : "s"}`
            : `${names.length} saved`,
        }),
      ]),
    );
    for (const itemName of names) {
      const result = this.monitorResults.get(itemName) ?? { state: "queued" };
      let detail = "Waiting for the first check.";
      if (result.state === "checking") detail = "Checking Shop Wizard…";
      if (result.state === "not-found") detail = "No validated listing in the latest result.";
      if (result.state === "error") detail = result.error;
      if (result.state === "ready")
        detail = `${formatPrice(result.candidate.price)} · Ready to review.`;
      if (result.state === "above-limit") {
        detail = `${formatPrice(result.candidate.price)} · Above the ${formatPrice(this.settings.maximumPrice)} limit.`;
      }
      const review = element(
        "button",
        {
          className: "na-button na-button--secondary na-button--small",
          type: "button",
          disabled: result.state !== "ready",
          onClick: () => this.beginReview(result.candidate),
        },
        "Review",
      );
      this.monitorResultsRoot.append(
        element("div", { className: "na-watchlist-result" }, [
          element("div", {}, [
            element("strong", { text: itemName }),
            element("span", { text: detail }),
          ]),
          review,
        ]),
      );
    }
  }

  startMonitoring() {
    if (
      this.monitoring ||
      !this.settings.enabled ||
      !isShopWizardUrl(window.location.href) ||
      this.settings.watchlist.length === 0
    ) {
      return;
    }
    const runId = crypto.randomUUID();
    this.monitoring = true;
    this.monitorRunId = runId;
    this.monitorResults = new Map(
      this.settings.watchlist.map((itemName) => [itemName, { state: "queued" }]),
    );
    this.syncMonitorControls();
    this.renderMonitorResults();
    setStatus(
      this.status,
      `Monitoring ${this.settings.watchlist.length} saved item${this.settings.watchlist.length === 1 ? "" : "s"} sequentially.`,
      "running",
    );
    void this.runMonitor(runId);
  }

  async runMonitor(runId) {
    while (this.isMonitorActive(runId)) {
      for (const itemName of [...this.settings.watchlist]) {
        if (!this.isMonitorActive(runId)) return;
        let authorization;
        try {
          authorization = await this.send({
            type: MESSAGE_TYPES.authorizePurchaseLookup,
            runId,
            itemName,
          });
        } catch (error) {
          if (!this.isMonitorActive(runId)) return;
          this.monitorResults.set(itemName, { state: "error", error: error.message });
          this.renderMonitorResults();
          this.stopMonitoring();
          setStatus(
            this.status,
            `${error.message} Monitoring stopped without making a purchase.`,
            "error",
          );
          return;
        }
        if (!this.isMonitorActive(runId)) return;
        if (authorization.itemName !== itemName) {
          this.stopMonitoring();
          setStatus(
            this.status,
            "The authorized watchlist item did not match. Monitoring stopped safely.",
            "error",
          );
          return;
        }
        this.monitorResults.set(itemName, { state: "checking" });
        this.renderMonitorResults();
        const controller = new AbortController();
        this.monitorController = controller;
        try {
          const html = await fetchWizardHtml(itemName, { controller });
          if (!this.isMonitorActive(runId)) return;
          const candidate = parsePurchaseCandidates(html, itemName)[0] ?? null;
          this.monitorResults.set(
            itemName,
            !candidate
              ? { state: "not-found" }
              : candidate.price <= this.settings.maximumPrice
                ? { state: "ready", candidate }
                : { state: "above-limit", candidate },
          );
          this.renderMonitorResults();
        } catch (error) {
          if (!this.isMonitorActive(runId)) return;
          this.monitorResults.set(itemName, { state: "error", error: error.message });
          this.renderMonitorResults();
        } finally {
          if (this.monitorController === controller) this.monitorController = null;
        }
      }
      if (this.isMonitorActive(runId)) {
        setStatus(
          this.status,
          `Watchlist cycle complete. Continuing at one lookup every ${Math.round(this.settings.requestIntervalMs / 1000)} seconds.`,
          "success",
        );
      }
    }
  }

  stopMonitoring({ announce = false } = {}) {
    const runId = this.monitorRunId;
    this.monitoring = false;
    this.monitorRunId = null;
    this.monitorController?.abort("cancelled");
    this.monitorController = null;
    this.syncMonitorControls();
    this.renderMonitorResults();
    if (runId) {
      try {
        Promise.resolve(
          chrome.runtime.sendMessage({ type: MESSAGE_TYPES.cancelPurchaseMonitor, runId }),
        ).catch(() => undefined);
      } catch {
        // The extension may be reloading; local cancellation has already completed.
      }
    }
    if (announce && this.status) {
      setStatus(
        this.status,
        "SW Autobuy monitoring stopped. No purchase was attempted.",
        "success",
      );
    }
  }

  beginReview(candidate) {
    this.stopMonitoring({ announce: this.monitoring });
    this.openReviewDialog(candidate);
  }

  openReviewDialog(candidate) {
    if (!candidate || this.dialog) return;
    const operationId = crypto.randomUUID();
    const dialog = element("dialog", { className: "na-dialog" });
    this.dialog = dialog;
    const confirmation = element("input", { type: "checkbox" });
    const actionButton = element("button", {
      type: "button",
      className: "na-button na-button--primary",
      disabled: true,
      text: this.settings.dryRun ? "Finish dry run" : "Buy one item",
    });
    confirmation.addEventListener("change", () => {
      actionButton.disabled = !confirmation.checked;
    });
    let submitting = false;
    const close = ({ force = false } = {}) => {
      if (submitting && !force) return;
      dialog.close();
    };
    const closeButton = element(
      "button",
      { type: "button", className: "na-icon-button", ariaLabel: "Close", onClick: close },
      icon("close"),
    );
    const cancelButton = element(
      "button",
      { type: "button", className: "na-button na-button--secondary", onClick: close },
      "Cancel",
    );
    const setSubmitting = (value) => {
      submitting = value;
      confirmation.disabled = value;
      closeButton.disabled = value;
      cancelButton.disabled = value;
      actionButton.disabled = value || !confirmation.checked;
    };
    dialog.addEventListener("cancel", (event) => {
      if (submitting) event.preventDefault();
    });
    actionButton.addEventListener("click", async () => {
      actionButton.disabled = true;
      if (this.settings.dryRun) {
        setStatus(
          this.status,
          `Dry run complete for ${candidate.itemName} at ${formatPrice(candidate.price)}. No purchase URL was followed.`,
          "success",
        );
        close({ force: true });
        return;
      }
      setSubmitting(true);
      let executionStarted = false;
      let outcomeRecorded = false;
      let executionToken = null;
      try {
        setStatus(this.status, "Rechecking the exact listing before purchase…", "running");
        const review = await this.send({
          type: MESSAGE_TYPES.preparePurchase,
          operationId,
          candidate,
        });
        const freshWizardHtml = await this.recheckPurchaseCandidate({
          candidate,
          operationId,
          reviewId: review.reviewId,
        });
        const responseFingerprint = await createTextFingerprint(freshWizardHtml);
        await this.send({
          type: MESSAGE_TYPES.bindPurchaseReview,
          operationId,
          reviewId: review.reviewId,
          candidate,
          responseFingerprint,
          freshStateVerified: true,
        });
        const confirmed = await this.send({
          type: MESSAGE_TYPES.confirmPurchase,
          operationId,
          reviewId: review.reviewId,
          candidate,
          responseFingerprint,
          freshStateVerified: true,
        });
        setStatus(
          this.status,
          `Submitting one ${formatPrice(candidate.price)} purchase. No retry will occur…`,
          "running",
        );
        executionToken = confirmed.token;
        const execution = await this.send({
          type: MESSAGE_TYPES.purchaseItem,
          operationId,
          token: executionToken,
          candidate,
        });
        executionStarted = true;
        if (execution.purchaseUrl !== candidate.purchaseUrl) {
          throw new Error("The authorized purchase URL no longer matches this listing.");
        }
        const purchaseHtml = await this.purchaseFetcher(candidate);
        const verification = verifyPurchaseResponse(purchaseHtml, candidate);
        await this.send({
          type: MESSAGE_TYPES.recordPurchaseVerification,
          operationId,
          token: executionToken,
          verified: verification.verified,
        });
        outcomeRecorded = true;
        if (!verification.verified) {
          setStatus(
            this.status,
            `${verification.reason} Check inventory and do not retry this listing.`,
            "error",
          );
        } else {
          setStatus(
            this.status,
            `Verified purchase of one ${candidate.itemName} for ${formatPrice(candidate.price)}.`,
            "success",
          );
          this.announce("The one-item purchase was verified.", "success");
        }
        close({ force: true });
      } catch (error) {
        const uncertain = executionStarted && !outcomeRecorded && executionToken;
        if (uncertain) {
          await this.send({
            type: MESSAGE_TYPES.recordPurchaseVerification,
            operationId,
            token: executionToken,
            verified: false,
          }).catch(() => undefined);
          setStatus(
            this.status,
            "The purchase request may have reached Neopets, but its final state could not be verified. Check inventory and do not retry this listing.",
            "error",
          );
        } else {
          setStatus(this.status, `${error.message} No automatic retry was attempted.`, "error");
        }
        setSubmitting(false);
        if (uncertain) actionButton.disabled = true;
      }
    });

    dialog.append(
      element("form", { method: "dialog", className: "na-dialog__card" }, [
        element("div", { className: "na-dialog__header" }, [
          element("div", {}, [
            element("h2", { text: this.settings.dryRun ? "Review dry run" : "Confirm purchase" }),
            element("p", { text: "Quantity is fixed at one item." }),
          ]),
          closeButton,
        ]),
        element("dl", { className: "na-operation-summary" }, [
          element("div", {}, [
            element("dt", { text: "Item" }),
            element("dd", { text: candidate.itemName }),
          ]),
          element("div", {}, [
            element("dt", { text: "Price" }),
            element("dd", { text: formatPrice(candidate.price) }),
          ]),
          element("div", {}, [
            element("dt", { text: "Maximum" }),
            element("dd", { text: formatPrice(this.settings.maximumPrice) }),
          ]),
        ]),
        element("label", { className: "na-confirm-row" }, [
          confirmation,
          element("span", {
            text: this.settings.dryRun
              ? "I reviewed this listing and understand that no purchase will occur."
              : `I authorize one ${formatPrice(candidate.price)} purchase of this exact listing.`,
          }),
        ]),
        element("p", {
          className: "na-dialog__note",
          text: this.settings.dryRun
            ? "Dry run mode does not follow the purchase URL."
            : "The extension will recheck the listing, follow its exact URL once, and require an unambiguous success response.",
        }),
        element("div", { className: "na-dialog__actions" }, [cancelButton, actionButton]),
      ]),
    );
    document.body.append(dialog);
    dialog.addEventListener(
      "close",
      () => {
        this.dialog = null;
        dialog.remove();
      },
      { once: true },
    );
    dialog.showModal();
    confirmation.focus();
  }

  cleanup() {
    this.stopMonitoring();
    this.dialog?.close();
  }
}
