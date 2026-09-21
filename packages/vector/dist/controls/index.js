/** Reusable, dependency-free DOM controls and command registry. */
const paths = {
  pointer: "M4 3l7 17 2-7 7-2z",
  nodes: "M5 5h14v14H5z M3 3h4v4H3z M17 17h4v4h-4z",
  pen: "M4 20l4-10L18 2l4 4-8 10z M4 20l7-7 M8 10l6 6",
  pencil: "M4 16L16 4l4 4L8 20H4z M14 6l4 4",
  rect: "M4 4h16v16H4z",
  ellipse: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  polygon: "M12 3l9 7-3 11H6L3 10z",
  star: "M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  text: "M4 4h16M12 4v16M8 20h8",
  line: "M4 20L20 4",
  hand: "M8 12V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v10q0 7-7 7-4 0-6-4l-4-6q1-3 5 0z",
  zoom: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0M6 10h8M10 6v8",
  comment: "M4 4h16v13H9l-5 4zM8 8h8M8 12h5",
  undo: "M8 5L3 10l5 5M3 10h11a6 6 0 0 1 0 12",
  redo: "M16 5l5 5-5 5m5-5H10a6 6 0 0 0 0 12",
  save: "M4 3h14l3 3v15H3V3zM7 3v7h10V3M7 21v-7h10v7",
  folder: "M3 6h7l2 3h9v11H3z",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  upload: "M12 16V4M7 9l5-5 5 5M4 17v4h16v-4",
  plus: "M12 5v14M5 12h14",
  close: "M5 5l14 14M19 5L5 19",
  chevron: "M8 4l8 8-8 8",
  down: "M6 9l6 6 6-6",
  eye: "M2 12q10-14 20 0-10 14-20 0M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  lock: "M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4",
  unlock: "M5 10h14v11H5zM8 10V6a4 4 0 0 1 8-1",
  layers: "M12 3l10 6-10 6L2 9zM2 13l10 6 10-6M2 17l10 6 10-6",
  search: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  grid: "M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18",
  magnet: "M5 3v10a7 7 0 0 0 14 0V3h-5v10a2 2 0 0 1-4 0V3z",
  alignLeft: "M5 3v18M9 6h12v4H9zM9 14h8v4H9z",
  alignCenter: "M12 2v20M4 6h16v4H4zM7 14h10v4H7z",
  alignRight: "M19 3v18M3 6h12v4H3zM7 14h8v4H7z",
  alignTop: "M3 5h18M6 9h4v12H6zM14 9h4v8h-4z",
  alignMiddle: "M2 12h20M6 4h4v16H6zM14 7h4v10h-4z",
  alignBottom: "M3 19h18M6 3h4v12H6zM14 7h4v8h-4z",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M9 10v7M15 10v7",
  copy: "M8 8h13v13H8zM16 8V3H3v13h5",
  group: "M3 3h7v7H3zM14 14h7v7h-7zM14 3h7v7M3 14v7h7",
  settings:
    "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  check: "M4 12l5 5L20 6",
  cloud: "M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5 5 0 0 1 0 11z",
  image: "M3 3h18v18H3zM3 17l6-7 5 5 3-3 4 5M17 7h.01",
  share:
    "M8 12l9-6M8 13l9 5M8 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M22 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0M22 20a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  help: "M9 8a3 3 0 1 1 4 3l-1 2M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  moon: "M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10",
  rotate: "M4 8V3m0 5h5M4 8a9 9 0 1 1-1 9",
  palette:
    "M12 2a10 10 0 1 0 0 20h2q3-1 1-4-1-2 2-3h2q5-1 2-7-3-6-9-6M7 8h.01M12 6h.01M17 8h.01M6 13h.01",
  history: "M3 3v6h6M3 9a9 9 0 1 1 0 7M12 7v6l4 2",
  outline: "M4 4h16v16H4zM8 8h8v8H8z",
  flip: "M12 2v20M8 5v14l-6-7zM16 5v14l6-7z",
  union: "M3 3h11v7h7v11H10v-7H3z",
  scissors:
    "M9 9l12 12M9 15L21 3M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
};
export function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.rect}"/></svg>`;
}
export const htmlEscape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function button(action, title, ic, extra = "") {
  return `<button type="button" class="icon-button ${extra}" data-action="${action}" title="${htmlEscape(title)}" aria-label="${htmlEscape(title)}">${icon(ic)}</button>`;
}
export class CommandRegistry {
  constructor() {
    this.commands = new Map();
  }
  register(id, title, execute, shortcut = "") {
    this.commands.set(id, { id, title, execute, shortcut });
    return this;
  }
  execute(id, ...args) {
    const c = this.commands.get(id);
    if (!c) throw new Error(`Unknown command ${id}`);
    return c.execute(...args);
  }
  search(q = "") {
    return [...this.commands.values()].filter((c) =>
      c.title.toLowerCase().includes(q.toLowerCase()),
    );
  }
}
export function toast(message, error = false) {
  const el = document.createElement("div");
  el.className = `toast ${error ? "error" : ""}`;
  el.setAttribute("role", error ? "alert" : "status");
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 4500);
}
export function dialog(title, content, footer = "") {
  const el = document.createElement("dialog");
  el.className = "studio-dialog";
  el.innerHTML = `<header><h2>${htmlEscape(title)}</h2>${button("close-dialog", "Close", "close")}</header><div class="dialog-body">${content}</div>${footer ? `<footer>${footer}</footer>` : ""}`;
  document.body.append(el);
  el.querySelector('[data-action="close-dialog"]').onclick = () => el.close();
  el.addEventListener("close", () => el.remove());
  el.addEventListener("click", (e) => {
    if (e.target === el) el.close();
  });
  el.showModal();
  return el;
}
