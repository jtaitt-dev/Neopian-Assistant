import { BRAND } from "../shared/constants.js";
import { element, icon, setStatus } from "../shared/dom.js";
import { loadAppData, saveAppData } from "../shared/storage.js";
import {
  isAllowedNeopetsPageUrl,
  isOwnShopStockUrl,
  isShopWizardUrl,
} from "../shared/validation.js";

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function render() {
  const app = document.getElementById("app");
  try {
    const [data, tab] = await Promise.all([loadAppData(), getActiveTab()]);
    const supported = typeof tab?.url === "string" && isAllowedNeopetsPageUrl(tab.url);
    const shopPage = typeof tab?.url === "string" && isOwnShopStockUrl(tab.url);
    const wizardPage = typeof tab?.url === "string" && isShopWizardUrl(tab.url);
    const enabled = element("input", { type: "checkbox", checked: data.settings.enabled });
    const status = element("div", {
      className: "ui-status",
      role: "status",
      ariaLive: "polite",
      text: "Neopian Assistant is ready.",
    });

    enabled.addEventListener("change", async () => {
      enabled.disabled = true;
      data.settings.enabled = enabled.checked;
      try {
        await saveAppData(data);
        setStatus(
          status,
          enabled.checked ? "Neopian Assistant enabled." : "Neopian Assistant disabled.",
          "success",
        );
      } catch {
        enabled.checked = !enabled.checked;
        setStatus(status, "The enabled setting could not be saved.", "error");
      } finally {
        enabled.disabled = false;
      }
    });

    const primary = element(
      "button",
      {
        type: "button",
        className: "ui-button ui-button--primary ui-button--wide",
      },
      [icon(supported ? "spark" : "external"), supported ? "Focus dashboard" : "Open Neopets"],
    );
    primary.addEventListener("click", async () => {
      primary.disabled = true;
      try {
        if (supported && Number.isInteger(tab.id)) {
          await chrome.tabs.sendMessage(tab.id, { type: "ui.focusDashboard" });
          window.close();
        } else {
          await chrome.tabs.create({ url: "https://www.neopets.com/" });
          window.close();
        }
      } catch {
        setStatus(status, "Reload the Neopets page to activate the dashboard.", "error");
        primary.disabled = false;
      }
    });

    const settingsButton = element(
      "button",
      {
        type: "button",
        className: "ui-button ui-button--secondary ui-button--wide",
        onClick: () => chrome.runtime.openOptionsPage(),
      },
      [icon("gear"), "Settings"],
    );
    const pageDescription = !supported
      ? "This page is outside the extension's narrow Neopets access."
      : shopPage
        ? `Shop stock detected. Auto Pricing is ${data.settings.autoPricing.enabled ? "available" : "disabled"}.`
        : wizardPage
          ? `Shop Wizard detected. Auto Buy is ${data.settings.autoBuy.enabled ? "available" : "disabled"}.`
          : "Supported Neopets page. Dailies dashboard is available.";

    app.replaceChildren(
      element("header", { className: "ui-brand" }, [
        element("img", { src: "../icons/icon48.png", width: 48, height: 48, alt: "" }),
        element("div", {}, [
          element("h1", { text: BRAND.name }),
          element("p", { text: BRAND.tagline }),
        ]),
      ]),
      element("section", { className: "popup-setting" }, [
        element("div", {}, [
          element("h2", { text: "Global enabled" }),
          element("p", { text: "Turn the extension on or off on all supported pages." }),
        ]),
        element("label", { className: "ui-switch", ariaLabel: "Enable Neopian Assistant" }, [
          enabled,
          element("span", { className: "ui-switch__track" }),
        ]),
      ]),
      element("section", { className: "popup-current" }, [
        element("span", { className: "popup-current__icon" }, icon(shopPage ? "shield" : "info")),
        element("div", {}, [
          element("h2", { text: "Current page" }),
          element("p", { text: pageDescription }),
        ]),
      ]),
      element("div", { className: "popup-actions" }, [primary, settingsButton]),
      element("section", { className: "popup-privacy" }, [
        icon("shield"),
        element("div", {}, [
          element("h2", { text: "Your data stays local" }),
          element("p", {
            text: "Settings, routines, completion history, and redacted operation status stay in Chrome storage. No analytics or telemetry are included.",
          }),
        ]),
      ]),
      status,
      element("footer", { className: "popup-footer", text: BRAND.disclaimer }),
    );
    app.setAttribute("aria-busy", "false");
  } catch {
    app.replaceChildren(
      element("section", { className: "popup-failure", role: "alert" }, [
        icon("info"),
        element("h1", { text: "Neopian Assistant could not start" }),
        element("p", { text: "Reload the extension and try again. No settings were changed." }),
      ]),
    );
    app.setAttribute("aria-busy", "false");
  }
}

void render();
