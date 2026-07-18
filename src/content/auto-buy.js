import { MESSAGE_TYPES, PURCHASE_LIMITS } from "../shared/constants.js";
import { element, icon, labeledControl, setStatus } from "../shared/dom.js";
import { createTextFingerprint } from "../shared/pricing-operations.js";
import { isShopWizardUrl } from "../shared/validation.js";
import {
  extractPurchaseCandidates,
  verifyFreshPurchaseCandidate,
  verifyPurchaseResponse,
} from "./shop-parser.js";

function formatPrice(value) {
  return `${value.toLocaleString()} NP`;
}

export class AutoBuyController {
  constructor({ data, save, announce }) {
    this.data = data;
    this.save = save;
    this.announce = announce;
    this.status = null;
    this.dialog = null;
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

  render(container) {
    container.replaceChildren();
    const onWizardPage = isShopWizardUrl(window.location.href);
    const candidate = onWizardPage ? (extractPurchaseCandidates(document)[0] ?? null) : null;

    const enabled = element("input", { type: "checkbox", checked: this.settings.enabled });
    enabled.addEventListener("change", async () => {
      this.settings.enabled = enabled.checked;
      await this.saveSettings("Auto Buy settings saved.");
      this.render(container);
    });
    const dryRun = element("input", { type: "checkbox", checked: this.settings.dryRun });
    dryRun.addEventListener("change", async () => {
      this.settings.dryRun = dryRun.checked;
      await this.saveSettings("Auto Buy settings saved.");
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
      await this.saveSettings("Auto Buy purchase limit saved.");
      this.render(container);
    });

    const settingsPanel = element("section", { className: "na-pricing-settings" }, [
      element("div", { className: "na-setting-row" }, [
        element("div", {}, [
          element("strong", { text: "Enable Auto Buy" }),
          element("span", {
            text: "Off by default. Handles one explicitly confirmed Shop Wizard listing at a time.",
          }),
        ]),
        element("label", { className: "na-switch", ariaLabel: "Enable Auto Buy" }, [
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
        element("label", { className: "na-switch", ariaLabel: "Use Auto Buy dry-run mode" }, [
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
      ]),
    ]);

    const listingWithinLimit = candidate && candidate.price <= this.settings.maximumPrice;
    const requirement = element("div", { className: "na-notice" }, [
      icon("shield"),
      element("p", {
        text: !onWizardPage
          ? "Open a Shop Wizard results page to review a listing."
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
        onClick: () => this.openReviewDialog(candidate),
      },
      [icon("check"), this.settings.dryRun ? "Review dry run" : "Review one purchase"],
    );
    this.status = element("div", {
      className: "na-status",
      role: "status",
      ariaLive: "polite",
      text: this.settings.enabled
        ? "Ready. No purchase URL is followed until the review is confirmed."
        : "Auto Buy is disabled.",
    });
    container.append(
      element("div", { className: "na-section-heading" }, [
        element("div", {}, [
          element("h2", { text: "Auto Buy" }),
          element("p", {
            text: "A guarded one-item workflow with fresh-listing checks, a hard price ceiling, duplicate blocking, and no retries.",
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
      this.status,
    );
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
    const close = () => dialog.close();
    actionButton.addEventListener("click", async () => {
      actionButton.disabled = true;
      if (this.settings.dryRun) {
        setStatus(
          this.status,
          `Dry run complete for ${candidate.itemName} at ${formatPrice(candidate.price)}. No purchase URL was followed.`,
          "success",
        );
        close();
        return;
      }
      try {
        setStatus(this.status, "Rechecking the exact listing before purchase…", "running");
        const review = await this.send({
          type: MESSAGE_TYPES.preparePurchase,
          operationId,
          candidate,
        });
        const freshState = verifyFreshPurchaseCandidate(review.freshWizardHtml, candidate);
        if (!freshState.fresh) throw new Error(freshState.error);
        const confirmed = await this.send({
          type: MESSAGE_TYPES.confirmPurchase,
          operationId,
          reviewId: review.reviewId,
          candidate,
          responseFingerprint: await createTextFingerprint(review.freshWizardHtml),
          freshStateVerified: true,
        });
        setStatus(
          this.status,
          `Submitting one ${formatPrice(candidate.price)} purchase. No retry will occur…`,
          "running",
        );
        const response = await this.send({
          type: MESSAGE_TYPES.purchaseItem,
          operationId,
          token: confirmed.token,
          candidate,
        });
        const verification = verifyPurchaseResponse(response.purchaseHtml, candidate);
        await this.send({
          type: MESSAGE_TYPES.recordPurchaseVerification,
          operationId,
          token: confirmed.token,
          verified: verification.verified,
        });
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
        close();
      } catch (error) {
        setStatus(this.status, `${error.message} No automatic retry was attempted.`, "error");
        actionButton.disabled = false;
      }
    });

    dialog.append(
      element("form", { method: "dialog", className: "na-dialog__card" }, [
        element("div", { className: "na-dialog__header" }, [
          element("div", {}, [
            element("h2", { text: this.settings.dryRun ? "Review dry run" : "Confirm purchase" }),
            element("p", { text: "Quantity is fixed at one item." }),
          ]),
          element(
            "button",
            { type: "button", className: "na-icon-button", ariaLabel: "Close", onClick: close },
            icon("close"),
          ),
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
        element("div", { className: "na-dialog__actions" }, [
          element(
            "button",
            { type: "button", className: "na-button na-button--secondary", onClick: close },
            "Cancel",
          ),
          actionButton,
        ]),
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
    this.dialog?.close();
  }
}
