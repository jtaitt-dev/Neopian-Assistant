import { MAIN_SHOP_LIMITS, MESSAGE_TYPES, SHOP_LIMITS } from "../shared/constants.js";
import { element, icon, labeledControl, setStatus } from "../shared/dom.js";
import { createTextFingerprint } from "../shared/pricing-operations.js";
import { isKauvaraMagicShopUrl, sanitizeMainShopWatchlist } from "../shared/validation.js";
import { fetchMagicShopHtml } from "./main-shop-client.js";
import {
  extractMainShopCandidates,
  getMagicShopUrl,
  parseMainShopCandidates,
  verifyFreshMainShopCandidate,
} from "./main-shop-parser.js";

function formatPrice(value) {
  return `${value.toLocaleString()} NP`;
}

function normalizeName(value) {
  return value.toLocaleLowerCase("en-US");
}

export class MainShopAutoBuyController {
  constructor({
    data,
    save,
    announce,
    shopFetcher = fetchMagicShopHtml,
    purchaseLauncher = () => globalThis.location.reload(),
  }) {
    this.data = data;
    this.save = save;
    this.announce = announce;
    this.shopFetcher = shopFetcher;
    this.purchaseLauncher = purchaseLauncher;
    this.status = null;
    this.dialog = null;
    this.monitoring = false;
    this.monitorRunId = null;
    this.monitorController = null;
    this.monitorResults = new Map();
    this.monitorResultsRoot = null;
    this.monitorStartButton = null;
    this.monitorStopButton = null;
    this.purchaseArming = false;
  }

  get settings() {
    return this.data.settings.mainShopBuy;
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

  render(container) {
    this.stopMonitoring();
    container.replaceChildren();
    const onMagicShopPage = isKauvaraMagicShopUrl(window.location.href);

    const enabled = element("input", { type: "checkbox", checked: this.settings.enabled });
    enabled.addEventListener("change", async () => {
      this.settings.enabled = enabled.checked;
      await this.saveSettings("MS Autobuy settings saved.");
      this.render(container);
    });
    const dryRun = element("input", { type: "checkbox", checked: this.settings.dryRun });
    dryRun.addEventListener("change", async () => {
      this.settings.dryRun = dryRun.checked;
      await this.saveSettings("MS Autobuy settings saved.");
      this.render(container);
    });
    const requestInterval = element("input", {
      type: "number",
      min: MAIN_SHOP_LIMITS.minLookupIntervalMs / 1000,
      max: MAIN_SHOP_LIMITS.maxLookupIntervalMs / 1000,
      step: 1,
      inputMode: "numeric",
      value: Math.round(this.settings.requestIntervalMs / 1000),
    });
    requestInterval.addEventListener("change", async () => {
      const seconds = Math.min(
        MAIN_SHOP_LIMITS.maxLookupIntervalMs / 1000,
        Math.max(
          MAIN_SHOP_LIMITS.minLookupIntervalMs / 1000,
          Number.parseInt(requestInterval.value, 10) || MAIN_SHOP_LIMITS.minLookupIntervalMs / 1000,
        ),
      );
      this.settings.requestIntervalMs = seconds * 1000;
      requestInterval.value = seconds;
      await this.saveSettings("MS Autobuy monitoring interval saved.");
      this.render(container);
    });
    const watchlist = element("textarea", {
      rows: 6,
      maxLength: MAIN_SHOP_LIMITS.maxWatchlistItems * (SHOP_LIMITS.maxItemNameLength + 1),
      value: this.settings.watchlist.join("\n"),
      placeholder: "One exact Kauvara item name per line",
      ariaLabel: "MS Autobuy watchlist",
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
          if (entries.length > MAIN_SHOP_LIMITS.maxWatchlistItems) {
            setStatus(
              this.status,
              `Enter no more than ${MAIN_SHOP_LIMITS.maxWatchlistItems} item names. Nothing was saved.`,
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
          this.settings.watchlist = sanitizeMainShopWatchlist(entries);
          await this.saveSettings(
            `Saved ${this.settings.watchlist.length} MS Autobuy watchlist item${this.settings.watchlist.length === 1 ? "" : "s"}.`,
          );
          this.render(container);
        },
      },
      [icon("check"), "Save watchlist"],
    );

    const settingsPanel = element("section", { className: "na-pricing-settings" }, [
      element("div", { className: "na-setting-row" }, [
        element("div", {}, [
          element("strong", { text: "Enable MS Autobuy" }),
          element("span", {
            text: "Off by default. Watches only Kauvara's Magic Shop and arms one exact listed-price purchase.",
          }),
        ]),
        element("label", { className: "na-switch", ariaLabel: "Enable MS Autobuy" }, [
          enabled,
          element("span", { className: "na-switch__track" }),
        ]),
      ]),
      element("div", { className: "na-setting-row" }, [
        element("div", {}, [
          element("strong", { text: "Dry run" }),
          element("span", {
            text: "Detect and review a live match without opening the official purchase flow.",
          }),
        ]),
        element("label", { className: "na-switch", ariaLabel: "Use MS Autobuy dry-run mode" }, [
          dryRun,
          element("span", { className: "na-switch__track" }),
        ]),
      ]),
      element("div", { className: "na-field-grid" }, [
        labeledControl(
          "Seconds between stock checks",
          requestInterval,
          "One authenticated page read at a time; minimum eight seconds.",
        ),
      ]),
      element("div", { className: "na-watchlist-field" }, [
        element("label", { className: "na-field__label" }, [
          "Kauvara watchlist (one exact name per line)",
          watchlist,
          element("span", {
            className: "na-field__hint",
            text: `Up to ${MAIN_SHOP_LIMITS.maxWatchlistItems} names. Duplicates are removed.`,
          }),
        ]),
        saveWatchlist,
      ]),
    ]);

    this.status = element("div", {
      className: "na-status",
      role: "status",
      ariaLive: "polite",
      text: this.settings.enabled
        ? "Ready. A match must pass a fresh stock check before one purchase can be armed."
        : "MS Autobuy is disabled.",
    });
    this.monitorStartButton = element(
      "button",
      {
        className: "na-button na-button--primary",
        type: "button",
        disabled:
          !this.settings.enabled || !onMagicShopPage || this.settings.watchlist.length === 0,
        onClick: () => this.startMonitoring(),
      },
      [
        icon("search"),
        this.settings.dryRun ? "Start dry-run monitoring" : "Start automatic buying",
      ],
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
    this.applyCandidates(onMagicShopPage ? extractMainShopCandidates(document) : []);

    container.append(
      element("div", { className: "na-section-heading" }, [
        element("div", {}, [
          element("h2", { text: "MS Autobuy" }),
          element("p", {
            text: "A live 100-item Kauvara watchlist with exact-name matching, fresh-stock binding, and one exact listed-price purchase per run.",
          }),
        ]),
      ]),
      settingsPanel,
      element("div", { className: "na-notice na-notice--warning" }, [
        icon("info"),
        element("p", {
          text: "Live mode accepts any valid listed price. When a match appears, complete Neopets' confirmation checkbox yourself; Neopian Assistant then submits that exact listed price once and verifies the result. It does not solve or bypass verification.",
        }),
      ]),
      ...(!onMagicShopPage
        ? [
            element("div", { className: "na-notice" }, [
              icon("shield"),
              element("p", { text: "Open Kauvara's Magic Shop to monitor its live stock." }),
              element(
                "a",
                { className: "na-button na-button--secondary", href: getMagicShopUrl() },
                [icon("external"), "Open Kauvara"],
              ),
            ]),
          ]
        : []),
      element("div", { className: "na-action-row" }, [
        this.monitorStartButton,
        this.monitorStopButton,
      ]),
      element("div", { className: "na-notice" }, [
        icon("shield"),
        element("p", {
          text: "Monitoring is sequential and active only while this dashboard tab remains open. The first eligible match stops monitoring, binds one exact item, and never retries an offer automatically.",
        }),
      ]),
      this.monitorResultsRoot,
      this.status,
    );
  }

  applyCandidates(candidates) {
    for (const itemName of this.settings.watchlist) {
      const matches = candidates
        .filter((candidate) => normalizeName(candidate.itemName) === normalizeName(itemName))
        .sort((left, right) => left.price - right.price);
      const candidate = matches[0] ?? null;
      this.monitorResults.set(
        itemName,
        !candidate ? { state: "not-found" } : { state: "ready", candidate },
      );
    }
    this.renderMonitorResults();
  }

  renderMonitorResults() {
    if (!this.monitorResultsRoot) return;
    this.monitorResultsRoot.replaceChildren();
    if (this.settings.watchlist.length === 0) {
      this.monitorResultsRoot.append(
        element("p", {
          className: "na-watchlist-empty",
          text: "Save exact Kauvara item names to begin monitoring.",
        }),
      );
      return;
    }
    this.monitorResultsRoot.append(
      element("div", { className: "na-results-heading" }, [
        element("strong", { text: "Kauvara watchlist" }),
        element("span", {
          text: this.monitoring
            ? `Monitoring ${this.settings.watchlist.length} item${this.settings.watchlist.length === 1 ? "" : "s"}`
            : `${this.settings.watchlist.length} saved`,
        }),
      ]),
    );
    for (const itemName of this.settings.watchlist) {
      const result = this.monitorResults.get(itemName) ?? { state: "queued" };
      let detail = "Waiting for a stock check.";
      if (result.state === "checking") detail = "Checking Kauvara's live stock…";
      if (result.state === "not-found") detail = "Not present in the latest stock page.";
      if (result.state === "error") detail = result.error;
      if (result.state === "ready") {
        detail = `${formatPrice(result.candidate.price)} · ${result.candidate.stock} in stock · ${this.settings.dryRun ? "Ready to review." : "Ready for one automatic purchase."}`;
      }
      this.monitorResultsRoot.append(
        element("div", { className: "na-watchlist-result" }, [
          element("div", {}, [
            element("strong", { text: itemName }),
            element("span", { text: detail }),
          ]),
          element(
            "button",
            {
              className: "na-button na-button--secondary na-button--small",
              type: "button",
              disabled: result.state !== "ready",
              onClick: () => this.beginCandidate(result.candidate),
            },
            this.settings.dryRun ? "Review" : "Buy one",
          ),
        ]),
      );
    }
  }

  isMonitorActive(runId) {
    return this.monitoring && this.monitorRunId === runId;
  }

  syncMonitorControls() {
    if (this.monitorStartButton) this.monitorStartButton.disabled = this.monitoring;
    if (this.monitorStopButton) this.monitorStopButton.disabled = !this.monitoring;
  }

  startMonitoring() {
    if (
      this.monitoring ||
      !this.settings.enabled ||
      !isKauvaraMagicShopUrl(window.location.href) ||
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
      `Monitoring ${this.settings.watchlist.length} exact Kauvara item${this.settings.watchlist.length === 1 ? "" : "s"}.`,
      "running",
    );
    void this.runMonitor(runId);
  }

  async runMonitor(runId) {
    while (this.isMonitorActive(runId)) {
      try {
        const authorization = await this.send({
          type: MESSAGE_TYPES.authorizeMainShopLookup,
          runId,
          watchlist: [...this.settings.watchlist],
        });
        if (!this.isMonitorActive(runId)) return;
        if (authorization.watchlistCount !== this.settings.watchlist.length) {
          throw new Error("The authorized MS Autobuy watchlist no longer matches this tab.");
        }
        for (const itemName of this.settings.watchlist) {
          this.monitorResults.set(itemName, { state: "checking" });
        }
        this.renderMonitorResults();
        const controller = new AbortController();
        this.monitorController = controller;
        const html = await this.shopFetcher({ controller });
        if (!this.isMonitorActive(runId)) return;
        const candidates = parseMainShopCandidates(html);
        this.applyCandidates(candidates);
        const ready = this.settings.watchlist
          .map((itemName) => this.monitorResults.get(itemName))
          .find((result) => result?.state === "ready")?.candidate;
        if (ready) {
          this.stopMonitoring();
          if (this.settings.dryRun) {
            setStatus(
              this.status,
              `Found ${ready.itemName} at ${formatPrice(ready.price)}. Monitoring stopped for exact review.`,
              "success",
            );
            this.openReviewDialog(ready);
          } else {
            setStatus(
              this.status,
              `Found ${ready.itemName} at ${formatPrice(ready.price)}. Binding one exact purchase…`,
              "running",
            );
            await this.beginAutomaticPurchase(ready);
          }
          return;
        }
        setStatus(
          this.status,
          `Stock check complete. Continuing every ${Math.round(this.settings.requestIntervalMs / 1000)} seconds.`,
          "success",
        );
      } catch (error) {
        if (!this.isMonitorActive(runId)) return;
        for (const itemName of this.settings.watchlist) {
          this.monitorResults.set(itemName, { state: "error", error: error.message });
        }
        this.renderMonitorResults();
        this.stopMonitoring();
        setStatus(this.status, `${error.message} Monitoring stopped safely.`, "error");
        return;
      } finally {
        this.monitorController = null;
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
          chrome.runtime.sendMessage({ type: MESSAGE_TYPES.cancelMainShopMonitor, runId }),
        ).catch(() => undefined);
      } catch {
        // Local cancellation is complete even if the extension is reloading.
      }
    }
    if (announce && this.status) {
      setStatus(this.status, "MS Autobuy monitoring stopped. No purchase was armed.", "success");
    }
  }

  beginCandidate(candidate) {
    this.stopMonitoring({ announce: this.monitoring });
    if (this.settings.dryRun) this.openReviewDialog(candidate);
    else void this.beginAutomaticPurchase(candidate);
  }

  beginReview(candidate) {
    this.beginCandidate(candidate);
  }

  async beginAutomaticPurchase(candidate) {
    if (!candidate || this.purchaseArming || this.settings.dryRun || !this.settings.enabled) return;
    this.purchaseArming = true;
    const operationId = crypto.randomUUID();
    try {
      setStatus(this.status, "Rechecking the exact Kauvara listing…", "running");
      const prepared = await this.send({
        type: MESSAGE_TYPES.prepareMainShopPurchase,
        operationId,
        candidate,
      });
      const html = await this.shopFetcher();
      const fresh = verifyFreshMainShopCandidate(html, candidate);
      if (!fresh.fresh) throw new Error(fresh.error);
      const responseFingerprint = await createTextFingerprint(html);
      const confirmed = await this.send({
        type: MESSAGE_TYPES.confirmMainShopPurchase,
        operationId,
        reviewId: prepared.reviewId,
        candidate,
        responseFingerprint,
        freshStateVerified: true,
      });
      if (confirmed.purchaseArmed !== true) {
        throw new Error("The extension did not arm the exact Kauvara purchase.");
      }
      setStatus(
        this.status,
        "Exact purchase armed. Reloading current stock for Neopets' confirmation step…",
        "running",
      );
      this.purchaseLauncher(candidate);
    } catch (error) {
      setStatus(this.status, `${error.message} No automatic retry was attempted.`, "error");
      this.purchaseArming = false;
    }
  }

  openReviewDialog(candidate) {
    if (!candidate || this.dialog || !this.settings.dryRun) return;
    const dialog = element("dialog", { className: "na-dialog" });
    this.dialog = dialog;
    const confirmation = element("input", { type: "checkbox" });
    const actionButton = element("button", {
      type: "button",
      className: "na-button na-button--primary",
      disabled: true,
      text: "Finish dry run",
    });
    confirmation.addEventListener("change", () => {
      actionButton.disabled = !confirmation.checked;
    });
    const close = () => dialog.close();
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
    actionButton.addEventListener("click", async () => {
      actionButton.disabled = true;
      setStatus(
        this.status,
        `MS Autobuy dry run complete for ${candidate.itemName} at ${formatPrice(candidate.price)}. No purchase flow was opened.`,
        "success",
      );
      close();
    });

    dialog.append(
      element("form", { method: "dialog", className: "na-dialog__card" }, [
        element("div", { className: "na-dialog__header" }, [
          element("div", {}, [
            element("h2", {
              text: "Review MS dry run",
            }),
            element("p", { text: "Kauvara's Magic Shop · quantity is one item." }),
          ]),
          closeButton,
        ]),
        element("dl", { className: "na-operation-summary" }, [
          element("div", {}, [
            element("dt", { text: "Item" }),
            element("dd", { text: candidate.itemName }),
          ]),
          element("div", {}, [
            element("dt", { text: "Listed price" }),
            element("dd", { text: formatPrice(candidate.price) }),
          ]),
          element("div", {}, [
            element("dt", { text: "Current stock" }),
            element("dd", { text: String(candidate.stock) }),
          ]),
        ]),
        element("label", { className: "na-confirm-row" }, [
          confirmation,
          element("span", {
            text: "I reviewed this live listing and understand that no navigation or purchase will occur.",
          }),
        ]),
        element("p", {
          className: "na-dialog__note",
          text: "Dry run mode sends no purchase or haggle request.",
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
