import { BRAND, MESSAGE_TYPES } from "../shared/constants.js";
import { compassMark, element, icon, setStatus } from "../shared/dom.js";
import { applyAppearance, showThemedDialog } from "../shared/appearance.js";
import { saveAppData } from "../shared/storage.js";
import {
  cloneValue,
  getDailyStatus,
  getNeopianDateKey,
  makeStableItemId,
  parseCooldown,
  sanitizeDaily,
} from "../shared/validation.js";
import { AutoPricingController, createPricingDisclaimer } from "./auto-pricing.js";
import { AutoBuyController } from "./auto-buy.js";
import { MainShopAutoBuyController } from "./main-shop-auto-buy.js";

function formatRemaining(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return minutes > 0 ? `${minutes}m` : "less than 1m";
}

function buttonWithIcon(label, iconName, attributes = {}) {
  return element("button", { type: "button", ...attributes }, [icon(iconName), label]);
}

export async function requestOptionsPage(
  sendMessage = (message) => chrome.runtime.sendMessage(message),
) {
  const response = await sendMessage({ type: MESSAGE_TYPES.openOptions });
  if (!response?.ok) {
    throw new Error(response?.error || "Neopian Assistant settings could not be opened.");
  }
  return response;
}

export function isExtensionContextInvalidatedError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /extension context invalidated/i.test(message);
}

export class NeopianAssistantApp {
  constructor(data, { persistData = saveAppData } = {}) {
    this.data = data;
    this.persistData = persistData;
    this.saveQueue = Promise.resolve();
    this.root = null;
    this.content = null;
    this.status = null;
    this.activeTab = "dailies";
    this.search = "";
    this.availabilityFilter = "all";
    this.viewportHandler = null;
    this.editing = false;
    this.timer = null;
    this.resizeObserver = null;
    this.resizeTimer = null;
    this.pricing = null;
    this.buying = null;
    this.mainShopBuying = null;
    this.closedForPage = false;
    this.dialogs = new Set();
    this.pendingDailyClaims = new Set();
  }

  save() {
    const snapshot = cloneValue(this.data);
    const task = this.saveQueue
      .then(() => this.persistData(snapshot))
      .then(() => this.data)
      .catch((error) => {
        if (!isExtensionContextInvalidatedError(error)) throw error;
        this.closedForPage = true;
        this.cleanup();
        this.root?.remove();
        this.root = null;
        return this.data;
      });
    this.saveQueue = task.catch(() => undefined);
    return task;
  }

  mountDialog(dialog) {
    this.dialogs.add(dialog);
    document.body.append(dialog);
    dialog.addEventListener(
      "close",
      () => {
        this.dialogs.delete(dialog);
        dialog.remove();
      },
      { once: true },
    );
    showThemedDialog(dialog, this.data.settings);
  }

  announce(message, tone = "neutral") {
    if (this.status) setStatus(this.status, message, tone);
  }

  async openOptions() {
    try {
      await requestOptionsPage();
    } catch {
      this.announce("Neopian Assistant settings could not be opened.", "error");
    }
  }

  mount() {
    document.getElementById("neopian-assistant-root")?.remove();
    const root = element("aside", {
      id: "neopian-assistant-root",
      className: "na-shell",
      ariaLabel: "Neopian Assistant dashboard",
      tabIndex: -1,
    });
    root.style.top = `${this.data.settings.panel.top}px`;
    root.style.right = `${this.data.settings.panel.right}px`;
    root.style.width = `${this.data.settings.panel.width}px`;
    applyAppearance(root, this.data.settings);

    const brandMark = element(
      "span",
      { className: "na-brand-mark", ariaHidden: "true" },
      compassMark(),
    );
    const header = element("header", { className: "na-header" }, [
      element("div", { className: "na-brand" }, [
        brandMark,
        element("div", {}, [
          element("strong", { className: "na-brand__name", text: BRAND.name }),
          element("span", {
            className: "na-brand__tagline",
            text: "Smarter routines, one visit at a time",
          }),
        ]),
      ]),
      element("div", { className: "na-header__actions" }, [
        element(
          "button",
          {
            type: "button",
            className: "na-icon-button",
            ariaLabel: "Open Neopian Assistant settings",
            title: "Settings",
            onClick: () => this.openOptions(),
          },
          icon("gear"),
        ),
        element(
          "button",
          {
            type: "button",
            className: "na-icon-button",
            ariaLabel: this.data.settings.panel.minimized
              ? "Expand dashboard"
              : "Minimize dashboard",
            title: this.data.settings.panel.minimized ? "Expand" : "Minimize",
            onClick: () => this.toggleMinimized(),
          },
          icon("minimize"),
        ),
        element(
          "button",
          {
            type: "button",
            className: "na-icon-button",
            ariaLabel: "Close dashboard on this page",
            title: "Close on this page",
            onClick: () => this.closeForCurrentPage(),
          },
          icon("close"),
        ),
      ]),
    ]);

    const tabs = element("div", {
      className: "na-tabs",
      role: "tablist",
      ariaLabel: "Dashboard sections",
    });
    for (const [id, label] of [
      ["dailies", "Dailies"],
      ["mainShop", "MS Autobuy"],
      ["pricing", "Auto Pricing"],
      ["buying", "SW Autobuy"],
    ]) {
      const tab = element("button", {
        type: "button",
        className: "na-tab",
        role: "tab",
        id: `na-tab-${id}`,
        ariaControls: "na-dashboard-panel",
        tabIndex: id === this.activeTab ? 0 : -1,
        ariaSelected: id === this.activeTab,
        dataset: { tab: id },
        text: label,
        onClick: () => this.switchTab(id),
      });
      tabs.append(tab);
    }

    this.content = element("div", {
      className: "na-content",
      role: "tabpanel",
      id: "na-dashboard-panel",
      ariaLabelledby: `na-tab-${this.activeTab}`,
      tabIndex: 0,
    });
    this.status = element("div", {
      className: "na-global-status",
      role: "status",
      ariaLive: "polite",
      text: "Neopian Assistant is ready.",
    });
    const footer = element("footer", { className: "na-footer" }, [
      icon("info"),
      createPricingDisclaimer(),
    ]);
    root.append(header, tabs, this.content, this.status, footer);
    document.body.append(root);
    this.root = root;
    this.root.classList.toggle("na-shell--minimized", this.data.settings.panel.minimized);
    this.clampToViewport();
    this.viewportHandler = () => this.clampToViewport();
    window.addEventListener("resize", this.viewportHandler);
    this.attachTabKeyboard(tabs);
    this.attachDragBehavior(header);
    this.attachResizeBehavior();
    this.renderActiveTab();
    this.timer = window.setInterval(() => this.refreshVisibleStatus(), 30_000);
  }

  async toggleMinimized() {
    this.data.settings.panel.minimized = !this.data.settings.panel.minimized;
    this.root.classList.toggle("na-shell--minimized", this.data.settings.panel.minimized);
    this.clampToViewport();
    const button = this.root.querySelector("button[title='Minimize'], button[title='Expand']");
    if (button) {
      button.title = this.data.settings.panel.minimized ? "Expand" : "Minimize";
      button.setAttribute(
        "aria-label",
        this.data.settings.panel.minimized ? "Expand dashboard" : "Minimize dashboard",
      );
    }
    await this.save();
  }

  closeForCurrentPage() {
    this.closedForPage = true;
    this.cleanup();
    this.root?.remove();
  }

  switchTab(tabId) {
    if (!["dailies", "mainShop", "pricing", "buying"].includes(tabId)) return;
    if (this.activeTab === tabId) return;
    this.activeTab = tabId;
    this.content.setAttribute("aria-labelledby", `na-tab-${tabId}`);
    for (const tab of this.root.querySelectorAll(".na-tab")) {
      tab.setAttribute("aria-selected", String(tab.dataset.tab === tabId));
      tab.tabIndex = tab.dataset.tab === tabId ? 0 : -1;
    }
    this.renderActiveTab();
  }

  renderActiveTab() {
    this.pricing?.cleanup();
    this.pricing = null;
    this.buying?.cleanup();
    this.buying = null;
    this.mainShopBuying?.cleanup();
    this.mainShopBuying = null;
    this.content.replaceChildren();
    if (this.activeTab === "dailies") this.renderDailies();
    if (this.activeTab === "mainShop") {
      this.mainShopBuying = new MainShopAutoBuyController({
        data: this.data,
        save: () => this.save(),
        announce: (message, tone) => this.announce(message, tone),
      });
      this.mainShopBuying.render(this.content);
    }
    if (this.activeTab === "pricing") {
      this.pricing = new AutoPricingController({
        data: this.data,
        save: () => this.save(),
        announce: (message, tone) => this.announce(message, tone),
      });
      this.pricing.render(this.content);
    }
    if (this.activeTab === "buying") {
      this.buying = new AutoBuyController({
        data: this.data,
        save: () => this.save(),
        announce: (message, tone) => this.announce(message, tone),
      });
      this.buying.render(this.content);
    }
  }

  renderDailies() {
    if (!this.data.settings.dailiesEnabled) {
      this.content.append(
        element("div", { className: "na-empty-state" }, [
          icon("info"),
          element("h2", { text: "Dailies tracking is disabled" }),
          element("p", {
            text: "Enable it from Neopian Assistant settings to show your routines.",
          }),
          buttonWithIcon("Open settings", "gear", {
            className: "na-button na-button--primary",
            onClick: () => this.openOptions(),
          }),
        ]),
      );
      return;
    }
    const toolbar = element("div", { className: "na-toolbar" });
    const search = element("input", {
      type: "search",
      value: this.search,
      placeholder: "Search dailies",
      ariaLabel: "Search dailies",
    });
    search.addEventListener("input", () => {
      this.search = search.value;
      this.refreshVisibleStatus();
    });
    toolbar.append(
      element("div", { className: "na-search" }, [icon("search"), search]),
      buttonWithIcon(this.editing ? "Done" : "Manage", this.editing ? "check" : "gear", {
        className: "na-button na-button--secondary",
        onClick: () => {
          this.editing = !this.editing;
          this.rerenderDailies();
        },
      }),
    );
    this.content.append(
      element("div", { className: "na-dailies-heading" }, [
        element("h2", { text: "Dailies" }),
        toolbar,
      ]),
      this.createProgressSummary(),
    );
    const filters = element("div", {
      className: "na-filters",
      role: "group",
      ariaLabel: "Daily availability",
    });
    for (const [value, label] of [
      ["all", "All"],
      ["ready", "Ready"],
      ["cooldown", "On cooldown"],
    ]) {
      filters.append(
        element("button", {
          type: "button",
          className: "na-filter",
          ariaPressed: value === this.availabilityFilter,
          dataset: { filter: value },
          text: label,
          onClick: () => {
            this.availabilityFilter = value;
            this.refreshVisibleStatus();
          },
        }),
      );
    }
    this.content.append(filters);
    this.content.append(
      element("p", {
        className: "na-daily-help",
        text: "Open with Go. Mark claimed after you finish on Neopets.",
      }),
    );

    if (this.editing) {
      this.content.append(
        element("div", { className: "na-manage-actions" }, [
          buttonWithIcon("Add group", "check", {
            className: "na-button na-button--secondary",
            onClick: () => this.openGroupDialog(),
          }),
          element("span", {
            text: "Use the row controls to edit, reorder, or remove routines. Import and export are in Settings.",
          }),
        ]),
      );
    }

    const groupsContainer = element("div", { className: "na-groups" });
    const query = this.search.toLowerCase().trim();
    for (const group of this.data.groups) {
      const visibleItems = group.items.filter((item) => item.name.toLowerCase().includes(query));
      if (query && visibleItems.length === 0) continue;
      const groupSection = element("section", {
        className: "na-group",
        dataset: { groupIndex: this.data.groups.indexOf(group) },
      });
      const toggle = element(
        "button",
        {
          type: "button",
          className: "na-group__toggle",
          ariaExpanded: !group.collapsed || Boolean(query) || this.availabilityFilter !== "all",
          onClick: async () => {
            group.collapsed = !group.collapsed;
            await this.save();
            this.rerenderDailies();
          },
        },
        element("span", { className: "na-group__title" }, [
          icon("chevron"),
          element("strong", { text: group.name }),
          element("span", { className: "na-group__count", text: String(visibleItems.length) }),
        ]),
      );
      const groupHeader = element("div", { className: "na-group__header" }, toggle);
      if (this.editing) {
        groupHeader.append(
          element("span", { className: "na-group__controls" }, [
            element(
              "button",
              {
                type: "button",
                className: "na-icon-button",
                ariaLabel: `Edit ${group.name}`,
                title: "Edit group",
                onClick: () => {
                  this.openGroupDialog(group);
                },
              },
              icon("gear"),
            ),
            element(
              "button",
              {
                type: "button",
                className: "na-icon-button",
                ariaLabel: `Add a daily to ${group.name}`,
                title: "Add daily",
                onClick: () => {
                  this.openDailyDialog(group);
                },
              },
              icon("check"),
            ),
          ]),
        );
      }
      groupSection.append(groupHeader);
      {
        const list = element("div", { className: "na-daily-list" });
        visibleItems.forEach((item, itemIndex) => {
          list.append(this.createDailyRow(group, item, itemIndex));
        });
        groupSection.append(list);
      }
      groupsContainer.append(groupSection);
    }
    if (groupsContainer.childElementCount === 0) {
      groupsContainer.append(
        element("div", { className: "na-empty-state" }, [
          element("h2", { text: "No matching dailies" }),
          element("p", { text: "Try a different search term." }),
        ]),
      );
    }
    this.content.append(
      groupsContainer,
      element("div", { className: "na-empty-state na-filter-empty", hidden: true }, [
        element("h3", { text: "No matching routines" }),
        element("p", { text: "Try another search or availability filter." }),
      ]),
    );
    this.refreshVisibleStatus();
  }

  createDailyRow(group, item, itemIndex) {
    const state = this.data.state[item.id];
    const status = getDailyStatus(item, state);
    const statusText = this.getStatusText(item, status);
    const image = element("img", {
      className: "na-daily__icon",
      src: item.iconUrl,
      alt: "",
      width: 40,
      height: 40,
      referrerPolicy: "no-referrer",
      loading: "lazy",
    });
    image.addEventListener("error", () => {
      image.hidden = true;
      image.parentElement?.classList.add("na-daily__icon-fallback");
      if (image.parentElement)
        image.parentElement.dataset.initial = item.name.slice(0, 1).toUpperCase();
    });
    const checkButton = element(
      "button",
      {
        type: "button",
        className: `na-check-button ${status.complete ? "na-check-button--complete" : ""}`,
        ariaLabel: status.complete
          ? `${item.name} is tracked and currently unavailable`
          : `Mark ${item.name} claimed`,
        title: status.complete ? statusText : "Mark claimed",
        disabled: status.complete,
        onClick: () => this.claimDaily(item),
      },
      icon("check"),
    );
    const row = element(
      "article",
      {
        className: `na-daily ${status.complete ? "na-daily--complete" : ""}`,
        dataset: { dailyId: item.id },
      },
      [
        element("span", { className: "na-daily__icon-wrap" }, image),
        element("div", { className: "na-daily__main" }, [
          element("strong", { text: item.name }),
          element("span", {
            className: "na-daily__status",
            text: statusText,
            dataset: { dailyStatus: item.id },
          }),
          item.notes ? element("span", { className: "na-daily__notes", text: item.notes }) : null,
        ]),
        element(
          "a",
          {
            className: "na-button na-button--secondary na-button--small",
            href: item.url,
            ariaLabel: `Go to ${item.name}`,
          },
          [icon("external"), "Go"],
        ),
        checkButton,
      ],
    );
    if (this.editing) {
      row.append(
        element("div", { className: "na-daily__edit-controls" }, [
          element(
            "button",
            {
              type: "button",
              className: "na-icon-button",
              ariaLabel: `Move ${item.name} up`,
              disabled: itemIndex === 0,
              onClick: () => this.moveDaily(group, item.id, -1),
            },
            icon("chevron"),
          ),
          element(
            "button",
            {
              type: "button",
              className: "na-icon-button na-icon-button--down",
              ariaLabel: `Move ${item.name} down`,
              disabled: itemIndex === group.items.length - 1,
              onClick: () => this.moveDaily(group, item.id, 1),
            },
            icon("chevron"),
          ),
          element(
            "button",
            {
              type: "button",
              className: "na-icon-button",
              ariaLabel: `Edit ${item.name}`,
              onClick: () => this.openDailyDialog(group, item),
            },
            icon("gear"),
          ),
          element(
            "button",
            {
              type: "button",
              className: "na-icon-button na-icon-button--danger",
              ariaLabel: `Delete ${item.name}`,
              onClick: () => this.confirmDailyDeletion(group, item),
            },
            icon("trash"),
          ),
        ]),
      );
    }
    return row;
  }

  getStatusText(item, status) {
    if (status.availableAt && status.complete) {
      return `Claimed · available in ${formatRemaining(status.availableAt - Date.now())}`;
    }
    if (status.complete) return "Claimed";
    const cooldown = parseCooldown(item.cooldown);
    if (cooldown.type === "count" && status.count > 0)
      return `${status.count} of ${status.limit} claimed · ready again`;
    return "Ready";
  }

  async claimDaily(item) {
    if (this.pendingDailyClaims.has(item.id)) return;
    const currentStatus = getDailyStatus(item, this.data.state[item.id]);
    if (currentStatus.complete) {
      this.announce(`${item.name} is already tracked until its cooldown ends.`, "neutral");
      return;
    }
    this.pendingDailyClaims.add(item.id);
    try {
      const previous = this.data.state[item.id] ?? {
        completed: 0,
        lastCompleted: null,
        dateKey: null,
      };
      const today = getNeopianDateKey();
      const completed = previous.dateKey === today ? previous.completed + 1 : 1;
      const timestamp = Date.now();
      this.data.state[item.id] = { completed, lastCompleted: timestamp, dateKey: today };
      this.data.history.unshift({ itemId: item.id, timestamp });
      this.data.history = this.data.history.slice(0, 100);
      await this.save();
      this.announce(`${item.name} claim tracked.`, "success");
      if (this.content) this.refreshVisibleStatus();
    } finally {
      this.pendingDailyClaims.delete(item.id);
      if (this.content) this.refreshVisibleStatus();
    }
  }

  createProgressSummary() {
    return element("section", { className: "na-availability", ariaLabel: "Routine availability" }, [
      element("div", { className: "na-availability__counts" }, [
        element("strong", { dataset: { readyCount: "" } }),
        element("span", { dataset: { cooldownCount: "" } }),
      ]),
      element("progress", { value: 0, max: 1, ariaLabel: "Routines ready" }),
    ]);
  }

  rerenderDailies() {
    if (this.activeTab !== "dailies") return;
    const scrollTop = this.content.scrollTop;
    const focused = document.activeElement;
    const label = focused?.getAttribute("aria-label");
    this.content.replaceChildren();
    this.renderDailies();
    this.content.scrollTop = scrollTop;
    if (label)
      [...this.content.querySelectorAll("[aria-label]")]
        .find((node) => node.getAttribute("aria-label") === label)
        ?.focus({ preventScroll: true });
  }

  refreshVisibleStatus() {
    if (this.activeTab !== "dailies" || !this.content || !this.data.settings.dailiesEnabled) return;
    const query = this.search.toLowerCase().trim();
    let ready = 0;
    let cooldown = 0;
    let visibleTotal = 0;
    for (const section of this.content.querySelectorAll(".na-group")) {
      const group = this.data.groups[Number(section.dataset.groupIndex)];
      let visible = 0;
      for (const row of section.querySelectorAll(".na-daily")) {
        const item = group.items.find((candidate) => candidate.id === row.dataset.dailyId);
        const status = getDailyStatus(item, this.data.state[item.id]);
        if (status.complete) cooldown += 1;
        else ready += 1;
        const text = this.getStatusText(item, status);
        row.querySelector(".na-daily__status").textContent = text;
        row.classList.toggle("na-daily--complete", status.complete);
        const check = row.querySelector(".na-check-button");
        check.disabled = status.complete || this.pendingDailyClaims.has(item.id);
        check.classList.toggle("na-check-button--complete", status.complete);
        check.setAttribute(
          "aria-label",
          status.complete
            ? `${item.name} is tracked and currently unavailable`
            : `Mark ${item.name} claimed`,
        );
        check.title = status.complete ? text : "Mark claimed";
        row.hidden =
          !item.name.toLowerCase().includes(query) ||
          (this.availabilityFilter === "ready" && status.complete) ||
          (this.availabilityFilter === "cooldown" && !status.complete);
        if (!row.hidden) visible += 1;
      }
      visibleTotal += visible;
      section.hidden = visible === 0 && !this.editing;
      const expanded = !group.collapsed || Boolean(query) || this.availabilityFilter !== "all";
      section.querySelector(".na-group__toggle").setAttribute("aria-expanded", String(expanded));
      section.querySelector(".na-daily-list").hidden = !expanded;
      section.querySelector(".na-group__count").textContent = String(visible);
    }
    const summary = this.content.querySelector(".na-availability");
    if (summary) {
      summary.querySelector("[data-ready-count]").textContent = `${ready} ready`;
      summary.querySelector("[data-cooldown-count]").textContent = `${cooldown} on cooldown`;
      summary.querySelector("progress").max = Math.max(1, ready + cooldown);
      summary.querySelector("progress").value = ready;
    }
    for (const button of this.content.querySelectorAll("[data-filter]")) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.filter === this.availabilityFilter),
      );
    }
    const empty = this.content.querySelector(".na-filter-empty");
    if (empty) empty.hidden = visibleTotal > 0 || this.editing;
  }

  async moveDaily(group, itemId, direction) {
    const index = group.items.findIndex((item) => item.id === itemId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= group.items.length) return;
    [group.items[index], group.items[target]] = [group.items[target], group.items[index]];
    await this.save();
    this.rerenderDailies();
  }

  attachTabKeyboard(tabs) {
    tabs.addEventListener("keydown", (event) => {
      const buttons = [...tabs.querySelectorAll('[role="tab"]')];
      const index = buttons.indexOf(event.target);
      if (index < 0) return;
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % buttons.length;
      if (event.key === "ArrowLeft") next = (index + buttons.length - 1) % buttons.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = buttons.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      for (const button of buttons) button.tabIndex = -1;
      buttons[next].tabIndex = 0;
      buttons[next].focus();
      buttons[next].scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  minimumVisibleHeight() {
    return this.data.settings.panel.minimized
      ? 96
      : Math.min(420, Math.max(0, window.innerHeight - 16));
  }

  clampToViewport() {
    if (!this.root) return;
    const panel = this.data.settings.panel;
    const width = Math.min(panel.width, Math.max(0, window.innerWidth - 16));
    const right = Math.max(8, Math.min(panel.right, window.innerWidth - width - 8));
    const top = Math.max(
      8,
      Math.min(panel.top, Math.max(8, window.innerHeight - this.minimumVisibleHeight() - 8)),
    );
    this.root.style.width = `${width}px`;
    this.root.style.right = `${right}px`;
    this.root.style.left = "auto";
    this.root.style.top = `${top}px`;
    this.root.style.maxHeight = `${Math.max(0, window.innerHeight - top - 8)}px`;
  }

  openGroupDialog(existing = null) {
    const dialog = element("dialog", { className: "na-dialog" });
    const input = element("input", {
      type: "text",
      value: existing?.name ?? "",
      maxLength: 60,
      required: true,
    });
    const error = element("p", { className: "na-error-text", role: "alert" });
    const close = () => dialog.close();
    const saveButton = element("button", {
      type: "button",
      className: "na-button na-button--primary",
      text: "Save group",
    });
    saveButton.addEventListener("click", async () => {
      const name = input.value.trim();
      if (
        !name ||
        this.data.groups.some(
          (group) => group !== existing && group.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        error.textContent = "Enter a unique group name.";
        return;
      }
      if (existing) {
        existing.name = name;
        existing.items.forEach((item) => {
          item.group = name;
        });
      } else {
        this.data.groups.push({ name, collapsed: false, items: [] });
      }
      await this.save();
      close();
      this.rerenderDailies();
    });
    dialog.append(
      element("form", { method: "dialog", className: "na-dialog__card" }, [
        element("h2", { text: existing ? "Edit group" : "Add group" }),
        element("label", { className: "na-field__label" }, ["Group name", input]),
        error,
        element("div", { className: "na-dialog__actions" }, [
          element(
            "button",
            { type: "button", className: "na-button na-button--secondary", onClick: close },
            "Cancel",
          ),
          saveButton,
        ]),
      ]),
    );
    this.mountDialog(dialog);
    input.focus();
  }

  openDailyDialog(group, existing = null) {
    const dialog = element("dialog", { className: "na-dialog" });
    const name = element("input", {
      type: "text",
      value: existing?.name ?? "",
      maxLength: 80,
      required: true,
    });
    const url = element("input", {
      type: "url",
      value: existing?.url ?? "https://www.neopets.com/",
      required: true,
    });
    const iconUrl = element("input", { type: "url", value: existing?.iconUrl ?? "" });
    const cooldown = element("input", {
      type: "text",
      value: existing?.cooldown ?? "daily",
      maxLength: 24,
      required: true,
    });
    const notes = element("input", { type: "text", value: existing?.notes ?? "", maxLength: 140 });
    const error = element("p", { className: "na-error-text", role: "alert" });
    const close = () => dialog.close();
    const saveButton = element("button", {
      type: "button",
      className: "na-button na-button--primary",
      text: existing ? "Save daily" : "Add daily",
    });
    saveButton.addEventListener("click", async () => {
      const candidate = sanitizeDaily(
        {
          id: existing?.id ?? makeStableItemId(name.value, url.value),
          name: name.value,
          url: url.value,
          iconUrl: iconUrl.value,
          cooldown: cooldown.value,
          notes: notes.value,
          group: group.name,
        },
        group.name,
      );
      if (!candidate) {
        error.textContent = "Enter a valid name and an HTTPS www.neopets.com URL.";
        return;
      }
      if (existing) Object.assign(existing, candidate);
      else group.items.push(candidate);
      await this.save();
      close();
      this.rerenderDailies();
    });
    const fields = [
      ["Name", name],
      ["Neopets URL", url],
      ["Official item icon URL (images.neopets.com)", iconUrl],
      ["Cooldown (daily, anytime, 30m, 2h, or 10/day)", cooldown],
      ["Notes", notes],
    ].map(([label, input]) => element("label", { className: "na-field__label" }, [label, input]));
    dialog.append(
      element("form", { method: "dialog", className: "na-dialog__card" }, [
        element("h2", {
          text: existing ? `Edit ${existing.name}` : `Add a daily to ${group.name}`,
        }),
        ...fields,
        error,
        element("div", { className: "na-dialog__actions" }, [
          element(
            "button",
            { type: "button", className: "na-button na-button--secondary", onClick: close },
            "Cancel",
          ),
          saveButton,
        ]),
      ]),
    );
    this.mountDialog(dialog);
    name.focus();
  }

  confirmDailyDeletion(group, item) {
    const dialog = element("dialog", { className: "na-dialog" });
    const close = () => dialog.close();
    const confirm = element("button", {
      type: "button",
      className: "na-button na-button--danger",
      text: "Delete daily",
    });
    confirm.addEventListener("click", async () => {
      group.items = group.items.filter((candidate) => candidate.id !== item.id);
      delete this.data.state[item.id];
      this.data.history = this.data.history.filter((entry) => entry.itemId !== item.id);
      await this.save();
      close();
      this.rerenderDailies();
    });
    dialog.append(
      element("form", { method: "dialog", className: "na-dialog__card" }, [
        element("h2", { text: `Delete ${item.name}?` }),
        element("p", { text: "This removes the routine and its local completion history." }),
        element("div", { className: "na-dialog__actions" }, [
          element(
            "button",
            { type: "button", className: "na-button na-button--secondary", onClick: close },
            "Cancel",
          ),
          confirm,
        ]),
      ]),
    );
    this.mountDialog(dialog);
    confirm.focus();
  }

  attachDragBehavior(handle) {
    let drag = null;
    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button, a, input")) return;
      const rectangle = this.root.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rectangle.left,
        offsetY: event.clientY - rectangle.top,
      };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const left = Math.max(
        4,
        Math.min(window.innerWidth - this.root.offsetWidth - 4, event.clientX - drag.offsetX),
      );
      const top = Math.max(
        4,
        Math.min(
          window.innerHeight - this.minimumVisibleHeight() - 8,
          event.clientY - drag.offsetY,
        ),
      );
      this.root.style.left = `${left}px`;
      this.root.style.right = "auto";
      this.root.style.top = `${top}px`;
      this.root.style.maxHeight = `${window.innerHeight - top - 8}px`;
    });
    handle.addEventListener("pointerup", async (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag = null;
      const rectangle = this.root.getBoundingClientRect();
      this.data.settings.panel.top = Math.round(rectangle.top);
      this.data.settings.panel.right = Math.max(4, Math.round(window.innerWidth - rectangle.right));
      this.root.style.left = "auto";
      this.root.style.right = `${this.data.settings.panel.right}px`;
      await this.save();
    });
  }

  attachResizeBehavior() {
    this.resizeObserver = new ResizeObserver(() => {
      const width = Math.round(this.root.getBoundingClientRect().width);
      if (
        width === this.data.settings.panel.width ||
        width >= window.innerWidth - 17 ||
        width < 340
      )
        return;
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(async () => {
        this.data.settings.panel.width = Math.min(640, Math.max(340, width));
        this.clampToViewport();
        await this.save();
      }, 300);
    });
    this.resizeObserver.observe(this.root);
  }

  cleanup() {
    if (this.viewportHandler) window.removeEventListener("resize", this.viewportHandler);
    if (this.timer) window.clearInterval(this.timer);
    if (this.resizeTimer) window.clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
    this.pricing?.cleanup();
    this.buying?.cleanup();
    this.mainShopBuying?.cleanup();
    for (const dialog of [...this.dialogs]) {
      if (dialog.open) dialog.close();
      else dialog.remove();
    }
    this.dialogs.clear();
  }
}
