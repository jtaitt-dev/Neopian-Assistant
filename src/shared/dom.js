const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const ICON_PATHS = Object.freeze({
  check: ["M5 12.5 10 17l9-10"],
  chevron: ["m7 10 5 5 5-5"],
  close: ["M7 7l10 10M17 7 7 17"],
  external: ["M14 5h5v5M19 5l-8 8", "M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"],
  gear: [
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
    "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.9 3.29-.08-.03a1.7 1.7 0 0 0-1.8.1l-.08.04a1.7 1.7 0 0 0-.9 1.66v.08h-3.8V22a1.7 1.7 0 0 0-.9-1.66l-.08-.04a1.7 1.7 0 0 0-1.8-.1l-.08.03-1.9-3.29.06-.06A1.7 1.7 0 0 0 6.6 15v-.1a1.7 1.7 0 0 0-1.46-1.06H5V10h.14A1.7 1.7 0 0 0 6.6 8.9v-.1a1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.9-3.29.08.03a1.7 1.7 0 0 0 1.8-.1l.08-.04a1.7 1.7 0 0 0 .9-1.66V2h3.8v.08a1.7 1.7 0 0 0 .9 1.66l.08.04a1.7 1.7 0 0 0 1.8.1l.08-.03 1.9 3.29-.06.06A1.7 1.7 0 0 0 19.4 9v.1A1.7 1.7 0 0 0 20.86 10H21v3.8h-.14A1.7 1.7 0 0 0 19.4 15Z",
  ],
  info: ["M12 10v7M12 7h.01", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
  minimize: ["M6 12h12"],
  search: ["m20 20-4.4-4.4", "M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z", "m9 12 2 2 4-4"],
  spark: [
    "M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2Z",
    "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  ],
  trash: ["M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"],
});

export function appendChildren(parent, children) {
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function element(tagName, attributes = {}, children = []) {
  const node = document.createElement(tagName);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === "className") node.className = value;
    else if (name === "text") node.textContent = value;
    else if (name === "style" && typeof value === "string") node.style.cssText = value;
    else if (name === "dataset" && value && typeof value === "object") {
      for (const [key, dataValue] of Object.entries(value)) node.dataset[key] = String(dataValue);
    } else if (name.startsWith("on") && typeof value === "function") {
      node.addEventListener(name.slice(2).toLowerCase(), value);
    } else if (name in node && !name.startsWith("aria")) {
      node[name] = value;
    } else {
      node.setAttribute(
        name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`),
        String(value),
      );
    }
  }
  return appendChildren(node, children);
}

export function icon(name, label = null) {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "na-icon");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  for (const pathData of ICON_PATHS[name] ?? ICON_PATHS.info) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", pathData);
    svg.append(path);
  }
  return svg;
}

export function labeledControl(labelText, control, hint = "") {
  const id = control.id || `na-control-${crypto.randomUUID()}`;
  control.id = id;
  const label = element("label", { className: "na-field__label", htmlFor: id }, labelText);
  const children = [label, control];
  if (hint) children.push(element("span", { className: "na-field__hint", text: hint }));
  return element("div", { className: "na-field" }, children);
}

export function setStatus(node, message, tone = "neutral") {
  node.textContent = message;
  node.dataset.tone = tone;
}
