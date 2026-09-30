import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { NeopianAssistantApp } from "../src/content/app.js";
import { createDefaultData, sanitizeAppData } from "../src/shared/storage.js";
import { configureTool, showThemedDialog } from "../src/shared/appearance.js";
import { SettingsSaveState } from "../src/shared/settings-save-state.js";
import { getNeopianDateKey } from "../src/shared/validation.js";

function installDom(t) {
  const { document, window } = parseHTML("<!doctype html><html><body></body></html>");
  let active = document.body;
  Object.defineProperty(document, "activeElement", { get: () => active });
  window.HTMLElement.prototype.focus = function () {
    active = this;
  };
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const create = document.createElement.bind(document);
  document.createElement = (tag) => {
    const node = create(tag);
    if (tag === "dialog") {
      node.showModal = () => {
        node.open = true;
      };
      node.close = () => {
        node.open = false;
        node.dispatchEvent(new window.Event("close"));
      };
    }
    return node;
  };
  const replacements = { document, Node: window.Node };
  for (const [key, value] of Object.entries(replacements)) {
    const previous = globalThis[key];
    globalThis[key] = value;
    t.after(() => {
      globalThis[key] = previous;
    });
  }
  return { document, window };
}

function dailyApp(t) {
  const dom = installDom(t);
  const data = createDefaultData();
  const app = new NeopianAssistantApp(data, { persistData: async (snapshot) => snapshot });
  app.content = dom.document.createElement("div");
  dom.document.body.append(app.content);
  app.renderDailies();
  return { ...dom, app, data };
}

test("new dashboards use 480px while existing widths survive sanitation", () => {
  assert.equal(createDefaultData().settings.panel.width, 480);
  const existing = createDefaultData();
  existing.settings.panel.width = 390;
  assert.equal(sanitizeAppData(existing).settings.panel.width, 390);
});

test("filtered reordering moves the displayed routine within its underlying group", async (t) => {
  const { app, data } = dailyApp(t);
  const group = data.groups.find((entry) => entry.items.some((item) => /bank/i.test(item.name)));
  const bank = group.items.find((item) => /bank/i.test(item.name));
  const index = group.items.indexOf(bank);
  const original = group.items.map((item) => item.id);
  app.search = "bank";
  app.editing = true;
  app.rerenderDailies();
  const down = [...app.content.querySelectorAll("button")].find(
    (node) => node.getAttribute("aria-label") === `Move ${bank.name} down`,
  );
  down.click();
  await app.saveQueue;
  await new Promise((resolve) => setImmediate(resolve));
  const expected = [...original];
  [expected[index], expected[index + 1]] = [expected[index + 1], expected[index]];
  assert.deepEqual(
    group.items.map((item) => item.id),
    expected,
  );
});

test("availability counts include hidden groups and filters combine with search", (t) => {
  const { app, data } = dailyApp(t);
  const item = data.groups[0].items[0];
  data.state[item.id] = { completed: 1, lastCompleted: Date.now(), dateKey: getNeopianDateKey() };
  data.groups[0].collapsed = true;
  app.rerenderDailies();
  const total = data.groups.reduce((sum, group) => sum + group.items.length, 0);
  assert.equal(app.content.querySelector("[data-ready-count]").textContent, `${total - 1} ready`);
  assert.equal(app.content.querySelector("[data-cooldown-count]").textContent, "1 on cooldown");
  app.availabilityFilter = "cooldown";
  app.refreshVisibleStatus();
  assert.deepEqual(
    [...app.content.querySelectorAll(".na-daily")]
      .filter((row) => !row.hidden)
      .map((row) => row.dataset.dailyId),
    [item.id],
  );
  assert.equal(app.content.querySelector(".na-daily-list").hidden, false);
  app.search = "No such routine";
  app.refreshVisibleStatus();
  assert.equal(app.content.querySelector(".na-filter-empty").hidden, false);
  app.search = "";
  app.availabilityFilter = "ready";
  app.refreshVisibleStatus();
  assert.equal(
    [...app.content.querySelectorAll(".na-daily")].filter((row) => !row.hidden).length,
    total - 1,
  );
});

test("timer updates preserve the search, focused claim control, and scroll position", (t) => {
  const { app, document, data } = dailyApp(t);
  const search = app.content.querySelector('input[type="search"]');
  const check = app.content.querySelector(".na-check-button");
  const row = check.closest(".na-daily");
  check.focus();
  app.content.scrollTop = 172;
  app.refreshVisibleStatus();
  assert.equal(document.activeElement, check);
  assert.equal(app.content.querySelector('input[type="search"]'), search);
  assert.equal(app.content.scrollTop, 172);
  const item = data.groups[0].items[0];
  data.state[item.id] = { completed: 1, lastCompleted: Date.now(), dateKey: getNeopianDateKey() };
  app.refreshVisibleStatus();
  assert.equal(row.querySelector(".na-check-button"), check);
  assert.equal(check.disabled, true);
  assert.match(row.querySelector(".na-daily__status").textContent, /available in/);
});

test("search typing updates the list without replacing the input", (t) => {
  const { app, window, document } = dailyApp(t);
  const input = app.content.querySelector('input[type="search"]');
  input.focus();
  input.value = "bank";
  input.dispatchEvent(new window.Event("input"));
  assert.equal(document.activeElement, input);
  assert.equal(app.content.querySelector('input[type="search"]'), input);
  assert.equal(app.search, "bank");
  assert.ok(
    [...app.content.querySelectorAll(".na-daily")]
      .filter((row) => !row.hidden)
      .every((row) => /bank/i.test(row.textContent)),
  );
});

test("review dialogs carry theme and density and restore focus after closing", (t) => {
  const { document } = installDom(t);
  for (const theme of ["light", "dark", "system"]) {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const dialog = document.createElement("dialog");
    dialog.append(document.createElement("h2"));
    document.body.append(dialog);
    showThemedDialog(dialog, { theme, density: "compact" });
    assert.equal(dialog.dataset.theme, theme);
    assert.equal(dialog.dataset.density, "compact");
    assert.ok(dialog.getAttribute("aria-labelledby"));
    dialog.close();
    assert.equal(document.activeElement, trigger);
    trigger.remove();
    dialog.remove();
  }
});

test("settings distinguish unchanged, unsaved, saving, saved, and failure with retry", async () => {
  let input = "initial";
  const states = [];
  const tracker = new SettingsSaveState(
    () => input,
    (state) => states.push(state),
  );
  tracker.loaded();
  input = "edited";
  tracker.changed();
  await tracker.save(
    async () => {
      throw Error("storage unavailable");
    },
    () => assert.fail("failed save applied"),
  );
  assert.equal(input, "edited");
  await tracker.save(
    async () => "saved",
    () => {},
  );
  assert.deepEqual(states, ["unchanged", "unsaved", "saving", "failed", "saving", "saved"]);
  tracker.changed();
  assert.equal(states.at(-1), "unchanged");
});

test("settings preserve edits made during a pending save and detect reverted changes", async () => {
  let input = "first";
  const states = [];
  const tracker = new SettingsSaveState(
    () => input,
    (state) => states.push(state),
  );
  tracker.loaded();
  input = "second";
  tracker.changed();
  let finish;
  const pending = tracker.save(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    () => {
      input = "applied";
    },
  );
  input = "third";
  finish();
  await pending;
  assert.equal(input, "third");
  assert.equal(states.at(-1), "unsaved");
  input = "second";
  tracker.changed();
  assert.equal(states.at(-1), "unchanged");
});

test("configuration preserves mode controls and expands missing setup without persisting UI state", (t) => {
  const { document, window } = installDom(t);
  const panel = document.createElement("section");
  for (const title of ["Enabled", "Dry run"]) {
    const row = document.createElement("div");
    const text = document.createElement("strong");
    text.textContent = title;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = true;
    row.append(text, input);
    panel.append(row);
  }
  const field = document.createElement("textarea");
  panel.append(field);
  let open;
  const configuration = configureTool(panel, {
    summary: "0/10 names",
    open: true,
    onToggle: (value) => {
      open = value;
    },
  });
  assert.equal(configuration.querySelector(".na-tool-modes").querySelectorAll("input").length, 2);
  assert.equal(configuration.querySelector("details").hasAttribute("open"), true);
  assert.equal(configuration.querySelector("details textarea"), field);
  configuration.querySelector("details").open = false;
  configuration.querySelector("details").dispatchEvent(new window.Event("toggle"));
  assert.equal(open, false);
});

test("viewport clamping retains preferred dimensions and keeps a usable body near screen edges", (t) => {
  const original = globalThis.window;
  globalThis.window = { innerWidth: 390, innerHeight: 440 };
  t.after(() => {
    globalThis.window = original;
  });
  const data = createDefaultData();
  data.settings.panel = { width: 640, top: 9999, right: 9999, minimized: false };
  const app = new NeopianAssistantApp(data);
  app.root = { style: {} };
  app.clampToViewport();
  assert.equal(app.root.style.width, "374px");
  assert.equal(app.root.style.top, "12px");
  assert.equal(app.root.style.right, "8px");
  assert.equal(data.settings.panel.width, 640);
  assert.equal(data.settings.panel.top, 9999);
});

test("tabs expose complete associations and arrow keys move focus without activating a tool", (t) => {
  const { document, window } = installDom(t);
  const previousWindow = globalThis.window,
    previousObserver = globalThis.ResizeObserver;
  globalThis.window = window;
  window.innerWidth = 1200;
  window.innerHeight = 900;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  try {
    const app = new NeopianAssistantApp(createDefaultData(), { persistData: async (data) => data });
    app.mount();
    try {
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      assert.equal(tabs[0].getAttribute("aria-selected"), "true");
      for (const tab of tabs.slice(1)) assert.equal(tab.getAttribute("aria-selected"), "false");
      for (const tab of tabs) assert.equal(tab.getAttribute("aria-controls"), app.content.id);
      assert.equal(app.content.getAttribute("aria-labelledby"), tabs[0].id);
      tabs[0].focus();
      const right = new window.Event("keydown", { bubbles: true });
      right.key = "ArrowRight";
      tabs[0].dispatchEvent(right);
      assert.equal(document.activeElement, tabs[1]);
      assert.equal(app.activeTab, "dailies");
      assert.equal(tabs[1].getAttribute("tabindex"), "0");
    } finally {
      app.cleanup();
    }
  } finally {
    globalThis.window = previousWindow;
    globalThis.ResizeObserver = previousObserver;
  }
});
