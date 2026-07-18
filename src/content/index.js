import { STORAGE_KEYS } from "../shared/constants.js";
import { areAppDataEquivalent, loadAppData } from "../shared/storage.js";
import { NeopianAssistantApp } from "./app.js";
import { claimInitialization, releaseInitialization } from "./lifecycle.js";

async function initialize() {
  if (!claimInitialization()) return;
  let app = null;
  try {
    const data = await loadAppData();
    if (!data.settings.enabled) return;
    app = new NeopianAssistantApp(data);
    app.mount();
  } catch {
    console.warn("Neopian Assistant could not initialize on this page.");
  }

  const handleStorageChange = async (changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEYS.data]) return;
    if (app && areAppDataEquivalent(changes[STORAGE_KEYS.data].newValue, app.data)) {
      return;
    }
    try {
      const data = await loadAppData();
      app?.cleanup();
      app?.root?.remove();
      app = null;
      if (data.settings.enabled) {
        app = new NeopianAssistantApp(data);
        app.mount();
      }
    } catch {
      console.warn("Neopian Assistant could not apply updated settings.");
    }
  };
  chrome.storage.onChanged.addListener(handleStorageChange);

  const handleRuntimeMessage = (message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || message?.type !== "ui.focusDashboard") return false;
    if (!app?.root) {
      sendResponse({ ok: false });
      return false;
    }
    if (app.data.settings.panel.minimized) void app.toggleMinimized();
    app.root.focus({ preventScroll: true });
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      app.root.animate(
        [
          { boxShadow: "0 18px 52px rgb(15 23 42 / 22%)" },
          { boxShadow: "0 0 0 4px rgb(37 99 235 / 32%), 0 18px 52px rgb(15 23 42 / 22%)" },
          { boxShadow: "0 18px 52px rgb(15 23 42 / 22%)" },
        ],
        { duration: 500 },
      );
    }
    sendResponse({ ok: true });
    return false;
  };
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  window.addEventListener(
    "pagehide",
    () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      app?.cleanup();
      releaseInitialization();
    },
    { once: true },
  );
}

void initialize();
