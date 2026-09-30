import { applyAppearance } from "../shared/appearance.js";
import { BRAND } from "../shared/constants.js";
import { element, icon, setStatus } from "../shared/dom.js";
import { loadAppData, saveAppData } from "../shared/storage.js";
import {
  isAllowedNeopetsPageUrl,
  isOwnShopStockUrl,
  isKauvaraMagicShopUrl,
  isShopWizardUrl,
} from "../shared/validation.js";

export function describePage(url, settings) {
  if (typeof url !== "string" || !isAllowedNeopetsPageUrl(url))
    return "Open Neopets to use your companion.";
  const feature = isKauvaraMagicShopUrl(url)
    ? ["Kauvara’s Magic Shop", "MS Autobuy", settings.mainShopBuy.enabled]
    : isOwnShopStockUrl(url)
      ? ["Your shop stock", "Auto Pricing", settings.autoPricing.enabled]
      : isShopWizardUrl(url)
        ? ["Shop Wizard", "SW Autobuy", settings.autoBuy.enabled]
        : ["Neopets", "Dailies", settings.dailiesEnabled];
  return `${feature[0]} · ${feature[1]} ${!settings.enabled ? "paused while the extension is disabled" : feature[2] ? "available" : "disabled in settings"}.`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function render() {
  const app = document.getElementById("app");
  try {
    const [data, tab] = await Promise.all([loadAppData(), getActiveTab()]);
    applyAppearance(document.documentElement, data.settings);
    const supported = typeof tab?.url === "string" && isAllowedNeopetsPageUrl(tab.url);
    const shopPage = typeof tab?.url === "string" && isOwnShopStockUrl(tab.url);
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
        updateContext();
        setStatus(
          status,
          enabled.checked ? "Neopian Assistant enabled." : "Neopian Assistant disabled.",
          "success",
        );
      } catch {
        enabled.checked = !enabled.checked;
        data.settings.enabled = enabled.checked;
        updateContext();
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
      [icon(supported ? "spark" : "external"), supported ? "Open dashboard" : "Open Neopets"],
    );
    primary.addEventListener("click", async () => {
      primary.disabled = true;
      try {
        if (supported && Number.isInteger(tab.id)) {
          const response = await chrome.tabs.sendMessage(tab.id, { type: "ui.focusDashboard" });
          if (!response?.ok) throw new Error("Dashboard unavailable");
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
    const pageCopy = element("p", { text: describePage(tab?.url, data.settings) });
    function updateContext() {
      primary.disabled = supported && !data.settings.enabled;
      primary.replaceChildren(
        icon("external"),
        supported
          ? data.settings.enabled
            ? "Open dashboard"
            : "Enable above to open"
          : "Open Neopets",
      );
      pageCopy.textContent = describePage(tab?.url, data.settings);
    }
    updateContext();

    app.replaceChildren(
      element("header", { className: "ui-brand" }, [
        element("img", { src: "../icons/icon48.png", width: 48, height: 48, alt: "" }),
        element("div", {}, [
          element("h1", { text: BRAND.name }),
          element("p", { text: "Smarter routines, one visit at a time" }),
        ]),
      ]),
      element("section", { className: "popup-setting" }, [
        element("div", {}, [
          element("h2", { text: "Enabled" }),
          element("p", { text: "Turn the extension on or off on all supported pages." }),
        ]),
        element("label", { className: "ui-switch", ariaLabel: "Enable Neopian Assistant" }, [
          enabled,
          element("span", { className: "ui-switch__track" }),
        ]),
      ]),
      element("section", { className: "popup-current" }, [
        element("span", { className: "popup-current__icon" }, icon(shopPage ? "shield" : "info")),
        element("div", {}, [element("h2", { text: "Current page" }), pageCopy]),
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
