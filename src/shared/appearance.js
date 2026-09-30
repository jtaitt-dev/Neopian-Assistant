import { element } from "./dom.js";

export function applyAppearance(node, settings) {
  node.dataset.theme = settings.theme;
  node.dataset.density = settings.density;
}

export function showThemedDialog(dialog, settings) {
  const previousFocus = document.activeElement;
  applyAppearance(dialog, settings);
  const heading = dialog.querySelector("h2");
  if (heading) {
    heading.id ||= `na-dialog-${crypto.randomUUID()}`;
    dialog.setAttribute("aria-labelledby", heading.id);
  }
  dialog.addEventListener(
    "close",
    () => {
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      else document.getElementById("neopian-assistant-root")?.focus({ preventScroll: true });
    },
    { once: true },
  );
  dialog.showModal();
}

export function configureTool(panel, { summary, open, onToggle }) {
  const modes = element("div", { className: "na-tool-modes" });
  for (const row of [...panel.children].slice(0, 2)) {
    row.querySelector("strong").textContent = modes.childElementCount ? "Dry run" : "Enabled";
    modes.append(row);
    if (modes.childElementCount === 2) {
      const input = row.querySelector("input");
      const badge = element("span", { className: "na-mode-badge" });
      const update = () => {
        badge.textContent = input.checked ? "Dry run" : "Live mode";
        badge.dataset.live = String(!input.checked);
      };
      input.addEventListener("change", update);
      update();
      modes.prepend(badge);
    }
  }
  const disclosure = element("details", { className: "na-configure", open });
  disclosure.append(
    element("summary", {}, [
      element("strong", { text: "Configure" }),
      element("span", { className: "na-configure__summary", text: summary }),
    ]),
    panel,
  );
  disclosure.addEventListener("toggle", () => onToggle(disclosure.open));
  return element("div", { className: "na-tool-configuration" }, [modes, disclosure]);
}

export function moveToolNotes(container, configuration) {
  const notes = [...container.querySelectorAll(":scope > .na-notice")].filter(
    (node) =>
      node.classList.contains("na-notice--warning") || /Monitoring is/.test(node.textContent),
  );
  if (!notes.length) return;
  const disclosure = element("details", { className: "na-operation-details" }, [
    element("summary", { text: "How this tool works" }),
    ...notes,
  ]);
  configuration.querySelector("details").append(disclosure);
}

export function enhanceReviewDialog(dialog) {
  const summary = dialog.querySelector(".na-operation-summary");
  if (!summary) return;
  const technical = [...summary.children].filter((row) =>
    /operation|review|object|fingerprint|listing id/i.test(
      row.querySelector("dt")?.textContent ?? "",
    ),
  );
  if (technical.length) {
    const details = element("details", { className: "na-operation-details" }, [
      element("summary", { text: "Operation details" }),
      element("dl", { className: "na-operation-summary" }, technical),
    ]);
    summary.after(details);
  }
}
