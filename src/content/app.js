import { BRAND } from "../shared/constants.js";
import { element, icon, setStatus } from "../shared/dom.js";
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

function formatRemaining(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function buttonWithIcon(label, iconName, attributes = {}) {
  return element("button", { type: "button", ...attributes }, [icon(iconName), label]);
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
    this.editing = false;
    this.timer = null;
    this.resizeObserver = null;
    this.resizeTimer = null;
    this.pricing = null;
    this.closedForPage = false;
  }

  save() {
    const snapshot = cloneValue(this.data);
    const task = this.saveQueue.then(() => this.persistData(snapshot));
    this.saveQueue = task.catch(() => undefined);
    return task.then(() => this.data);
  }

  announce(message, tone = "neutral") {
    if (this.status) setStatus(this.status, message, tone);
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
    root.dataset.theme = this.data.settings.theme;
    root.dataset.density = this.data.settings.density;

    const brandMark = element(
      "span",
      { className: "na-brand-mark", ariaHidden: "true" },
      icon("spark"),
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
            onClick: () => chrome.runtime.openOptionsPage(),
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
      ["progress", "Progress"],
      ["pricing", "Auto Pricing"],
    ]) {
      const tab = element("button", {
        type: "button",
        className: "na-tab",
        role: "tab",
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
    this.attachDragBehavior(header);
    this.attachResizeBehavior();
    this.renderActiveTab();
    this.timer = window.setInterval(() => this.refreshVisibleStatus(), 30_000);
  }

  async toggleMinimized() {
    this.data.settings.panel.minimized = !this.data.settings.panel.minimized;
    this.root.classList.toggle("na-shell--minimized", this.data.settings.panel.minimized);
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
    if (!["dailies", "progress", "pricing"].includes(tabId)) return;
    this.activeTab = tabId;
    for (const tab of this.root.querySelectorAll(".na-tab")) {
      tab.setAttribute("aria-selected", String(tab.dataset.tab === tabId));
    }
    this.renderActiveTab();
  }

  renderActiveTab() {
    this.pricing?.cleanup();
    this.pricing = null;
    this.content.replaceChildren();
    if (this.activeTab === "dailies") this.renderDailies();
    if (this.activeTab === "progress") this.renderProgress();
    if (this.activeTab === "pricing") {
      this.pricing = new AutoPricingController({
        data: this.data,
        save: () => this.save(),
        announce: (message, tone) => this.announce(message, tone),
      });
      this.pricing.render(this.content);
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
            onClick: () => chrome.runtime.openOptionsPage(),
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
      this.search = search.value.toLowerCase().trim();
      this.rerenderDailies();
      this.content.querySelector("input[type='search']")?.focus();
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
    this.content.append(toolbar);

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
    const query = this.search;
    for (const group of this.data.groups) {
      const visibleItems = group.items.filter((item) => item.name.toLowerCase().includes(query));
      if (query && visibleItems.length === 0) continue;
      const groupSection = element("section", { className: "na-group" });
      const toggle = element(
        "button",
        {
          type: "button",
          className: "na-group__toggle",
          ariaExpanded: !group.collapsed,
          onClick: async () => {
            group.collapsed = !group.collapsed;
            await this.save();
            this.rerenderDailies();
          },
        },
        element("span", { className: "na-group__title" }, [
          icon("chevron"),
          element("strong", { text: group.name }),
          element("span", { text: String(visibleItems.length) }),
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
      if (!group.collapsed || query) {
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
    this.content.append(groupsContainer, this.createProgressSummary());
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
    const row = element(
      "article",
      { className: `na-daily ${status.complete ? "na-daily--complete" : ""}` },
      [
        element("span", { className: "na-daily__icon-wrap" }, image),
        element("div", { className: "na-daily__main" }, [
          element("strong", { text: item.name }),
          element("span", { className: "na-daily__status", text: statusText }),
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
        element(
          "button",
          {
            type: "button",
            className: `na-check-button ${status.complete ? "na-check-button--complete" : ""}`,
            ariaLabel: status.complete ? `Reset ${item.name}` : `Mark ${item.name} complete`,
            title: status.complete ? "Reset completion" : "Mark complete",
            onClick: () => this.toggleDaily(item, status),
          },
          icon("check"),
        ),
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
              onClick: () => this.moveDaily(group, itemIndex, -1),
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
              onClick: () => this.moveDaily(group, itemIndex, 1),
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
      return `Available in ${formatRemaining(status.availableAt - Date.now())}`;
    }
    if (status.complete) return "Completed";
    const cooldown = parseCooldown(item.cooldown);
    if (cooldown.type === "count" && status.count > 0)
      return `${status.count} of ${status.limit} completed`;
    return item.notes || "Ready";
  }

  async toggleDaily(item, status) {
    if (status.complete) {
      this.data.state[item.id] = { completed: 0, lastCompleted: null, dateKey: null };
      this.data.history = this.data.history.filter((entry) => entry.itemId !== item.id);
      await this.save();
      this.announce(`${item.name} was reset.`, "neutral");
      this.renderActiveTab();
      return;
    }
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
    this.announce(`${item.name} marked complete.`, "success");
    this.renderActiveTab();
  }

  createProgressSummary() {
    const items = this.data.groups.flatMap((group) => group.items);
    const completed = items.filter(
      (item) => getDailyStatus(item, this.data.state[item.id]).complete,
    ).length;
    const percent = items.length === 0 ? 0 : Math.round((completed / items.length) * 100);
    return element("section", { className: "na-progress-summary", ariaLabel: "Today's progress" }, [
      element(
        "div",
        { className: "na-progress-ring", style: `--na-progress:${percent * 3.6}deg` },
        [element("strong", { text: `${completed}/${items.length}` })],
      ),
      element("div", {}, [
        element("strong", { text: "Today's progress" }),
        element("span", { text: `${percent}% manually marked complete` }),
        element("progress", { value: completed, max: Math.max(1, items.length) }),
      ]),
    ]);
  }

  renderProgress() {
    const itemsById = new Map(
      this.data.groups.flatMap((group) => group.items).map((item) => [item.id, item]),
    );
    const today = getNeopianDateKey();
    const todayEntries = this.data.history.filter(
      (entry) => getNeopianDateKey(new Date(entry.timestamp)) === today,
    );
    const uniqueToday = new Set(todayEntries.map((entry) => entry.itemId));
    this.content.append(
      element("div", { className: "na-section-heading" }, [
        element("div", {}, [
          element("h2", { text: "Progress" }),
          element("p", { text: "Completion history is stored locally in this browser." }),
        ]),
      ]),
      this.createProgressSummary(),
      element("section", { className: "na-stat-strip" }, [
        element("div", {}, [
          element("strong", { text: uniqueToday.size }),
          element("span", { text: "Unique routines today" }),
        ]),
        element("div", {}, [
          element("strong", { text: todayEntries.length }),
          element("span", { text: "Completion marks today" }),
        ]),
      ]),
      element("section", { className: "na-history" }, [
        element("h3", { text: "Recent completion history" }),
        todayEntries.length === 0
          ? element("p", {
              className: "na-empty-copy",
              text: "Nothing has been marked complete today.",
            })
          : element(
              "ol",
              {},
              todayEntries.slice(0, 20).map((entry) =>
                element("li", {}, [
                  element("span", { text: itemsById.get(entry.itemId)?.name ?? "Removed routine" }),
                  element("time", {
                    dateTime: new Date(entry.timestamp).toISOString(),
                    text: new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    }),
                  }),
                ]),
              ),
            ),
      ]),
    );
  }

  rerenderDailies() {
    if (this.activeTab !== "dailies") return;
    this.content.replaceChildren();
    this.renderDailies();
  }

  refreshVisibleStatus() {
    this.rerenderDailies();
  }

  async moveDaily(group, index, direction) {
    const target = index + direction;
    if (target < 0 || target >= group.items.length) return;
    [group.items[index], group.items[target]] = [group.items[target], group.items[index]];
    await this.save();
    this.rerenderDailies();
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
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
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
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
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
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
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
      const top = Math.max(4, Math.min(window.innerHeight - 56, event.clientY - drag.offsetY));
      this.root.style.left = `${left}px`;
      this.root.style.right = "auto";
      this.root.style.top = `${top}px`;
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
    this.resizeObserver = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect.width ?? this.data.settings.panel.width);
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(async () => {
        this.data.settings.panel.width = Math.min(640, Math.max(340, width));
        await this.save();
      }, 300);
    });
    this.resizeObserver.observe(this.root);
  }

  cleanup() {
    if (this.timer) window.clearInterval(this.timer);
    if (this.resizeTimer) window.clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
    this.pricing?.cleanup();
  }
}
