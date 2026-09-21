import { installStaticUI, isStatic } from "./static.js";
import { installAdvancedUI } from "./advanced/ui.js";
import {
  restoreFonts,
  matchingFont,
  flowDocument,
} from "./typography/index.js";
import { fromBase64 } from "./color/index.js";
import {
  DocumentStore,
  createDocument,
  createNode,
  uid,
  clone,
  clamp,
  bounds,
  unionBounds,
  Matrix,
  objectMatrix,
  intersects,
  PluginRegistry,
  pageLayout,
  effectiveLocked,
  effectiveVisible,
  outerGroup,
  inGroup,
  ancestors,
} from "./core/index.js";
import { sampleDocument } from "./core/sample.js";
import {
  SVGRenderer,
  WebGPUCompositor,
  toSVG,
  pathData,
  escapeXML,
} from "./render/index.js";
import {
  icon,
  button,
  htmlEscape as h,
  toast,
  dialog,
  CommandRegistry,
} from "./controls/index.js";
import {
  download,
  safeName,
  rasterize,
  exportPDF,
  readFile,
  booleanOperation,
  convertToPath,
  editableNodes,
  smoothPath,
  breakApart,
  importFont,
  textToOutlines,
  shapeTextToPath,
} from "./io/index.js";
import { StudioClient as CollaborationClient } from "./collab/client.js";
const $ = (s, el = document) => el.querySelector(s),
  $$ = (s, el = document) => [...el.querySelectorAll(s)];
const store = new DocumentStore(sampleDocument()),
  commands = new CommandRegistry(),
  plugins = new PluginRegistry();
let tool = "pointer",
  zoom = 0.6,
  pan = { x: 130, y: 56 },
  gesture = null,
  outline = false,
  grid = false,
  snap = true,
  fill = "#17aa91",
  stroke = "none",
  activeTab = "design",
  clipboard = [],
  pen = null,
  space = false,
  inspectorTimer,
  gpuTimer,
  selectionNode = -1,
  fonts = new Map(),
  isolate = null,
  cloudAvailable = false,
  lastCursor = { x: 0, y: 0 };
const palette = [
  "#ffffff",
  "#f3f1e9",
  "#dce4dd",
  "#b1bdb7",
  "#7b8b82",
  "#4d6056",
  "#233d32",
  "#112a20",
  "#000000",
  "#c6ec74",
  "#a9d643",
  "#5ba660",
  "#17aa91",
  "#007b60",
  "#00775c",
  "#054734",
  "#b5e7e3",
  "#40c6c1",
  "#079ca7",
  "#116b85",
  "#194071",
  "#5d5bdd",
  "#9882e6",
  "#ceabe9",
  "#e897c6",
  "#ef6f8b",
  "#df5351",
  "#f48251",
  "#fbbf4f",
  "#f8df83",
];
const tools = [
  ["pointer", "Pick tool", "V"],
  ["nodes", "Shape / node tool", "A"],
  ["pen", "Bézier pen", "P"],
  ["pencil", "Freehand", "B"],
  ["line", "Line", "L"],
  ["rect", "Rectangle", "R"],
  ["ellipse", "Ellipse", "E"],
  ["polygon", "Polygon", "Y"],
  ["star", "Star", "S"],
  ["text", "Text", "T"],
  ["image", "Import image", "I"],
  ["comment", "Comment", "C"],
  ["hand", "Pan", "H"],
  ["zoom", "Zoom", "Z"],
];
const menuData = {
  File: [
    ["new", "New document", "Ctrl N"],
    ["open", "Open / import…", "Ctrl O"],
    ["projects", (isStatic ? "Browser projects" : "Cloud projects"), ""],
    ["save", (isStatic ? "Save in browser" : "Save to cloud"), "Ctrl S"],
    ["save-file", "Download Vellum file", ""],
    ["export", "Export…", "Ctrl Shift E"],
    ["print", "Print", "Ctrl P"],
  ],
  Edit: [
    ["undo", "Undo", "Ctrl Z"],
    ["redo", "Redo", "Ctrl Shift Z"],
    ["cut", "Cut", "Ctrl X"],
    ["copy", "Copy", "Ctrl C"],
    ["paste", "Paste", "Ctrl V"],
    ["duplicate", "Duplicate", "Ctrl D"],
    ["delete", "Delete", "Del"],
    ["select-all", "Select all", "Ctrl A"],
    ["command", "Find a command…", "Ctrl K"],
  ],
  View: [
    ["fit", "Fit page", "1"],
    ["actual", "Actual size", "2"],
    ["fit-selection", "Fit selection", "3"],
    ["zoom-in", "Zoom in", "+"],
    ["zoom-out", "Zoom out", "−"],
    ["toggle-grid", "Show grid", ""],
    ["toggle-snap", "Snap to objects", ""],
    ["toggle-outline", "Outline view", ""],
    ["toggle-dark", "Dark workspace", ""],
    ["pages", "Pages overview", ""],
  ],
  Object: [
    ["group", "Group", "Ctrl G"],
    ["ungroup", "Ungroup", "Ctrl Shift G"],
    ["isolate", "Edit selected group", ""],
    ["front", "Bring to front", "]"],
    ["back", "Send to back", "["],
    ["flip-x", "Flip horizontally", ""],
    ["flip-y", "Flip vertically", ""],
    ["convert", "Convert to curves", "Ctrl Q"],
    ["break-apart", "Break curves apart", ""],
    ["union", "Weld / union", ""],
    ["subtract", "Trim / subtract", ""],
    ["intersect", "Intersect", ""],
    ["exclude", "Exclude overlap", ""],
  ],
  Effects: [
    ["shadow", "Drop shadow", ""],
    ["gradient", "Gradient fill", ""],
    ["clip", "Clip to ellipse", ""],
    ["contour", "Contour outline", ""],
    ["blend", "Blend selected objects", ""],
    ["smooth", "Smooth curve", ""],
    ["symmetry", "Mirror duplicate", ""],
  ],
  Text: [
    ["edit-text", "Edit text", ""],
    ["font-import", "Import font…", ""],
    ["text-outlines", "Convert text to outlines", ""],
  ],
  Window: [
    ["tab-design", "Design inspector", ""],
    ["tab-objects", "Objects docker", ""],
    ["tab-comments", "Comments", ""],
    ["history", "History & revisions", ""],
    ["styles", "Saved styles", ""],
  ],
  Help: [
    ["help", "Keyboard shortcuts & guide", ""],
    ["about", "About Vellum", ""],
  ],
};
$("#studio").innerHTML =
  `<header class="titlebar"><a class="brand" href="./" aria-label="Vellum Studio"><span class="brand-mark">v</span><span>vellum<span class="brand-light">studio</span></span></a><div class="title-divider"></div><button class="document-title" data-action="rename"><span class="document-dot"></span><span id="document-title"></span>${icon("down", 14)}</button><span class="save-status" id="save-status">Local draft</span><div class="title-spacer"></div><div id="people" class="people"><span class="avatar" title="You">Y</span></div>${button("history", "Version history", "history")}<button class="secondary-button share-button" data-action="share">${icon("share", 16)} Share</button><button class="primary-button" data-action="export">Export ${icon("down", 14)}</button></header>
<nav class="menubar" aria-label="Application menu">${Object.keys(menuData)
    .map((m) => `<button class="menu-trigger" data-menu="${m}">${m}</button>`)
    .join(
      "",
    )}<span class="menu-spacer"></span><span class="workspace-label">Design workspace</span>${button("toggle-dark", "Switch light or dark workspace", "moon")}</nav>
<div class="contextbar"><div class="toolbar-cluster">${button("new", "New document", "plus")}${button("open", "Open / import (Ctrl O)", "folder")}${button("save", (isStatic ? "Save in browser (Ctrl S)" : "Save to cloud (Ctrl S)"), "save")}</div><div class="toolbar-cluster">${button("undo", "Undo (Ctrl Z)", "undo")}${button("redo", "Redo (Ctrl Shift Z)", "redo")}</div><div class="context-fields" id="context-fields"></div><div class="context-right">${button("toggle-grid", "Show grid", "grid")}${button("toggle-snap", "Snap to objects", "magnet", "active")}${button("toggle-outline", "Outline view", "outline")}<span class="zoom-control"><button data-action="zoom-out" aria-label="Zoom out">−</button><button id="zoom-label" data-action="fit">60%</button><button data-action="zoom-in" aria-label="Zoom in">+</button></span></div></div>
<main class="workspace"><aside class="toolbox" aria-label="Drawing tools">${tools.map(([id, name, key], i) => `${i === 10 || i === 12 ? '<div class="tool-divider"></div>' : ""}<button class="tool ${id === "pointer" ? "active" : ""}" data-tool="${id}" title="${name} (${key})" aria-label="${name}" aria-pressed="${id === "pointer"}">${icon(id, 20)}</button>`).join("")}<div class="toolbox-spacer"></div><div class="fill-overlap"><input id="tool-fill" aria-label="Default fill color" type="color" value="${fill}"><input id="tool-stroke" aria-label="Default stroke color" type="color" value="#233d32"></div>${button("help", "Help and shortcuts", "help")}</aside>
<section class="canvas-area" aria-label="Design canvas"><div class="ruler-corner">px</div><div class="ruler horizontal" id="ruler-x"></div><div class="ruler vertical" id="ruler-y"></div><div class="canvas-breadcrumb"><span id="page-breadcrumb"></span><span id="isolation-breadcrumb"></span></div><div class="stage" id="stage" tabindex="0" aria-label="Vector canvas. Use drawing tools or drag objects to edit."><div class="world" id="world"><div class="page-label" id="page-label"></div><div class="artboard" id="artboard"><svg id="scene" xmlns="http://www.w3.org/2000/svg"></svg><canvas id="gpu-canvas" aria-hidden="true"></canvas><svg id="overlay" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg></div><div class="companion" id="companion"></div></div><div id="cursor-overlay"></div></div><div class="canvas-hint" id="canvas-hint">${icon("pointer", 14)} Select objects to start editing <kbd>V</kbd></div><div class="pagebar"><div id="page-tabs"></div><button class="add-page" data-action="add-page" title="Add page" aria-label="Add page">+</button><div class="pagebar-spacer"></div>${button("pages", "Pages overview", "layers")}<span id="page-count"></span></div></section>
<aside class="docker"><div class="docker-tabs" role="tablist"><button class="active" data-tab="design" role="tab" aria-selected="true">Design</button><button data-tab="objects" role="tab" aria-selected="false">Objects</button><button data-tab="comments" role="tab" aria-selected="false">Comments <span id="comment-count"></span></button></div><div class="docker-content" id="docker-content"></div></aside><aside class="color-strip" aria-label="Document color palette"><button class="no-color" data-color="none" aria-label="No fill" title="No fill"></button>${palette.map((c) => `<button style="background:${c}" data-color="${c}" aria-label="Fill ${c}" title="${c} · Shift-click for stroke"></button>`).join("")}${button("styles", "Color styles", "plus")}</aside></main>
<footer class="statusbar"><span class="status-left" id="selection-status">Ready</span><span class="status-mid" id="coordinates">X: 0 · Y: 0</span><span class="render-status" id="render-status">SVG renderer</span><span class="status-divider"></span><span>sRGB</span><span class="status-divider"></span><span id="dimensions"></span></footer><input type="file" id="file-input" hidden accept=".vellum,.json,.svg,.cdr,image/png,image/jpeg,image/webp,image/gif"><input type="file" id="font-input" hidden accept=".ttf,.otf,.woff">`;
const scene = $("#scene"),
  overlay = $("#overlay"),
  stage = $("#stage"),
  world = $("#world"),
  artboard = $("#artboard");
const renderer = new SVGRenderer(scene),
  gpu = new WebGPUCompositor(
    $("#gpu-canvas"),
    (s) => ($("#render-status").textContent = s),
  ),
  collab = new CollaborationClient(store);
function number(v) {
  return Math.round(v * 100) / 100;
}
function field(label, prop, value, min = "", max = "", step = "1") {
  return `<label class="number-field"><span>${label}</span><input type="number" data-prop="${prop}" value="${number(value || 0)}" ${min !== "" ? `min="${min}"` : ""} ${max !== "" ? `max="${max}"` : ""} step="${step}" aria-label="${label}"></label>`;
}
function setTool(next) {
  if (pen) finishPen();
  tool = next;
  selectionNode = -1;
  $$("[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === next);
    b.setAttribute("aria-pressed", b.dataset.tool === next);
  });
  stage.dataset.tool = tool;
  $("#canvas-hint").innerHTML =
    `${icon(tool, 14)} ${h({ pointer: "Drag to move · Shift to select multiple · Alt to duplicate", nodes: "Select a curve · Drag nodes or Bézier handles", pen: "Click to add points · Drag for curves · Enter to finish", pencil: "Draw a freehand curve · Shift for a finer stroke", text: "Click on the page to add text", comment: "Click on the page to leave a comment", hand: "Drag to pan the workspace", zoom: "Click to zoom in · Alt-click to zoom out" }[tool] || "Click and drag to draw · Hold Shift to constrain")}`;
  renderOverlay();
}
function draw() {
  renderer.render(store.doc, store.page.id, outline);
  const p = store.page;
  artboard.style.width = p.width + "px";
  artboard.style.height = p.height + "px";
  overlay.setAttribute("viewBox", `0 0 ${p.width} ${p.height}`);
  $("#page-label").textContent = p.name;
  $("#page-breadcrumb").textContent = p.name;
  $("#document-title").textContent = store.doc.name;
  $("#dimensions").textContent = `${p.width} × ${p.height} px`;
  $("#page-count").textContent =
    `${store.doc.pages.indexOf(p) + 1} / ${store.doc.pages.length}`;
  $("#page-tabs").innerHTML = store.doc.pages
    .map(
      (p, i) =>
        `<button class="page-tab ${p.id === store.page.id ? "active" : ""}" data-page="${p.id}"><span>${i + 1}</span>${h(p.name.replace(/^\d+ · /, ""))}</button>`,
    )
    .join("");
  const layout = pageLayout(store.doc),
    position = layout.find((v) => v.id === p.id);
  artboard.style.left = position.x + "px";
  $("#page-label").style.left = position.x + "px";
  const companion = $("#companion");
  companion.style.left = "0";
  companion.style.width = "0";
  companion.innerHTML = layout
    .filter((v) => v.id !== p.id)
    .map(
      (v) =>
        `<div class="spread-page" style="left:${v.x}px;width:${v.width}px;height:${v.height}px"><div class="page-label">${h(store.doc.pages.find((p) => p.id === v.id).name)}</div>${toSVG(store.doc, v.id)}</div>`,
    )
    .join("");
  updateCamera();
  renderOverlay();
  clearTimeout(gpuTimer);
  gpu.invalidate();
  if (
    !gesture &&
    !pen &&
    !store.nodes.some((n) => n.type === "text" && fonts.has(n.fontFamily))
  )
    gpuTimer = setTimeout(
      () =>
        gpu.render(
          toSVG(store.doc, p.id, { outline }),
          p.width,
          p.height,
          zoom,
        ),
      180,
    );
}
function updateCamera() {
  world.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
  $("#zoom-label").textContent = Math.round(zoom * 100) + "%";
  artboard.classList.toggle("show-grid", grid);
  artboard.style.setProperty("--grid-size", "20px");
  renderRulers();
}
function renderRulers() {
  const step = zoom < 0.4 ? 200 : zoom < 0.85 ? 100 : zoom < 2 ? 50 : 20;
  const activePageOrigin = pageLayout(store.doc).find(
    (p) => p.id === store.pageId,
  ) || { x: 0 };
  let x = "",
    y = "";
  for (
    let i = Math.floor(-pan.x / zoom / step) * step;
    i < (stage.clientWidth - pan.x) / zoom;
    i += step
  )
    x += `<span style="left:${pan.x + i * zoom}px">${i - activePageOrigin.x}</span>`;
  for (
    let i = Math.floor(-pan.y / zoom / step) * step;
    i < (stage.clientHeight - pan.y) / zoom;
    i += step
  )
    y += `<span style="top:${pan.y + i * zoom}px">${i}</span>`;
  $("#ruler-x").innerHTML = x;
  $("#ruler-y").innerHTML = y;
}
function fit(selection = false) {
  const p = store.page,
    b =
      selection && store.selected.length
        ? unionBounds(store.selected)
        : { x: 0, y: 0, width: p.width, height: p.height };
  zoom = clamp(
    Math.min(
      (stage.clientWidth - 140) / b.width,
      (stage.clientHeight - 100) / b.height,
    ),
    0.03,
    8,
  );
  pan = {
    x:
      (stage.clientWidth - b.width * zoom) / 2 -
      (b.x + pageLayout(store.doc).find((v) => v.id === p.id).x) * zoom,
    y: (stage.clientHeight - b.height * zoom) / 2 - b.y * zoom,
  };
  draw();
}
function zoomAt(factor, x = stage.clientWidth / 2, y = stage.clientHeight / 2) {
  const next = clamp(zoom * factor, 0.03, 16);
  pan.x = x - ((x - pan.x) * next) / zoom;
  pan.y = y - ((y - pan.y) * next) / zoom;
  zoom = next;
  draw();
}
function pagePoint(e) {
  const r = stage.getBoundingClientRect();
  return {
    x:
      (e.clientX - r.left - pan.x) / zoom -
      (pageLayout(store.doc).find((p) => p.id === store.pageId)?.x || 0),
    y: (e.clientY - r.top - pan.y) / zoom,
  };
}
function renderOverlay() {
  const ns = store.selected.filter(
      (n) => n.pageId === store.page.id && n.visible !== false,
    ),
    s = 1 / zoom;
  let content = "";
  if (ns.length) {
    const b = unionBounds(ns);
    content += `<rect class="selection-box" x="${b.x}" y="${b.y}" width="${Math.max(1, b.width)}" height="${Math.max(1, b.height)}" stroke-width="${s}"/>`;
    if (tool !== "nodes") {
      for (const [key, x, y] of [
        ["nw", b.x, b.y],
        ["n", b.x + b.width / 2, b.y],
        ["ne", b.x + b.width, b.y],
        ["w", b.x, b.y + b.height / 2],
        ["e", b.x + b.width, b.y + b.height / 2],
        ["sw", b.x, b.y + b.height],
        ["s", b.x + b.width / 2, b.y + b.height],
        ["se", b.x + b.width, b.y + b.height],
      ])
        content += `<rect data-handle="${key}" x="${x - 3.5 * s}" y="${y - 3.5 * s}" width="${7 * s}" height="${7 * s}" fill="white" stroke="#0a9b82" stroke-width="${s}"/>`;
      content += `<path d="M${b.x + b.width / 2} ${b.y}v${-24 * s}" stroke="#0a9b82" stroke-width="${s}"/><circle data-handle="rotate" cx="${b.x + b.width / 2}" cy="${b.y - 27 * s}" r="${4 * s}" fill="white" stroke="#0a9b82" stroke-width="${s}"/><rect x="${b.x + b.width / 2 - 37 * s}" y="${b.y + b.height + 10 * s}" rx="${3 * s}" width="${74 * s}" height="${19 * s}" fill="#087f68"/><text x="${b.x + b.width / 2}" y="${b.y + b.height + 23 * s}" text-anchor="middle" font-family="Arial" font-size="${10 * s}" fill="white">${number(b.width)} × ${number(b.height)}</text>`;
    }
    if (tool === "nodes" && ns.length === 1 && ns[0].points) {
      const n = ns[0],
        m = objectMatrix(n);
      n.points.forEach((p, i) => {
        const a = Matrix.point(m, p);
        for (const key of ["in", "out"])
          if (p[key]) {
            const b = Matrix.point(m, p[key]);
            content += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#28a795" stroke-width="${s}"/><circle data-node-index="${i}" data-control="${key}" cx="${b.x}" cy="${b.y}" r="${3 * s}" fill="white" stroke="#0a9b82" stroke-width="${s}"/>`;
          }
        content += `<rect data-node-index="${i}" x="${a.x - 4 * s}" y="${a.y - 4 * s}" width="${8 * s}" height="${8 * s}" fill="${selectionNode === i ? "#087f68" : "white"}" stroke="#087f68" stroke-width="${s}"/>`;
      });
    }
  }
  if (gesture?.type === "marquee") {
    const b = gesture.box;
    content += `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#16ad9022" stroke="#087f68" stroke-width="${s}"/>`;
  }
  for (const g of store.doc.guides || [])
    if (!g.pageId || g.pageId === store.page.id)
      content += `<line ${g.axis === "x" ? `x1="${g.value}" x2="${g.value}" y1="-5000" y2="5000"` : `y1="${g.value}" y2="${g.value}" x1="-5000" x2="5000"`} stroke="#30a7d8" stroke-width="${s}" stroke-dasharray="${4 * s} ${4 * s}"/>`;
  if (gesture?.guides)
    for (const g of gesture.guides)
      content += `<line ${g.axis === "x" ? `x1="${g.value}" x2="${g.value}" y1="0" y2="${store.page.height}"` : `y1="${g.value}" y2="${g.value}" x1="0" x2="${store.page.width}"`} stroke="#df5c9b" stroke-width="${s}"/>`;
  if (pen) {
    content += `<path d="${pathData({ points: pen.points })}" fill="none" stroke="#087f68" stroke-width="${1.5 * s}"/>`;
    pen.points.forEach(
      (p) =>
        (content += `<circle cx="${p.x}" cy="${p.y}" r="${3 * s}" fill="#087f68"/>`),
    );
  }
  overlay.innerHTML = content;
  $("#selection-status").textContent =
    ns.length === 1
      ? `${ns[0].name} · ${ns[0].type}`
      : ns.length
        ? `${ns.length} objects selected`
        : `${store.nodes.length} objects · ${store.page.name}`;
}
function inspect() {
  const ns = store.selected,
    n = ns[0],
    b = ns.length
      ? unionBounds(ns)
      : { x: 0, y: 0, width: store.page.width, height: store.page.height };
  $("#context-fields").innerHTML = ns.length
    ? `${field("X", "x", b.x)}${field("Y", "y", b.y)}<span class="mini-divider"></span>${field("W", "width", b.width, 1)}${field("H", "height", b.height, 1)}${button("lock-aspect", "Constrain proportions", "lock", window.vellumAspect ? "active" : "")}${field("↻", "rotation", n.rotation || 0, -360, 360)}`
    : `<span class="context-name">${icon("pointer", 16)} Pick tool</span><span class="mini-divider"></span><button class="text-button" data-action="page-settings">${store.page.width} × ${store.page.height} px ${icon("down", 13)}</button><span class="context-muted">No objects selected</span>`;
  if (activeTab === "objects") {
    renderObjects();
    return;
  }
  if (activeTab === "comments") {
    renderComments();
    return;
  }
  $("#docker-content").innerHTML =
    `<section class="inspector-section"><div class="section-heading"><h3>${n ? (ns.length > 1 ? `${ns.length} objects` : h(n.name)) : "Page properties"}</h3>${button(n ? "rename-object" : "page-settings", n ? "Rename object" : "Page settings", "settings")}</div><div class="muted subtitle">${n ? (n.type === "path" ? "Curve · " + (n.points?.length || "compound") + " nodes" : h(n.type[0].toUpperCase() + n.type.slice(1))) : "Artboard · " + store.page.width + " × " + store.page.height + " px"}</div>${
      n
        ? `<div class="alignment-row">${[
            ["left", "alignLeft"],
            ["center", "alignCenter"],
            ["right", "alignRight"],
            ["top", "alignTop"],
            ["middle", "alignMiddle"],
            ["bottom", "alignBottom"],
          ]
            .map(([a, i]) => button("align-" + a, "Align " + a, i))
            .join(
              "",
            )}</div><div class="property-grid">${field("X", "x", b.x)}${field("Y", "y", b.y)}${field("W", "width", b.width, 1)}${field("H", "height", b.height, 1)}</div><div class="property-grid">${field("Rotation", "rotation", n.rotation || 0, -360, 360)}${field("Corner", "rx", n.rx || 0, 0)}</div>`
        : `<div class="page-preview">${toSVG(store.doc, store.page.id)}</div><button class="secondary-button full" data-action="page-settings">Resize page</button>`
    }</section>
 <section class="inspector-section"><div class="section-heading"><h3>${n ? "Appearance" : "Canvas"}</h3>${n ? button("styles", "Save or apply style", "plus") : ""}</div>${n ? `<label class="opacity-field"><span>Opacity</span><input type="range" data-prop="opacity" min="0" max="1" step=".01" value="${n.opacity ?? 1}"><output>${Math.round((n.opacity ?? 1) * 100)}%</output></label><div class="fill-row"><input type="color" data-prop="fill" value="${/^#[0-9a-f]{6}$/i.test(n.fill) ? n.fill : "#ffffff"}"><input class="hex-input" data-prop="fill" value="${h(n.fill)}" aria-label="Fill hex color"><span class="muted">Fill</span>${button("gradient", "Gradient fill", "down")}</div><div class="fill-row"><input type="color" data-prop="stroke" value="${/^#[0-9a-f]{6}$/i.test(n.stroke) ? n.stroke : "#233d32"}"><input class="hex-input" data-prop="stroke" value="${h(n.stroke || "none")}" aria-label="Stroke hex color"><label class="stroke-width"><input type="number" data-prop="strokeWidth" min="0" max="200" step=".5" value="${n.strokeWidth || 1}" aria-label="Stroke width"><span>px</span></label></div><div class="property-grid"><label>Stroke<select data-prop="dash"><option value="none">Solid</option><option value="8 5" ${n.dash === "8 5" ? "selected" : ""}>Dashed</option><option value="1 4" ${n.dash === "1 4" ? "selected" : ""}>Dotted</option></select></label><label>Line caps<select data-prop="lineCap">${["round", "butt", "square"].map((v) => `<option ${n.lineCap === v ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>${n.gradient ? `<button class="style-chip" data-action="gradient"><span class="gradient-chip" style="background:linear-gradient(90deg,${h(n.gradient.stops[0].color)},${h(n.gradient.stops.at(-1).color)})"></span>${h(n.gradient.type)} gradient ${icon("settings", 14)}</button>` : ""}` : `<div class="fill-row"><input type="color" id="page-color" value="${store.page.background}"><span>${store.page.background.toUpperCase()}</span><span class="muted">Background</span></div><label class="check-label"><input type="checkbox" id="grid-toggle" ${grid ? "checked" : ""}> Show document grid</label><label class="check-label"><input type="checkbox" id="snap-toggle" ${snap ? "checked" : ""}> Snap to objects and guides</label><button class="text-button full" data-action="guides">Manage guides ${icon("plus", 14)}</button>`}</section>
 ${n?.type === "text" ? `<section class="inspector-section"><div class="section-heading"><h3>Typography</h3>${button("font-import", "Import a font", "plus")}</div><select data-prop="fontFamily" class="full">${["Arial", "Georgia", "Verdana", "Times New Roman", "Courier New", ...new Set([...fonts.keys(), ...(store.doc.fonts || []).map((f) => f.family)])].map((f) => `<option ${n.fontFamily === f ? "selected" : ""}>${h(f)}</option>`).join("")}</select><div class="property-grid">${field("Size", "fontSize", n.fontSize, 1, 500)}<label>Weight<select data-prop="fontWeight">${[400, 500, 600, 700, 800, 900].map((v) => `<option value="${v}" ${n.fontWeight === v ? "selected" : ""}>${v}</option>`).join("")}</select></label></div><div class="property-grid">${field("Spacing", "letterSpacing", n.letterSpacing || 0, -30, 100, ".1")}${field("Leading", "lineHeight", n.lineHeight || 1.2, 0.5, 5, ".1")}</div><textarea data-prop="text" class="text-content" rows="3" aria-label="Text content" ${store.doc.nodes.some((v) => v.nextFrame === n.id) ? 'readonly title="Linked frame: edit the source story by double-clicking the text on the canvas"' : ""}>${h(store.doc.nodes.some((v) => v.nextFrame === n.id) ? flowDocument(store.doc).get(n.id)?.text : n.text)}</textarea><div class="alignment-row"><button data-action="text-left">Left</button><button data-action="text-center">Center</button><button data-action="text-right">Right</button><button data-action="text-bold"><b>B</b></button><button data-action="text-italic"><i>I</i></button><button data-action="text-underline"><u>U</u></button></div></section>` : ""}
 ${n?.type === "polygon" ? `<section class="inspector-section"><h3>Polygon</h3><div class="property-grid">${field("Sides", "sides", n.sides || 6, 3, 30)}${n.star ? field("Inner", "innerRadius", n.innerRadius || 0.45, 0.05, 0.95, ".05") : ""}</div></section>` : ""}
 ${n ? `<section class="inspector-section"><div class="section-heading"><h3>Effects</h3>${button("shadow", "Add drop shadow", "plus")}</div><div class="effect-row"><button class="text-button" data-action="shadow">${icon("layers", 16)} ${n.shadow ? "Drop shadow" : "Add drop shadow"}</button>${n.shadow ? button("remove-shadow", "Remove shadow", "close") : ""}</div>${n.shadow ? `<div class="property-grid">${field("Blur", "shadow.blur", n.shadow.blur, 0, 100)}${field("Offset", "shadow.y", n.shadow.y, -100, 100)}</div>` : ""}<div class="effect-actions"><button data-action="clip">Clip</button><button data-action="contour">Contour</button><button data-action="blend">Blend</button></div></section><section class="inspector-section"><div class="section-heading"><h3>Shape operations</h3></div><div class="shape-actions"><button data-action="union">${icon("union")}<span>Weld</span></button><button data-action="subtract">${icon("scissors")}<span>Trim</span></button><button data-action="intersect">${icon("outline")}<span>Intersect</span></button><button data-action="convert">${icon("nodes")}<span>Curves</span></button></div></section>` : ""}
 <section class="inspector-section swatch-section"><div class="section-heading"><h3>Document palette</h3>${button("styles", "Manage styles", "palette")}</div><div class="swatches">${["#183d33", "#007b60", "#17aa91", "#c6ec74", "#f3f1e9", "#ffffff", "#fbad65", "#9198e5"].map((c) => `<button data-color="${c}" style="background:${c}" title="${c}" aria-label="Fill ${c}"></button>`).join("")}</div></section><section class="inspector-section"><div class="section-heading"><h3>Objects</h3><button class="text-button small" data-tab="objects">View all ${icon("chevron", 12)}</button></div><div class="mini-objects">${store.nodes
   .slice(-4)
   .reverse()
   .map((n) => objectRow(n))
   .join("")}</div></section>`;
}
function objectRow(n) {
  return `<div class="object-row ${store.selection.has(n.id) ? "selected" : ""}" data-select="${n.id}" draggable="true" title="${h(n.name)}"><span class="object-type" style="color:${h(/^#[a-f0-9]{3,8}$/i.test(n.fill) ? n.fill : "#829088")}">${icon(n.type === "path" ? "nodes" : n.type, 15)}</span><span class="object-name">${h(n.name)}</span><button data-visibility="${n.id}" aria-label="${n.visible === false ? "Show" : "Hide"} ${h(n.name)}" class="object-action ${n.visible === false ? "muted" : ""}">${icon("eye", 13)}</button><button data-lock="${n.id}" aria-label="${n.locked ? "Unlock" : "Lock"} ${h(n.name)}" class="object-action ${n.locked ? "locked" : ""}">${icon(n.locked ? "lock" : "unlock", 13)}</button></div>`;
}
function renderObjects(query = "") {
  $("#docker-content").innerHTML =
    `<div class="object-search">${icon("search", 16)}<input id="object-search" placeholder="Find an object…" value="${h(query)}" aria-label="Find an object"></div><div class="objects-heading">${icon("layers", 16)} ${h(store.page.name)} <span>${store.nodes.length}</span></div><div class="objects-list">${store.nodes
      .filter((n) => n.name.toLowerCase().includes(query.toLowerCase()))
      .reverse()
      .map((n) => objectRow(n))
      .join(
        "",
      )}</div><div class="object-footer">${button("group", "Group selected objects", "group")}${button("duplicate", "Duplicate selected objects", "copy")}${button("front", "Bring to front", "upload")}${button("back", "Send to back", "download")}${button("delete", "Delete selected objects", "trash")}</div><div class="panel-note">Drag rows to change stacking order.<br>Double-click a name to rename it.</div>`;
}
let comments = [];
function renderComments() {
  $("#docker-content").innerHTML =
    `<section class="inspector-section"><div class="section-heading"><h3>Conversation</h3>${button("comment-tool", "Pin a comment to the page", "plus")}</div><p class="muted">Keep feedback connected to your artwork.</p><textarea id="comment-body" rows="3" placeholder="Leave feedback for your team…" aria-label="New comment"></textarea><button class="primary-button full" data-action="post-comment">Post comment</button></section><div class="comment-list">${comments.length ? comments.map((c) => `<article class="comment-card ${c.resolved ? "resolved" : ""}"><div class="comment-meta"><span class="avatar small">${h(c.author.slice(0, 1).toUpperCase())}</span><strong>${h(c.author.split("@")[0])}</strong><time>${new Date(c.created).toLocaleDateString()}</time></div><p>${h(c.body)}</p><div class="comment-meta"><button class="text-button" data-comment="${c.id}">Show on canvas</button><button class="resolve-button" data-resolve="${c.id}" data-resolved="${c.resolved}">${c.resolved ? "Reopen" : "Resolve"}</button></div></article>`).join("") : '<div class="empty-state">' + icon("comment", 30) + "<h3>A fresh conversation</h3><p>Comments appear here when you or a collaborator leave feedback.</p></div>"}</div>`;
}
function setTab(tab) {
  activeTab = tab;
  $$("[data-tab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
    b.setAttribute("aria-selected", b.dataset.tab === tab);
  });
  inspect();
}
function selectAt(n, shift = false) {
  if (!n) return store.select([]);
  const group = outerGroup(store.doc, n);
  let ids = isolate
    ? [n.id]
    : group
      ? store.nodes
          .filter(
            (x) =>
              inGroup(store.doc, x, group) && !effectiveLocked(store.doc, x),
          )
          .map((x) => x.id)
      : [n.id];
  if (shift) {
    const selected = new Set(store.selection);
    for (const id of ids)
      selected.has(id) ? selected.delete(id) : selected.add(id);
    ids = [...selected];
  }
  store.select(ids);
}
const hitCanvas = document.createElement("canvas"),
  hitContext = hitCanvas.getContext("2d");
function hitTest(p) {
  const candidates = store.index.query({
    x: p.x - 5 / zoom,
    y: p.y - 5 / zoom,
    width: 10 / zoom,
    height: 10 / zoom,
  });
  for (const n of candidates.reverse()) {
    if (
      effectiveLocked(store.doc, n) ||
      !effectiveVisible(store.doc, n) ||
      (isolate && !inGroup(store.doc, n, isolate))
    )
      continue;
    const q = Matrix.point(Matrix.inverse(objectMatrix(n)), p);
    if (n.type === "ellipse") {
      const dx = (q.x - n.width / 2) / (n.width / 2),
        dy = (q.y - n.height / 2) / (n.height / 2);
      if (dx * dx + dy * dy > 1.06) continue;
    } else if (n.type === "path" || n.type === "line") {
      try {
        const path = new Path2D(
          n.type === "line" ? `M0 0L${n.width} ${n.height}` : pathData(n),
        );
        const x = n.nativeWidth ? (q.x * n.nativeWidth) / n.width : q.x,
          y = n.nativeHeight ? (q.y * n.nativeHeight) / n.height : q.y;
        hitContext.lineWidth = Math.max(n.strokeWidth || 1, 8 / zoom);
        if (
          !(
            n.fill !== "none" && hitContext.isPointInPath(path, x, y, "evenodd")
          ) &&
          !hitContext.isPointInStroke(path, x, y)
        )
          continue;
      } catch {
        continue;
      }
    } else if (q.x < 0 || q.y < 0 || q.x > n.width || q.y > n.height) continue;
    return n;
  }
  return null;
}
function snapPosition(x, y, originals) {
  if (!snap) return { x, y, guides: [] };
  const threshold = 6 / zoom,
    first = originals[0],
    guides = [],
    xs = [0, store.page.width / 2, store.page.width],
    ys = [0, store.page.height / 2, store.page.height];
  for (const n of store.nodes)
    if (!store.selection.has(n.id) && n.visible !== false) {
      const b = bounds(n);
      xs.push(b.x, b.x + b.width / 2, b.x + b.width);
      ys.push(b.y, b.y + b.height / 2, b.y + b.height);
    }
  for (const g of store.doc.guides || [])
    (g.axis === "x" ? xs : ys).push(g.value);
  let dx = threshold,
    dy = threshold;
  for (const edge of [x, x + first.width / 2, x + first.width])
    for (const target of xs)
      if (Math.abs(target - edge) < Math.abs(dx)) dx = target - edge;
  for (const edge of [y, y + first.height / 2, y + first.height])
    for (const target of ys)
      if (Math.abs(target - edge) < Math.abs(dy)) dy = target - edge;
  if (Math.abs(dx) < threshold) {
    x += dx;
    guides.push({ axis: "x", value: x });
  }
  if (Math.abs(dy) < threshold) {
    y += dy;
    guides.push({ axis: "y", value: y });
  }
  if (grid) {
    x = Math.round(x / 20) * 20;
    y = Math.round(y / 20) * 20;
  }
  return { x, y, guides };
}
stage.addEventListener(
  "pointerdown",
  (e) => {
    if (
      gesture ||
      space ||
      tool === "hand" ||
      e.target.dataset.handle ||
      e.target.dataset.nodeIndex !== undefined
    )
      return;
    const r = stage.getBoundingClientRect(),
      x = (e.clientX - r.left - pan.x) / zoom,
      y = (e.clientY - r.top - pan.y) / zoom,
      p = pageLayout(store.doc).find(
        (p) => x >= p.x && x <= p.x + p.width && y >= 0 && y <= p.height,
      );
    if (p && p.id !== store.pageId) {
      store.pageId = p.id;
      store.select([]);
      store.reindex();
      draw();
      inspect();
    }
  },
  true,
);
stage.addEventListener("pointerdown", async (e) => {
  if (e.button !== 0 && e.button !== 1) return;
  if (e.target.closest("[data-page]")) return;
  stage.focus();
  const p = pagePoint(e);
  lastCursor = p;
  const handle = e.target.dataset.handle,
    nodeIndex = e.target.dataset.nodeIndex;
  if (space || tool === "hand" || e.button === 1) {
    gesture = {
      type: "pan",
      start: { x: e.clientX, y: e.clientY },
      pan: { ...pan },
    };
    stage.setPointerCapture(e.pointerId);
    return;
  }
  if (store.readOnly && !["pointer", "hand", "zoom", "comment"].includes(tool))
    return toast("This project is read-only");
  if (tool === "zoom") {
    zoomAt(e.altKey ? 0.8 : 1.25, e.offsetX, e.offsetY);
    return;
  }
  if (tool === "comment") {
    commentDialog(p);
    return;
  }
  if (nodeIndex !== undefined) {
    if (store.selected[0] && effectiveLocked(store.doc, store.selected[0]))
      return toast("Unlock this object before editing its nodes");
    store.begin();
    selectionNode = Number(nodeIndex);
    gesture = {
      type: "node",
      id: store.selected[0].id,
      index: selectionNode,
      control: e.target.dataset.control,
    };
    stage.setPointerCapture(e.pointerId);
    return;
  }
  if (handle && store.selected.length) {
    if (store.selected.some((n) => effectiveLocked(store.doc, n)))
      return toast("Unlock selected objects before transforming");
    store.begin();
    gesture = {
      type: handle === "rotate" ? "rotate" : "resize",
      handle,
      start: p,
      bounds: unionBounds(store.selected),
      originals: clone(store.selected),
    };
    stage.setPointerCapture(e.pointerId);
    return;
  }
  if (tool === "pointer" || tool === "nodes") {
    const n = hitTest(p);
    if (store.readOnly) {
      selectAt(n, e.shiftKey);
      return;
    }
    if (n) {
      if (tool === "nodes") {
        store.select([n.id]);
        if (
          n.type !== "path" ||
          !n.points ||
          n.envelope ||
          n.brush ||
          n.rotation ||
          n.flipX ||
          n.flipY
        ) {
          try {
            const converted = await editableNodes(n);
            store.transact("Edit curve nodes", (d) =>
              Object.assign(
                d.nodes.find((x) => x.id === n.id),
                converted,
                { id: n.id },
              ),
            );
          } catch (err) {
            toast(err.message, true);
          }
          renderOverlay();
          return;
        }
      } else if (!store.selection.has(n.id) || e.shiftKey)
        selectAt(n, e.shiftKey);
      if (e.altKey) store.duplicate(0);
      if (store.selected.length) {
        store.begin();
        gesture = {
          type: "move",
          start: p,
          originals: clone(
            store.selected.filter((n) => !effectiveLocked(store.doc, n)),
          ),
        };
      }
    } else {
      if (!e.shiftKey) store.select([]);
      gesture = {
        type: "marquee",
        start: p,
        box: { x: p.x, y: p.y, width: 0, height: 0 },
        previous: [...store.selection],
      };
    }
    stage.setPointerCapture(e.pointerId);
    return;
  }
  if (tool === "text") {
    const n = store.add("text", {
      x: p.x,
      y: p.y,
      width: 280,
      height: 64,
      fontSize: 48,
      text: "Your text",
      fill: fill,
      fontFamily: "Arial",
      fontWeight: 600,
    });
    setTool("pointer");
    textEditor(n);
    return;
  }
  if (tool === "pen") {
    if (
      pen &&
      pen.points.length > 2 &&
      Math.hypot(p.x - pen.points[0].x, p.y - pen.points[0].y) < 10 / zoom
    ) {
      finishPen(true);
      return;
    }
    if (!pen) pen = { points: [] };
    pen.points.push(p);
    gesture = { type: "pen-handle", point: p };
    stage.setPointerCapture(e.pointerId);
    renderOverlay();
    return;
  }
  if (["rect", "ellipse", "polygon", "star", "line", "pencil"].includes(tool)) {
    store.begin();
    const n = createNode(
      tool === "star" ? "polygon" : tool === "pencil" ? "path" : tool,
      {
        pageId: store.page.id,
        x: p.x,
        y: p.y,
        width: 1,
        height: 1,
        fill: ["line", "pencil"].includes(tool) ? "none" : fill,
        stroke: ["line", "pencil"].includes(tool)
          ? stroke === "none"
            ? "#183d33"
            : stroke
          : stroke,
        strokeWidth: ["line", "pencil"].includes(tool) ? 2 : 1,
        ...(tool === "star" ? { star: true, sides: 5 } : {}),
        ...(tool === "pencil" ? { points: [{ x: 0, y: 0 }] } : {}),
      },
    );
    store.doc.nodes.push(n);
    store.select([n.id]);
    gesture = { type: "draw", start: p, id: n.id, drawTool: tool };
    stage.setPointerCapture(e.pointerId);
    draw();
  }
});
stage.addEventListener("pointermove", (e) => {
  const p = pagePoint(e);
  lastCursor = p;
  $("#coordinates").textContent = `X: ${number(p.x)} · Y: ${number(p.y)}`;
  if (!gesture) return;
  gpu.invalidate();
  const g = gesture;
  if (g.type === "pan") {
    pan.x = g.pan.x + e.clientX - g.start.x;
    pan.y = g.pan.y + e.clientY - g.start.y;
    updateCamera();
    return;
  }
  if (g.type === "move") {
    if (!g.originals.length) return;
    let dx = p.x - g.start.x,
      dy = p.y - g.start.y;
    if (e.shiftKey) {
      Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
    }
    const snapped = snapPosition(
      g.originals[0].x + dx,
      g.originals[0].y + dy,
      g.originals,
    );
    dx = snapped.x - g.originals[0].x;
    dy = snapped.y - g.originals[0].y;
    g.guides = snapped.guides;
    for (const orig of g.originals) {
      const n = store.doc.nodes.find((n) => n.id === orig.id);
      n.x = orig.x + dx;
      n.y = orig.y + dy;
    }
  }
  if (g.type === "resize") {
    const b = g.bounds;
    let left = b.x,
      top = b.y,
      right = b.x + b.width,
      bottom = b.y + b.height;
    if (g.handle.includes("w")) left = p.x;
    if (g.handle.includes("e")) right = p.x;
    if (g.handle.includes("n")) top = p.y;
    if (g.handle.includes("s")) bottom = p.y;
    let width = Math.max(1, right - left),
      height = Math.max(1, bottom - top),
      sx = width / Math.max(1, b.width),
      sy = height / Math.max(1, b.height);
    if (
      e.shiftKey ||
      window.vellumAspect ||
      g.originals.some((n) => n.rotation % 360)
    ) {
      const ratio = ["n", "s"].includes(g.handle)
        ? sy
        : ["e", "w"].includes(g.handle)
          ? sx
          : Math.abs(sx - 1) > Math.abs(sy - 1)
            ? sx
            : sy;
      sx = sy = ratio;
      width = b.width * sx;
      height = b.height * sy;
      if (g.handle.includes("w")) left = right - width;
      if (g.handle.includes("n")) top = bottom - height;
    }
    for (const orig of g.originals) {
      const n = store.doc.nodes.find((n) => n.id === orig.id);
      if (n.locked) continue;
      Object.assign(n, {
        x: left + (orig.x - b.x) * sx,
        y: top + (orig.y - b.y) * sy,
        width: Math.max(1, orig.width * sx),
        height: Math.max(1, orig.height * sy),
      });
      if (orig.points)
        n.points = orig.points.map((p) => ({
          ...p,
          x: p.x * sx,
          y: p.y * sy,
          ...(p.in ? { in: { x: p.in.x * sx, y: p.in.y * sy } } : {}),
          ...(p.out ? { out: { x: p.out.x * sx, y: p.out.y * sy } } : {}),
        }));
      if (n.type === "text") n.fontSize = orig.fontSize * sy;
    }
  }
  if (g.type === "rotate") {
    const b = g.bounds,
      c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    let angle =
      ((Math.atan2(p.y - c.y, p.x - c.x) -
        Math.atan2(g.start.y - c.y, g.start.x - c.x)) *
        180) /
      Math.PI;
    if (e.shiftKey) angle = Math.round(angle / 15) * 15;
    const a = (angle * Math.PI) / 180;
    for (const o of g.originals) {
      const n = store.doc.nodes.find((n) => n.id === o.id),
        x = o.x + o.width / 2 - c.x,
        y = o.y + o.height / 2 - c.y;
      n.x = c.x + x * Math.cos(a) - y * Math.sin(a) - o.width / 2;
      n.y = c.y + x * Math.sin(a) + y * Math.cos(a) - o.height / 2;
      n.rotation = o.rotation + angle;
    }
  }
  if (g.type === "node") {
    const n = store.doc.nodes.find((n) => n.id === g.id),
      point = n.points[g.index],
      q = Matrix.point(Matrix.inverse(objectMatrix(n)), p);
    if (g.control) {
      point[g.control] = q;
      if (!e.altKey) {
        const other = g.control === "in" ? "out" : "in";
        point[other] = { x: 2 * point.x - q.x, y: 2 * point.y - q.y };
      }
    } else {
      const dx = q.x - point.x,
        dy = q.y - point.y;
      point.x = q.x;
      point.y = q.y;
      for (const key of ["in", "out"])
        if (point[key]) {
          point[key].x += dx;
          point[key].y += dy;
        }
    }
  }
  if (g.type === "marquee") {
    g.box = {
      x: Math.min(g.start.x, p.x),
      y: Math.min(g.start.y, p.y),
      width: Math.abs(p.x - g.start.x),
      height: Math.abs(p.y - g.start.y),
    };
    renderOverlay();
    return;
  }
  if (g.type === "pen-handle") {
    if (Math.hypot(p.x - g.point.x, p.y - g.point.y) > 3 / zoom) {
      g.point.out = p;
      g.point.in = { x: g.point.x * 2 - p.x, y: g.point.y * 2 - p.y };
    }
    renderOverlay();
    return;
  }
  if (g.type === "draw") {
    const n = store.doc.nodes.find((n) => n.id === g.id);
    if (g.drawTool === "pencil") {
      const last = n.points.at(-1),
        q = { x: p.x - g.start.x, y: p.y - g.start.y };
      if (Math.hypot(q.x - last.x, q.y - last.y) > 2 / zoom) n.points.push(q);
      n.width = Math.max(1, ...n.points.map((p) => p.x));
      n.height = Math.max(1, ...n.points.map((p) => p.y));
    } else {
      let dx = p.x - g.start.x,
        dy = p.y - g.start.y;
      if (e.shiftKey) {
        if (g.drawTool === "line") {
          const len = Math.hypot(dx, dy),
            a = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4;
          dx = Math.cos(a) * len;
          dy = Math.sin(a) * len;
        } else {
          const size = Math.max(Math.abs(dx), Math.abs(dy));
          dx = Math.sign(dx || 1) * size;
          dy = Math.sign(dy || 1) * size;
        }
      }
      n.x = Math.min(g.start.x, g.start.x + dx);
      n.y = Math.min(g.start.y, g.start.y + dy);
      n.width = Math.max(1, Math.abs(dx));
      n.height =
        g.drawTool === "line" ? Math.abs(dy) : Math.max(1, Math.abs(dy));
      if (g.drawTool === "line") {
        n.flipY = dx * dy < 0;
      }
    }
  }
  renderer.render(store.doc, store.page.id, outline);
  renderOverlay();
});
function normalizePoints(n) {
  if (!n.points?.length) return;
  const all = n.points.flatMap((p) => [
      p,
      ...(p.in ? [p.in] : []),
      ...(p.out ? [p.out] : []),
    ]),
    minX = Math.min(...all.map((p) => p.x)),
    minY = Math.min(...all.map((p) => p.y)),
    maxX = Math.max(...all.map((p) => p.x)),
    maxY = Math.max(...all.map((p) => p.y));
  if (!n.rotation) {
    n.x += minX;
    n.y += minY;
    for (const p of n.points) {
      p.x -= minX;
      p.y -= minY;
      for (const key of ["in", "out"])
        if (p[key]) {
          p[key].x -= minX;
          p[key].y -= minY;
        }
    }
    n.width = Math.max(1, maxX - minX);
    n.height = Math.max(1, maxY - minY);
  }
}
stage.addEventListener("pointerup", (e) => {
  if (!gesture) return;
  const g = gesture;
  gesture = null;
  if (stage.hasPointerCapture(e.pointerId))
    stage.releasePointerCapture(e.pointerId);
  if (g.type === "marquee")
    store.select([
      ...new Set([
        ...g.previous,
        ...store.nodes
          .filter(
            (n) =>
              !n.locked &&
              n.visible !== false &&
              (!isolate || n.groupId === isolate) &&
              intersects(bounds(n), g.box),
          )
          .map((n) => n.id),
      ]),
    ]);
  else if (!["pan", "pen-handle"].includes(g.type)) {
    if (g.type === "draw" || g.type === "node") {
      const n = store.doc.nodes.find((n) => n.id === g.id);
      normalizePoints(n);
    }
    if (g.type === "move") {
      const active = pageLayout(store.doc).find((p) => p.id === store.pageId),
        center = unionBounds(store.selected),
        target = pageLayout(store.doc).find(
          (p) =>
            p.id !== store.pageId &&
            center.x + center.width / 2 + active.x >= p.x &&
            center.x + center.width / 2 + active.x <= p.x + p.width &&
            center.y + center.height / 2 >= 0 &&
            center.y + center.height / 2 <= p.height,
        );
      if (target)
        for (const n of store.selected) {
          n.pageId = target.id;
          n.x += active.x - target.x;
          n.groupId = null;
        }
    }
    store.commit(
      {
        move: "Move objects",
        resize: "Resize objects",
        rotate: "Rotate objects",
        node: "Edit path nodes",
        draw: "Draw " + g.drawTool,
      }[g.type],
    );
    if (g.type === "draw") setTool("pointer");
  }
  draw();
  inspect();
});
stage.addEventListener("pointercancel", () => {
  gesture = null;
  store.cancel();
  draw();
});
stage.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey || e.altKey)
      zoomAt(
        Math.exp(-e.deltaY * 0.002),
        e.clientX - r.left,
        e.clientY - r.top,
      );
    else {
      pan.x -= e.deltaX;
      pan.y -= e.deltaY;
      updateCamera();
    }
  },
  { passive: false },
);
stage.addEventListener("dblclick", (e) => {
  const n = hitTest(pagePoint(e));
  if (n?.type === "text") textEditor(n);
  else if (n?.groupId) {
    isolate = n.groupId;
    $("#isolation-breadcrumb").textContent = " / Editing group · Esc to exit";
    store.select([n.id]);
  } else if (pen) finishPen();
  else if (n) {
    store.select([n.id]);
    setTool("nodes");
    run("edit-nodes");
  }
});
function finishPen(closed = false) {
  if (!pen) return;
  const points = pen.points;
  pen = null;
  if (points.length < 2) {
    renderOverlay();
    return;
  }
  const n = createNode("path", {
    pageId: store.page.id,
    points,
    closed,
    x: 0,
    y: 0,
    fill: closed ? fill : "none",
    stroke: stroke === "none" ? "#183d33" : stroke,
    strokeWidth: 2,
  });
  normalizePoints(n);
  store.transact("Draw Bézier curve", (d) => d.nodes.push(n));
  store.select([n.id]);
  setTool("pointer");
}
function textEditor(n) {
  let parent,
    depth = 0;
  while (
    (parent = store.doc.nodes.find((v) => v.nextFrame === n.id)) &&
    depth++ < 100
  )
    n = parent;
  const d = dialog(
    "Edit text",
    `<textarea id="edit-text-value" rows="5" aria-label="Text content" ${store.doc.nodes.some((v) => v.nextFrame === n.id) ? 'readonly title="Linked frame: edit the source story by double-clicking the text on the canvas"' : ""}>${h(store.doc.nodes.some((v) => v.nextFrame === n.id) ? flowDocument(store.doc).get(n.id)?.text : n.text)}</textarea><p class="muted">Line breaks and typography remain editable.</p>`,
    `<button class="primary-button" id="apply-text">Apply text</button>`,
  );
  $("#apply-text", d).onclick = () => {
    store.update([n.id], { text: $("#edit-text-value", d).value }, "Edit text");
    d.close();
  };
  $("#edit-text-value", d).focus();
}
function applyProperty(prop, value) {
  const ids = [...store.selection],
    ns = store.selected;
  if (!ns.length) return;
  if (
    ["fill", "stroke"].includes(prop) &&
    !/^(#[0-9a-f]{3,8}|none|transparent)$/i.test(value)
  )
    return toast("Enter a hexadecimal color or none", true);
  const numeric = ![
    "name",
    "fill",
    "stroke",
    "fontFamily",
    "text",
    "dash",
    "lineCap",
    "textAlign",
  ].includes(prop);
  if (numeric) {
    value = Number(value);
    if (!Number.isFinite(value)) return;
  }
  if (["width", "height", "fontSize"].includes(prop))
    value = clamp(value, 1, 20000);
  if (prop === "opacity") value = clamp(value, 0, 1);
  if (prop === "sides") value = Math.round(clamp(value, 3, 30));
  if (prop === "strokeWidth") value = clamp(value, 0, 200);
  const b = unionBounds(ns);
  store.update(
    ids,
    (n) => {
      if (prop === "x" || prop === "y")
        return { [prop]: n[prop] + value - b[prop] };
      if ((prop === "width" || prop === "height") && ns.length === 1) {
        const old = n[prop] || 1,
          s = value / old,
          p = { [prop]: value };
        if (n.points)
          p.points = n.points.map((q) => {
            const r = clone(q),
              axis = prop === "width" ? "x" : "y";
            r[axis] *= s;
            for (const k of ["in", "out"]) if (r[k]) r[k][axis] *= s;
            return r;
          });
        if (window.vellumAspect) {
          const other = prop === "width" ? "height" : "width";
          p[other] = n[other] * s;
          if (n.points) {
            const axis = other === "width" ? "x" : "y";
            for (const q of p.points) {
              q[axis] *= s;
              for (const k of ["in", "out"]) if (q[k]) q[k][axis] *= s;
            }
          }
        }
        if (n.type === "text" && (prop === "height" || window.vellumAspect))
          p.fontSize = n.fontSize * s;
        return p;
      }
      if (prop.startsWith("shadow."))
        return { shadow: { ...n.shadow, [prop.split(".")[1]]: value } };
      return {
        [prop]: value,
        ...(prop === "fill" ? { gradient: null, mesh: null, cmyk: null } : {}),
      };
    },
    "Change " + prop,
  );
}
async function run(action) {
  try {
    if (commands.commands.has(action)) await commands.execute(action);
    else if (action.startsWith("align-")) store.align(action.slice(6));
    else if (action.startsWith("tab-")) setTab(action.slice(4));
  } catch (e) {
    toast(e.message || "This action could not be completed", true);
    console.error(e);
  }
}
document.addEventListener("click", (e) => {
  const menu = e.target.closest("[data-menu]");
  if (menu) {
    openMenu(menu);
    return;
  }
  if (!e.target.closest(".menu-popup")) $(".menu-popup")?.remove();
  const t = e.target.closest("[data-tool]");
  if (t) {
    if (t.dataset.tool === "image") run("open");
    else setTool(t.dataset.tool);
    return;
  }
  const page = e.target.closest("[data-page]");
  if (page) {
    store.pageId = page.dataset.page;
    store.select([]);
    store.reindex();
    draw();
    inspect();
    fit();
    return;
  }
  const tab = e.target.closest("[data-tab]");
  if (tab) {
    setTab(tab.dataset.tab);
    return;
  }
  const color = e.target.closest("[data-color]");
  if (color) {
    const prop = e.shiftKey ? "stroke" : "fill";
    if (prop === "fill") fill = color.dataset.color;
    else stroke = color.dataset.color;
    store.update(
      [...store.selection],
      {
        [prop]: color.dataset.color,
        ...(prop === "fill" ? { gradient: null, mesh: null, cmyk: null } : {}),
      },
      "Change " + prop,
    );
    return;
  }
  const vis = e.target.closest("[data-visibility]");
  if (vis) {
    store.transact("Toggle visibility", (d) => {
      const n = d.nodes.find((n) => n.id === vis.dataset.visibility);
      n.visible = n.visible === false;
    });
    return;
  }
  const lock = e.target.closest("[data-lock]");
  if (lock) {
    store.transact("Toggle lock", (d) => {
      const n = d.nodes.find((n) => n.id === lock.dataset.lock);
      n.locked = !n.locked;
    });
    return;
  }
  const obj = e.target.closest("[data-select]");
  if (obj) {
    const n = store.doc.nodes.find((n) => n.id === obj.dataset.select);
    selectAt(n, e.shiftKey);
    return;
  }
  const resolve = e.target.closest("[data-resolve]");
  if (resolve) {
    collab
      .action("resolve", {
        commentId: resolve.dataset.resolve,
        resolved: resolve.dataset.resolved !== "1",
      })
      .then(() => collab.sync())
      .catch((e) => toast(e.message, true));
    return;
  }
  const comment = e.target.closest("[data-comment]");
  if (comment) {
    const c = comments.find((c) => c.id === comment.dataset.comment);
    if (c) {
      store.pageId = c.page_id;
      store.select([]);
      store.reindex();
      inspect();
      pan = {
        x: stage.clientWidth / 2 - c.x * zoom,
        y: stage.clientHeight / 2 - c.y * zoom,
      };
      draw();
      toast(c.body);
    }
    return;
  }
  const action = e.target.closest("[data-action]");
  if (action) run(action.dataset.action);
});
document.addEventListener("change", (e) => {
  if (e.target.dataset.prop)
    applyProperty(e.target.dataset.prop, e.target.value);
  if (e.target.id === "tool-fill") {
    fill = e.target.value;
    if (store.selected.length) applyProperty("fill", fill);
  }
  if (e.target.id === "tool-stroke") {
    stroke = e.target.value;
    if (store.selected.length) applyProperty("stroke", stroke);
  }
  if (e.target.id === "page-color")
    store.transact(
      "Page color",
      () => (store.page.background = e.target.value),
    );
  if (e.target.id === "grid-toggle") run("toggle-grid");
  if (e.target.id === "snap-toggle") run("toggle-snap");
});
document.addEventListener("input", (e) => {
  if (e.target.id === "object-search") {
    const pos = e.target.selectionStart;
    renderObjects(e.target.value);
    $("#object-search").focus();
    $("#object-search").setSelectionRange(pos, pos);
  }
  if (e.target.dataset.prop === "opacity")
    e.target.nextElementSibling.textContent =
      Math.round(e.target.value * 100) + "%";
});
document.addEventListener("dblclick", (e) => {
  const row = e.target.closest("[data-select]");
  if (row) {
    store.select([row.dataset.select]);
    run("rename-object");
  }
});
let dragged;
document.addEventListener("dragstart", (e) => {
  const row = e.target.closest("[data-select]");
  if (row) {
    dragged = row.dataset.select;
    e.dataTransfer.setData("text/plain", dragged);
  }
});
document.addEventListener("dragover", (e) => {
  if (e.target.closest("[data-select]") || e.target.closest("#stage"))
    e.preventDefault();
});
document.addEventListener("drop", async (e) => {
  e.preventDefault();
  if (e.dataTransfer.files.length) {
    for (const file of e.dataTransfer.files) await loadFile(file);
    return;
  }
  const row = e.target.closest("[data-select]");
  if (row && dragged && dragged !== row.dataset.select) {
    store.transact("Reorder object", (d) => {
      const from = d.nodes.findIndex((n) => n.id === dragged),
        target = d.nodes.findIndex((n) => n.id === row.dataset.select),
        [n] = d.nodes.splice(from, 1);
      d.nodes.splice(target, 0, n);
    });
  }
  dragged = null;
});
function openMenu(trigger) {
  const same = $(".menu-popup")?.dataset.name === trigger.dataset.menu;
  $(".menu-popup")?.remove();
  if (same) return;
  const el = document.createElement("div");
  el.className = "menu-popup";
  el.dataset.name = trigger.dataset.menu;
  el.setAttribute("role", "menu");
  el.innerHTML = menuData[trigger.dataset.menu]
    .map(
      ([a, label, key]) =>
        `<button role="menuitem" data-action="${a}">${h(label)}<kbd>${key}</kbd></button>`,
    )
    .join("");
  const r = trigger.getBoundingClientRect();
  el.style.left = r.left + "px";
  el.style.top = r.bottom + 3 + "px";
  document.body.append(el);
  el.addEventListener("click", () => el.remove());
}
function nameDialog(title, value, onSave) {
  const d = dialog(
    title,
    `<label class="form-label">Name<input id="name-value" value="${h(value)}" maxlength="180"></label>`,
    `<button class="primary-button" id="name-save">Save</button>`,
  );
  $("#name-save", d).onclick = () => {
    const v = $("#name-value", d).value.trim();
    if (v) {
      onSave(v);
      d.close();
    }
  };
  $("#name-value", d).focus();
  $("#name-value", d).select();
  $("#name-value", d).onkeydown = (e) => {
    if (e.key === "Enter") $("#name-save", d).click();
  };
}
const reg = (id, title, fn, key = "") => commands.register(id, title, fn, key);
reg("undo", "Undo", () => store.undo(), "Ctrl Z");
reg("redo", "Redo", () => store.redo(), "Ctrl Shift Z");
reg(
  "select-all",
  "Select all",
  () =>
    store.select(
      store.nodes
        .filter((n) => !n.locked && n.visible !== false)
        .map((n) => n.id),
    ),
  "Ctrl A",
);
reg(
  "copy",
  "Copy",
  () => {
    clipboard = clone(store.selected);
    toast(`${clipboard.length} objects copied`);
  },
  "Ctrl C",
);
reg(
  "cut",
  "Cut",
  () => {
    clipboard = clone(store.selected);
    store.remove();
  },
  "Ctrl X",
);
reg(
  "paste",
  "Paste",
  () => {
    if (!clipboard.length) return toast("Copy objects in Vellum first");
    const nodes = clone(clipboard).map((n) => ({
      ...n,
      id: uid(),
      pageId: store.page.id,
      x: n.x + 24,
      y: n.y + 24,
      groupId: null,
      locked: false,
    }));
    store.transact("Paste objects", (d) => d.nodes.push(...nodes));
    store.select(nodes.map((n) => n.id));
  },
  "Ctrl V",
);
reg("duplicate", "Duplicate", () => store.duplicate(), "Ctrl D");
reg(
  "delete",
  "Delete",
  () => {
    if (
      tool === "nodes" &&
      selectionNode >= 0 &&
      store.selected[0]?.points?.length > 2
    ) {
      store.update(
        [...store.selection],
        (n) => ({ points: n.points.filter((_, i) => i !== selectionNode) }),
        "Delete node",
      );
      selectionNode = -1;
    } else store.remove();
  },
  "Delete",
);
reg("group", "Group objects", () => store.group(), "Ctrl G");
reg("ungroup", "Ungroup objects", () => store.ungroup(), "Ctrl Shift G");
for (const m of ["front", "back", "forward", "backward"])
  reg(m, "Arrange " + m, () => store.arrange(m));
reg("flip-x", "Flip horizontally", () =>
  store.update(
    [...store.selection],
    (n) => ({ flipX: !n.flipX }),
    "Flip horizontally",
  ),
);
reg("flip-y", "Flip vertically", () =>
  store.update(
    [...store.selection],
    (n) => ({ flipY: !n.flipY }),
    "Flip vertically",
  ),
);
reg("lock-aspect", "Constrain proportions", () => {
  window.vellumAspect = !window.vellumAspect;
  inspect();
});
reg("fit", "Fit page", () => fit(), "1");
reg(
  "actual",
  "Actual size",
  () => {
    zoom = 1;
    pan = { x: 60, y: 60 };
    draw();
  },
  "2",
);
reg("fit-selection", "Fit selection", () => fit(true), "3");
reg("zoom-in", "Zoom in", () => zoomAt(1.2), "+");
reg("zoom-out", "Zoom out", () => zoomAt(1 / 1.2), "−");
reg("toggle-grid", "Toggle grid", () => {
  grid = !grid;
  $$('[data-action="toggle-grid"]').forEach((b) =>
    b.classList.toggle("active", grid),
  );
  draw();
  inspect();
});
reg("toggle-snap", "Toggle snapping", () => {
  snap = !snap;
  $$('[data-action="toggle-snap"]').forEach((b) =>
    b.classList.toggle("active", snap),
  );
  inspect();
});
reg("toggle-outline", "Toggle outline view", () => {
  outline = !outline;
  $$('[data-action="toggle-outline"]').forEach((b) =>
    b.classList.toggle("active", outline),
  );
  draw();
});
reg("toggle-dark", "Toggle dark workspace", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem(
    "vellum-theme",
    document.body.classList.contains("dark") ? "dark" : "light",
  );
});
reg("rename", "Rename document", () =>
  nameDialog("Rename document", store.doc.name, (name) =>
    store.transact("Rename document", (d) => (d.name = name)),
  ),
);
reg("rename-object", "Rename object", () => {
  const n = store.selected[0];
  if (n)
    nameDialog("Rename object", n.name, (name) =>
      store.update([n.id], { name }, "Rename object"),
    );
});
reg(
  "new",
  "New document",
  () => {
    const d = dialog(
      "Create a document",
      `<label class="form-label">Document name<input id="new-name" value="Untitled artwork"></label><label class="form-label">Preset<select id="new-preset"><option value="800,1000">Portrait poster · 800 × 1000 px</option><option value="794,1123">A4 · 210 × 297 mm at 96 dpi</option><option value="1123,794">A4 landscape</option><option value="1080,1080">Social square · 1080 × 1080 px</option><option value="1920,1080">Presentation · 1920 × 1080 px</option><option value="336,192">Business card · 3.5 × 2 in</option></select></label><div class="form-row"><label>Width<input id="new-width" type="number" value="800" min="1" max="20000"></label><label>Height<input id="new-height" type="number" value="1000" min="1" max="20000"></label></div>`,
      `<button id="new-create" class="primary-button">Create document</button>`,
    );
    $("#new-preset", d).onchange = (e) => {
      const [w, h] = e.target.value.split(",");
      $("#new-width", d).value = w;
      $("#new-height", d).value = h;
    };
    $("#new-create", d).onclick = () => {
      const doc = createDocument($("#new-name", d).value || "Untitled artwork");
      doc.pages[0].width = clamp(
        Number($("#new-width", d).value) || 800,
        1,
        20000,
      );
      doc.pages[0].height = clamp(
        Number($("#new-height", d).value) || 1000,
        1,
        20000,
      );
      collab.persistDraft();
      collab.stop();
      collab.project = null;
      collab.base = null;
      collab.conflict = null;
      store.replace(doc);
      history.replaceState(null, "", location.pathname);
      d.close();
      fit();
      toast("New document created");
    };
  },
  "Ctrl N",
);
reg("open", "Open or import a file", () => $("#file-input").click(), "Ctrl O");
reg("save-file", "Download editable Vellum document", () =>
  download(
    JSON.stringify(store.doc, null, 2),
    safeName(store.doc.name) + ".vellum",
  ),
);
reg(
  "save",
  (isStatic ? "Save in browser" : "Save to cloud"),
  async () => {
    if (!cloudAvailable) {
      await collab.initialize();
      cloudAvailable = true;
    }
    if (!collab.project) await collab.create();
    else await collab.save();
    if (collab.conflict)
      throw new Error("Resolve the concurrent edits before saving");
    toast(
      collab.dirty
        ? "Saving changes · local recovery draft stored"
        : (isStatic ? "Project saved in this browser" : "Project saved"),
    );
  },
  "Ctrl S",
);
async function loadFile(file) {
  try {
    const result = await readFile(file, store.page.id);
    if (result.document) {
      collab.persistDraft();
      collab.stop();
      collab.project = null;
      collab.base = null;
      collab.conflict = null;
      store.replace(result.document);
      history.replaceState(null, "", location.pathname);
      fit();
    } else {
      store.transact("Import " + file.name, (d) =>
        d.nodes.push(...result.nodes),
      );
      store.select(result.nodes.map((n) => n.id));
      fit(true);
    }
    toast(
      result.omitted
        ? `Imported ${result.nodes.length} objects. ${result.omitted} unsupported elements or attributes omitted.`
        : `Opened ${file.name}`,
    );
  } catch (e) {
    toast(e.message, true);
  }
}
$("#file-input").onchange = async (e) => {
  for (const f of e.target.files) await loadFile(f);
  e.target.value = "";
};
reg(
  "export",
  "Export artwork",
  () => {
    const d = dialog(
      "Export artwork",
      `<div class="export-preview">${toSVG(store.doc, store.page.id)}</div><div class="export-options"><label class="form-label">File format<select id="export-format"><option value="svg">SVG · editable vector artwork</option><option value="png">PNG · high-resolution image</option><option value="pdf">PDF · vector document</option><option value="vellum">Vellum · complete editable project</option></select></label><label class="form-label">Pages<select id="export-pages"><option value="current">Current page</option><option value="all">All pages (PDF / Vellum)</option></select></label><label class="form-label">PNG scale<select id="export-scale"><option value="1">1× · ${store.page.width} × ${store.page.height}</option><option value="2" selected>2× · ${store.page.width * 2} × ${store.page.height * 2}</option><option value="3">3×</option></select></label><label class="check-label"><input id="export-transparent" type="checkbox"> Transparent background (PNG / SVG)</label><p class="export-note">RGB output. PDF text uses available font mappings; use outlines for exact custom typography. Print production and PDF/X certification are not included.</p><div id="export-error" class="inline-error"></div></div>`,
      `<button class="primary-button" id="export-confirm">${icon("download", 16)} Export file</button>`,
    );
    d.classList.add("export-dialog");
    $("#export-confirm", d).onclick = async () => {
      const b = $("#export-confirm", d);
      b.disabled = true;
      b.textContent = "Preparing export…";
      try {
        const f = $("#export-format", d).value,
          all = $("#export-pages", d).value === "all",
          transparent = $("#export-transparent", d).checked,
          name = safeName(store.doc.name);
        if (all && !["pdf", "vellum"].includes(f))
          throw new Error("Choose PDF or Vellum to export all pages");
        if (f === "vellum")
          download(JSON.stringify(store.doc, null, 2), name + ".vellum");
        if (f === "svg")
          download(
            toSVG(store.doc, store.page.id, { transparent }),
            name + ".svg",
            "image/svg+xml",
          );
        if (f === "png")
          download(
            await rasterize(store.doc, store.page.id, {
              scale: Number($("#export-scale", d).value),
              transparent,
            }),
            name + ".png",
            "image/png",
          );
        if (f === "pdf")
          download(
            await exportPDF(store.doc, all ? store.doc.pages : [store.page]),
            name + ".pdf",
            "application/pdf",
          );
        d.close();
        toast("Export ready");
      } catch (e) {
        $("#export-error", d).textContent = e.message;
        b.disabled = false;
        b.textContent = "Export file";
      }
    };
  },
  "Ctrl Shift E",
);
reg("print", "Print current page", () => {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;";
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(
    `<!doctype html><html><head><title>${h(store.doc.name)}</title><style>@page{size:${store.page.width}px ${store.page.height}px;margin:0}html,body{margin:0}svg{width:100%;height:auto}</style></head><body>${toSVG(store.doc, store.page.id)}</body></html>`,
  );
  doc.close();
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60000);
  }, 300);
});
reg("add-page", "Add page", () => {
  const p = {
    id: uid(),
    name: "Page " + (store.doc.pages.length + 1),
    width: store.page.width,
    height: store.page.height,
    background: "#ffffff",
  };
  store.transact("Add page", (d) => d.pages.push(p));
  store.pageId = p.id;
  store.select([]);
  store.reindex();
  draw();
  inspect();
  fit();
});
reg("page-settings", "Page settings", () => {
  const p = store.page,
    d = dialog(
      "Page settings",
      `<label class="form-label">Page name<input id="page-name" value="${h(p.name)}"></label><div class="form-row"><label>Width (px)<input id="page-width" type="number" value="${p.width}" min="1" max="20000"></label><label>Height (px)<input id="page-height" type="number" value="${p.height}" min="1" max="20000"></label></div><label class="form-label">Background<input id="page-bg" type="color" value="${p.background}"></label>`,
      `<button class="secondary-button" id="page-duplicate">Duplicate page</button>${store.doc.pages.length > 1 ? '<button class="danger-button" id="page-delete">Delete page</button>' : ""}<button class="primary-button" id="page-apply">Apply</button>`,
    );
  $("#page-apply", d).onclick = () => {
    const live = store.doc.pages.find((x) => x.id === p.id);
    if (!live) {
      toast("This page was removed by a collaborator", true);
      d.close();
      return;
    }
    store.transact("Page settings", () =>
      Object.assign(live, {
        name: $("#page-name", d).value || p.name,
        width: clamp(Number($("#page-width", d).value) || 800, 1, 20000),
        height: clamp(Number($("#page-height", d).value) || 1000, 1, 20000),
        background: $("#page-bg", d).value,
      }),
    );
    d.close();
    fit();
  };
  $("#page-duplicate", d).onclick = () => {
    const copy = store.duplicatePage(p.id);
    store.pageId = copy.id;
    store.reindex();
    store.select([]);
    d.close();
    draw();
    fit();
  };
  if ($("#page-delete", d))
    $("#page-delete", d).onclick = () => {
      store.deletePage(p.id);
      d.close();
      draw();
      fit();
    };
});
reg("pages", "Pages overview", () => {
  const d = dialog(
    "Pages",
    `<div class="pages-grid">${store.doc.pages.map((p, i) => `<button data-dialog-page="${p.id}"><div class="page-thumb">${toSVG(store.doc, p.id)}</div><strong>${i + 1}. ${h(p.name)}</strong><span>${p.width} × ${p.height} px</span></button>`).join("")}</div>`,
  );
  $$("[data-dialog-page]", d).forEach(
    (b) =>
      (b.onclick = () => {
        store.pageId = b.dataset.dialogPage;
        store.select([]);
        store.reindex();
        d.close();
        draw();
        inspect();
        fit();
      }),
  );
});
reg("guides", "Manage guides", () => {
  const d = dialog(
    "Layout guides",
    `<p class="muted">Guides snap objects into place and are excluded from export.</p><div class="form-row"><label>Direction<select id="guide-axis"><option value="x">Vertical</option><option value="y">Horizontal</option></select></label><label>Position (px)<input id="guide-value" type="number" value="100"></label></div><div class="guide-list">${(store.doc.guides || []).map((g, i) => `<div>${g.axis === "x" ? "Vertical" : "Horizontal"} · ${g.value} px <button data-remove-guide="${i}" class="text-button">Remove</button></div>`).join("")}</div>`,
    `<button class="primary-button" id="guide-add">Add guide</button>`,
  );
  $("#guide-add", d).onclick = () => {
    store.transact("Add guide", (doc) =>
      (doc.guides ??= []).push({
        axis: $("#guide-axis", d).value,
        value: Number($("#guide-value", d).value) || 0,
        pageId: store.page.id,
      }),
    );
    d.close();
    run("guides");
  };
  $$("[data-remove-guide]", d).forEach(
    (b) =>
      (b.onclick = () => {
        store.transact("Remove guide", (doc) =>
          doc.guides.splice(Number(b.dataset.removeGuide), 1),
        );
        d.close();
        run("guides");
      }),
  );
});
for (const [id, op] of [
  ["union", "unite"],
  ["subtract", "subtract"],
  ["intersect", "intersect"],
  ["exclude", "exclude"],
])
  reg(id, "Boolean " + id, async () => {
    const ns = store.selected.filter((n) => !effectiveLocked(store.doc, n)),
      result = await booleanOperation(ns, op),
      ids = new Set(ns.map((n) => n.id));
    store.transact("Boolean " + id, (d) => {
      d.nodes = d.nodes.filter((n) => !ids.has(n.id));
      d.nodes.push(result);
    });
    store.select([result.id]);
  });
reg(
  "convert",
  "Convert to curves",
  async () => {
    const converted = [];
    for (const n of store.selected.filter(
      (n) => !effectiveLocked(store.doc, n),
    ))
      converted.push({ ...(await convertToPath(n)), id: n.id });
    store.transact("Convert to curves", (d) => {
      for (const n of converted)
        Object.assign(
          d.nodes.find((x) => x.id === n.id),
          n,
        );
    });
  },
  "Ctrl Q",
);
reg("edit-nodes", "Edit curve nodes", async () => {
  const n = store.selected[0];
  if (!n) return;
  const edited = await editableNodes(n);
  store.update([n.id], edited, "Convert to editable nodes");
  setTool("nodes");
});
reg("break-apart", "Break apart compound curve", async () => {
  const ns = store.selected;
  if (ns.length !== 1) throw new Error("Select one compound curve");
  if (ns[0].locked) throw new Error("Unlock the curve first");
  const parts = await breakApart(ns[0]);
  store.transact("Break apart", (d) => {
    d.nodes = d.nodes.filter((n) => n.id !== ns[0].id);
    d.nodes.push(...parts);
  });
  store.select(parts.map((n) => n.id));
});
reg("smooth", "Smooth selected curves", async () => {
  const changed = [];
  for (const n of store.selected)
    if (n.type === "path" && !n.locked)
      changed.push({ ...(await smoothPath(n)), id: n.id });
  if (!changed.length) throw new Error("Select a curve to smooth");
  store.transact("Smooth curves", (d) =>
    changed.forEach((n) =>
      Object.assign(
        d.nodes.find((x) => x.id === n.id),
        n,
      ),
    ),
  );
});
reg("isolate", "Edit selected group", () => {
  const n = store.selected[0];
  if (!n?.groupId) throw new Error("Select a group first");
  isolate = n.groupId;
  $("#isolation-breadcrumb").textContent = " / Editing group · Esc to exit";
  store.select([n.id]);
});
reg("shadow", "Add or edit shadow", () => {
  if (!store.selected.length) throw new Error("Select an object first");
  store.update(
    [...store.selection],
    { shadow: { x: 0, y: 8, blur: 12, color: "#152b22", opacity: 0.25 } },
    "Drop shadow",
  );
});
reg("remove-shadow", "Remove shadow", () =>
  store.update([...store.selection], { shadow: null }, "Remove shadow"),
);
reg("gradient", "Gradient fill", () => {
  const n = store.selected[0];
  if (!n) throw new Error("Select an object first");
  const g = n.gradient || {
      type: "linear",
      angle: 0,
      stops: [
        { offset: 0, color: /^#/.test(n.fill) ? n.fill : "#17aa91" },
        { offset: 1, color: "#c6ec74" },
      ],
    },
    d = dialog(
      "Gradient fill",
      `<div id="gradient-preview" class="gradient-preview" style="background:linear-gradient(90deg,${h(g.stops[0].color)},${h(g.stops.at(-1).color)})"></div><label class="form-label">Type<select id="gradient-type"><option value="linear" ${g.type === "linear" ? "selected" : ""}>Linear</option><option value="radial" ${g.type === "radial" ? "selected" : ""}>Radial</option></select></label><div class="form-row"><label>Start<input id="gradient-start" type="color" value="${g.stops[0].color}"></label><label>End<input id="gradient-end" type="color" value="${g.stops.at(-1).color}"></label><label>Angle<input id="gradient-angle" type="number" value="${g.angle || 0}"></label></div>`,
      `<button class="secondary-button" id="gradient-remove">Use solid fill</button><button class="primary-button" id="gradient-apply">Apply gradient</button>`,
    );
  const preview = () =>
    ($("#gradient-preview", d).style.background =
      `${$("#gradient-type", d).value === "radial" ? "radial" : "linear"}-gradient(${$("#gradient-type", d).value === "radial" ? "circle" : $("#gradient-angle", d).value + "deg"},${$("#gradient-start", d).value},${$("#gradient-end", d).value})`);
  d.oninput = preview;
  $("#gradient-apply", d).onclick = () => {
    store.update(
      [...store.selection],
      {
        mesh: null,
        cmyk: null,
        gradient: {
          type: $("#gradient-type", d).value,
          angle: Number($("#gradient-angle", d).value),
          stops: [
            { offset: 0, color: $("#gradient-start", d).value },
            { offset: 1, color: $("#gradient-end", d).value },
          ],
        },
      },
      "Gradient fill",
    );
    d.close();
  };
  $("#gradient-remove", d).onclick = () => {
    store.update(
      [...store.selection],
      { gradient: null, mesh: null, cmyk: null },
      "Solid fill",
    );
    d.close();
  };
});
reg("clip", "Toggle ellipse clipping", () => {
  if (!store.selected.length) throw new Error("Select an image or object");
  store.update(
    [...store.selection],
    (n) => ({ clip: n.clip ? null : "ellipse" }),
    "Ellipse clipping",
  );
});
reg("contour", "Add contour outline", () => {
  if (!store.selected.length) throw new Error("Select an object");
  const d = dialog(
    "Contour outline",
    `<p class="muted">Create an editable expanded outline behind the selected shapes.</p><div class="form-row"><label>Width<input id="contour-width" type="number" value="18" min="1" max="200"></label><label>Color<input id="contour-color" type="color" value="#183d33"></label></div>`,
    `<button class="primary-button" id="contour-apply">Create contour</button>`,
  );
  $("#contour-apply", d).onclick = () => {
    const copies = store.selected.map((n) => ({
      ...clone(n),
      id: uid(),
      name: n.name + " · contour",
      stroke: $("#contour-color", d).value,
      strokeWidth: clamp(Number($("#contour-width", d).value) || 18, 1, 200),
      shadow: null,
    }));
    store.transact("Create contour", (doc) => {
      for (let i = 0; i < copies.length; i++) {
        const index = doc.nodes.findIndex((n) => n.id === store.selected[i].id);
        doc.nodes.splice(index, 0, copies[i]);
      }
    });
    d.close();
  };
});
reg("blend", "Blend objects", () => {
  const ns = store.selected;
  if (
    ns.length !== 2 ||
    ns[0].type !== ns[1].type ||
    ["path", "text", "image"].includes(ns[0].type)
  )
    throw new Error(
      "Select two rectangles, ellipses or polygons of the same type",
    );
  const d = dialog(
    "Blend objects",
    `<label class="form-label">Intermediate steps<input id="blend-steps" type="number" min="1" max="100" value="12"></label><p class="muted">Creates editable intermediate shapes with interpolated position, size, rotation and fill.</p>`,
    `<button class="primary-button" id="blend-apply">Create blend</button>`,
  );
  $("#blend-apply", d).onclick = () => {
    const steps = clamp(Number($("#blend-steps", d).value) || 12, 1, 100),
      [a, b] = ns,
      nodes = [];
    for (let i = 1; i <= steps; i++) {
      const t = i / (steps + 1),
        n = { ...clone(a), id: uid(), name: "Blend " + i };
      for (const k of ["x", "y", "width", "height", "rotation", "opacity"])
        n[k] = a[k] + (b[k] - a[k]) * t;
      if (/^#[0-9a-f]{6}$/i.test(a.fill) && /^#[0-9a-f]{6}$/i.test(b.fill)) {
        n.fill =
          "#" +
          [1, 3, 5]
            .map((j) =>
              Math.round(
                parseInt(a.fill.slice(j, j + 2), 16) * (1 - t) +
                  parseInt(b.fill.slice(j, j + 2), 16) * t,
              )
                .toString(16)
                .padStart(2, "0"),
            )
            .join("");
      }
      nodes.push(n);
    }
    store.transact("Blend objects", (doc) =>
      doc.nodes.splice(doc.nodes.indexOf(b), 0, ...nodes),
    );
    store.select(nodes.map((n) => n.id));
    d.close();
  };
});
reg("symmetry", "Mirror duplicate", () => {
  const ns = store.selected,
    b = unionBounds(ns),
    copies = ns.map((n) => ({
      ...clone(n),
      id: uid(),
      name: n.name + " · mirror",
      x: b.x + 2 * b.width - (n.x - b.x) - n.width,
      flipX: !n.flipX,
    }));
  store.transact("Mirror duplicate", (d) => d.nodes.push(...copies));
  store.select(copies.map((n) => n.id));
});
reg("edit-text", "Edit text", () => {
  const n = store.selected[0];
  if (n?.type !== "text") throw new Error("Select a text object");
  textEditor(n);
});
for (const align of ["left", "center", "right"])
  reg("text-" + align, "Align text " + align, () =>
    store.update([...store.selection], { textAlign: align }, "Text alignment"),
  );
for (const key of ["bold", "italic", "underline"])
  reg("text-" + key, "Text " + key, () =>
    store.update(
      [...store.selection],
      (n) =>
        key === "bold"
          ? { fontWeight: n.fontWeight >= 700 ? 400 : 700 }
          : { [key]: !n[key] },
      "Text " + key,
    ),
  );
reg("font-import", "Import font", () => $("#font-input").click());
$("#font-input").onchange = async (e) => {
  try {
    const f = await importFont(e.target.files[0]);
    fonts.set(f.family, f.font);
    store.transact("Embed font", (doc) => {
      doc.fonts = (doc.fonts || []).filter(
        (v) =>
          v.family !== f.family ||
          (v.weight || 400) !== f.weight ||
          !!v.italic !== f.italic,
      );
      doc.fonts.push({
        family: f.family,
        src: f.src,
        weight: f.weight,
        italic: f.italic,
      });
      for (const n of store.selected)
        if (!effectiveLocked(doc, n)) {
          n.fontFamily = f.family;
          n.fontWeight = f.weight;
          n.italic = f.italic;
        }
    });
    toast(`Font ${f.family} embedded in this document`);
    inspect();
  } catch (err) {
    toast(err.message, true);
  }
  e.target.value = "";
};
reg("text-outlines", "Text to shaped outlines", async () => {
  const n = store.selected[0];
  if (n?.type !== "text") throw new Error("Select a text object");
  const f = matchingFont(store.doc, n);
  if (!f) throw new Error("Import and embed the matching font first");
  store.update(
    [n.id],
    {
      ...(await shapeTextToPath(n, fromBase64(f.src.split(",")[1]))),
      id: n.id,
    },
    "Shape text to outlines",
  );
});
reg("styles", "Object styles", () => {
  const styles = store.doc.styles || [],
    d = dialog(
      "Reusable object styles",
      `<p class="muted">Save fill, stroke and effects from your selection. Styles travel with the Vellum project.</p><div class="style-list">${styles.map((s, i) => `<button class="style-card" data-apply-style="${i}"><span style="background:${h(s.fill || "#ffffff")}"></span>${h(s.name)}</button>`).join("") || "<p>No saved styles yet.</p>"}</div>`,
      `<button class="primary-button" id="save-style" ${store.selected.length ? "" : "disabled"}>Save selected appearance</button>`,
    );
  $("#save-style", d).onclick = () => {
    const n = store.selected[0];
    store.transact("Save style", (doc) =>
      (doc.styles ??= []).push({
        name: n.name + " style",
        fill: n.fill,
        stroke: n.stroke,
        strokeWidth: n.strokeWidth,
        gradient: clone(n.gradient || null),
        shadow: clone(n.shadow || null),
        opacity: n.opacity,
      }),
    );
    d.close();
    run("styles");
  };
  $$("[data-apply-style]", d).forEach(
    (b) =>
      (b.onclick = () => {
        const { name, ...style } = styles[Number(b.dataset.applyStyle)];
        store.update([...store.selection], style, "Apply style");
        d.close();
      }),
  );
});
reg("projects", (isStatic ? "Open browser project" : "Open cloud project"), async () => {
  const { projects } = await collab.list(),
    d = dialog(
      (isStatic ? "Projects in this browser" : "Your projects"),
      `<div class="project-list">${projects.length ? projects.map((p) => `<button data-project="${p.id}">${icon("folder", 24)}<span><strong>${h(p.name)}</strong><small>Revision ${p.revision} · ${new Date(p.updated).toLocaleString()}</small></span>${icon("chevron", 16)}</button>`).join("") : '<div class="empty-state">Save your first project to see it here.</div>'}</div>`,
    );
  $$("[data-project]", d).forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          collab.persistDraft();
          if (collab.dirty && collab.project) {
            await collab.save();
            if (collab.dirty)
              throw new Error(
                "Save or recover current changes before switching projects",
              );
          }
          await collab.open(b.dataset.project);
          d.close();
          fit();
        } catch (e) {
          toast(e.message, true);
        }
      }),
  );
});
reg("share", "Share project", async () => {
  if (!collab.project) await commands.execute("save");
  const result = await collab.action("members"),
    url = location.origin + location.pathname + "?project=" + collab.project.id,
    d = dialog(
      "Share this project",
      `<p class="muted">Grant project access to a teammate by email. They also need access to this hosted site. No email is sent.</p><label class="form-label">Project link<div class="copy-link"><input id="share-link" readonly value="${h(url)}"><button id="copy-link" class="secondary-button">Copy</button></div></label><div class="form-row"><label class="grow">Email address<input id="share-email" type="email" placeholder="designer@example.com"></label><label>Access<select id="share-role"><option value="editor">Can edit</option><option value="commenter">Can comment</option><option value="viewer">Can view</option></select></label></div><div class="member-list">${result.members.map((m) => `<div><span>${h(m.email)}</span><span>${h(m.role)}</span><button data-revoke="${h(m.email)}" class="text-button">Remove</button></div>`).join("")}</div><p id="share-error" class="inline-error"></p>`,
      `<button id="share-add" class="primary-button">Grant access</button>`,
    );
  $("#copy-link", d).onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Project link copied");
    } catch {
      $("#share-link", d).select();
      toast("Select and copy the project link");
    }
  };
  $("#share-add", d).onclick = async () => {
    try {
      await collab.action("share", {
        email: $("#share-email", d).value,
        role: $("#share-role", d).value,
      });
      d.close();
      toast("Project access updated");
      run("share");
    } catch (e) {
      $("#share-error", d).textContent = e.message;
    }
  };
  $$("[data-revoke]", d).forEach(
    (b) =>
      (b.onclick = async () => {
        await collab.action("unshare", { email: b.dataset.revoke });
        d.close();
        run("share");
      }),
  );
});
reg("history", "History and revisions", async () => {
  let revisions = [];
  if (collab.project)
    try {
      revisions = (await collab.action("revisions")).revisions;
    } catch {}
  const d = dialog(
    "History & revisions",
    `<h3>This editing session</h3><div class="history-list">${
      store.history
        .slice(-12)
        .reverse()
        .map((x) => `<div>${icon("history", 15)} ${h(x.label)}</div>`)
        .join("") || '<p class="muted">Your next edit will appear here.</p>'
    }</div><h3>Saved ${isStatic ? "browser" : "cloud"} revisions</h3><div class="revision-list">${revisions.length ? revisions.map((r) => `<button data-revision="${r.revision}"><strong>Version ${r.revision}</strong><span>${h(r.author.split("@")[0])} · ${new Date(r.created).toLocaleString()}</span><span>Open as copy</span></button>`).join("") : (isStatic ? '<p class="muted">Save in this browser to keep the latest twenty revisions.</p>' : '<p class="muted">Save to the cloud to keep a revision history.</p>')}</div>`,
  );
  $$("[data-revision]", d).forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          const r = await collab.action("revision", {
            revision: Number(b.dataset.revision),
          });
          collab.persistDraft();
          r.document.name += " — version " + r.revision;
          collab.stop();
          collab.project = null;
          collab.base = null;
          store.replace(r.document);
          history.replaceState(null, "", location.pathname);
          d.close();
          fit();
          toast("Revision opened as a new local copy");
        } catch (e) {
          toast(e.message, true);
        }
      }),
  );
});
reg("comment-tool", "Comment on canvas", () => {
  setTool("comment");
  setTab("comments");
});
async function postComment(text, p = lastCursor) {
  if (!text.trim()) throw new Error("Write a comment first");
  if (!collab.project) await commands.execute("save");
  await collab.action("comment", {
    body: text,
    pageId: store.page.id,
    x: p.x,
    y: p.y,
  });
  await collab.sync();
  toast("Comment posted");
}
reg("post-comment", "Post comment", async () => {
  await postComment($("#comment-body").value);
  $("#comment-body").value = "";
});
function commentDialog(p) {
  const d = dialog(
    "Comment on artwork",
    `<textarea id="pin-comment" rows="4" placeholder="Share your feedback…" aria-label="Comment"></textarea><p class="muted">${h(store.page.name)} · ${number(p.x)}, ${number(p.y)}</p>`,
    `<button id="pin-post" class="primary-button">Post comment</button>`,
  );
  $("#pin-post", d).onclick = async () => {
    try {
      await postComment($("#pin-comment", d).value, p);
      d.close();
      setTab("comments");
      setTool("pointer");
    } catch (e) {
      toast(e.message, true);
    }
  };
}
reg(
  "command",
  "Find a command",
  () => {
    const d = dialog(
      "Find a command",
      `<input id="command-search" placeholder="Type a command…" aria-label="Search commands"><div id="command-results"></div>`,
    );
    function results() {
      const list = commands.search($("#command-search", d).value).slice(0, 14);
      $("#command-results", d).innerHTML = list
        .map(
          (c) =>
            `<button data-command-id="${c.id}">${h(c.title)}<kbd>${h(c.shortcut)}</kbd></button>`,
        )
        .join("");
      $$("[data-command-id]", d).forEach(
        (b) =>
          (b.onclick = () => {
            d.close();
            run(b.dataset.commandId);
          }),
      );
    }
    $("#command-search", d).oninput = results;
    $("#command-search", d).focus();
    results();
  },
  "Ctrl K",
);
reg("help", "Shortcuts and guide", () =>
  dialog(
    "Make something worth seeing",
    `<p>Draw shapes, edit Bézier curves, combine objects and compose multipage artwork. Every object in the sample is editable.</p><div class="shortcut-grid">${[
      ["V", "Select / move"],
      ["A", "Edit curve nodes"],
      ["P", "Bézier pen"],
      ["B", "Freehand curve"],
      ["R / E", "Rectangle / ellipse"],
      ["T", "Add text"],
      ["Space + drag", "Pan canvas"],
      ["Ctrl + wheel", "Zoom at pointer"],
      ["Shift + drag", "Constrain shape / transform"],
      ["Alt + drag", "Duplicate selection"],
      ["Ctrl Z", "Undo"],
      ["Ctrl Shift Z", "Redo"],
      ["Ctrl D", "Duplicate"],
      ["Ctrl G", "Group"],
      ["Ctrl K", "Find a command"],
      ["Enter", "Finish pen curve"],
      ["Escape", "Cancel / leave group"],
      ["Arrow keys", "Nudge 1 px; Shift 10 px"],
    ]
      .map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`)
      .join(
        "",
      )}</div><p class="muted">${isStatic ? "Projects save only in this browser. Download .vellum backups; the page URL does not share artwork." : "Projects save to cloud storage when signed in."} Vellum files include editable geometry, pages and styles. Imported fonts are embedded in the document. Text can be shaped with HarfBuzz and converted to outlines for controlled export.</p>`,
  ),
);
reg("about", "About Vellum", () =>
  dialog(
    "Vellum Vector Studio",
    `<div class="about-brand"><span class="brand-mark">v</span><h2>Vellum Studio <small>1.0.0</small></h2></div><p>A modular vector illustration and page-layout workspace built with plain JavaScript. Includes independent document, geometry, renderer, controls, I/O and collaboration modules.</p><p>WebGPU composites the artwork when available. SVG handles vector rasterization, editing and fallback rendering. Curve Boolean operations use Paper.js; vector PDF uses jsPDF and svg2pdf.js.</p><p class="muted">This release does not claim full compatibility with proprietary drawing formats, certified print output, mesh fills or native desktop plug-ins. See the included architecture and compatibility documentation.</p>`,
  ),
);
for (const a of ["left", "center", "right", "top", "middle", "bottom"])
  reg("align-" + a, "Align " + a, () => store.align(a));
reg("distribute-x", "Distribute horizontally", () => store.distribute("x"));
reg("distribute-y", "Distribute vertically", () => store.distribute("y"));
document.addEventListener("keydown", (e) => {
  if (
    e.target.matches("input,textarea,select,[contenteditable]") ||
    $("dialog[open]")
  )
    return;
  const mod = e.ctrlKey || e.metaKey,
    key = e.key.toLowerCase();
  if (key === "escape") {
    e.preventDefault();
    if (gesture) {
      gesture = null;
      store.cancel();
    } else if (pen) {
      pen = null;
      renderOverlay();
    } else if (isolate) {
      isolate = null;
      $("#isolation-breadcrumb").textContent = "";
    } else {
      store.select([]);
      setTool("pointer");
    }
    $(".menu-popup")?.remove();
    draw();
    return;
  }
  if (key === " ") {
    e.preventDefault();
    space = true;
    stage.style.cursor = "grab";
    return;
  }
  if (mod) {
    const map = {
      z: e.shiftKey ? "redo" : "undo",
      y: "redo",
      s: "save",
      o: "open",
      n: "new",
      d: "duplicate",
      g: e.shiftKey ? "ungroup" : "group",
      a: "select-all",
      c: "copy",
      x: "cut",
      v: "paste",
      q: "convert",
      k: "command",
      p: "print",
      e: e.shiftKey ? "export" : null,
    };
    if (map[key]) {
      e.preventDefault();
      run(map[key]);
    }
    return;
  }
  if (key === "enter" && pen) {
    finishPen();
    return;
  }
  if (["delete", "backspace"].includes(key)) {
    e.preventDefault();
    run("delete");
    return;
  }
  if (key.startsWith("arrow")) {
    e.preventDefault();
    const distance = e.shiftKey ? 10 : 1;
    store.update(
      [...store.selection],
      (n) => ({
        x:
          n.x +
          (key === "arrowleft"
            ? -distance
            : key === "arrowright"
              ? distance
              : 0),
        y:
          n.y +
          (key === "arrowup" ? -distance : key === "arrowdown" ? distance : 0),
      }),
      "Nudge objects",
    );
    return;
  }
  if (key === "[" || key === "]") {
    run(key === "[" ? "back" : "front");
    return;
  }
  if (key === "=" || key === "+") run("zoom-in");
  if (key === "-") run("zoom-out");
  if (key === "1") run("fit");
  if (key === "2") run("actual");
  if (key === "3") run("fit-selection");
  const t = tools.find((t) => t[2].toLowerCase() === key);
  if (t) {
    if (t[0] === "image") run("open");
    else setTool(t[0]);
  }
});
document.addEventListener("keyup", (e) => {
  if (e.key === " ") {
    space = false;
    stage.style.cursor = "";
  }
});
let observedPage = store.pageId,
  observedDocument = store.doc.id;
store.addEventListener("change", () => {
  draw();
  inspect();
  restoreFonts(store.doc)
    .then(() => draw())
    .catch((e) => toast(e.message, true));
});
store.addEventListener("selection", () => {
  if (
    observedPage !== store.pageId ||
    observedDocument !== store.doc.id ||
    (isolate && !store.nodes.some((n) => n.groupId === isolate))
  ) {
    isolate = null;
    pen = null;
    gesture = null;
    selectionNode = -1;
    $("#isolation-breadcrumb").textContent = "";
    observedPage = store.pageId;
    observedDocument = store.doc.id;
  }
  renderOverlay();
  inspect();
});
store.addEventListener("remote", () => {
  draw();
  inspect();
  restoreFonts(store.doc)
    .then(() => draw())
    .catch((e) => toast(e.message, true));
});
collab.addEventListener("status", (e) => {
  const { status, people, conflicts } = e.detail;
  const el = $("#save-status");
  const names = {
    saved: (isStatic ? "Saved in this browser" : "All changes saved"),
    saving: "Saving…",
    local: "Local draft",
    offline: "Offline · draft kept",
    conflict: "Conflicting edits",
    "draft-full": "Recovery storage full",
  };
  if (names[status]) {
    el.textContent = names[status];
    el.className =
      "save-status " +
      (status === "saved"
        ? "saved"
        : status === "offline" || status === "conflict"
          ? "warning"
          : "");
  }
  if (status === "presence") {
    comments = e.detail.comments;
    $("#comment-count").textContent =
      comments.filter((c) => !c.resolved).length || "";
    if (
      activeTab === "comments" &&
      document.activeElement?.id !== "comment-body"
    )
      renderComments();
    const unique = [...new Map(people.map((p) => [p.name, p])).values()];
    $("#people").innerHTML = unique.length
      ? unique
          .slice(0, 5)
          .map(
            (p) =>
              `<span class="avatar" title="${h(p.name)}">${h(p.name[0].toUpperCase())}</span>`,
          )
          .join("")
      : '<span class="avatar" title="You">Y</span>';
    $("#cursor-overlay").innerHTML = people
      .filter(
        (p) =>
          p.client_id !== collab.clientId &&
          p.page_id === store.page.id &&
          Number.isFinite(p.cursor?.x),
      )
      .map(
        (p) =>
          `<div class="remote-cursor" style="left:${pan.x + (p.cursor.x + (pageLayout(store.doc).find((v) => v.id === p.page_id)?.x || 0)) * zoom}px;top:${pan.y + p.cursor.y * zoom}px">${icon("pointer", 15)}<span>${h(p.name)}</span></div>`,
      )
      .join("");
  }
  if (status === "conflict" && !$(".conflict-dialog")) {
    const d = dialog(
      "Concurrent edits need review",
      `<p>Your changes are preserved. A collaborator changed the same properties:</p><ul>${(
        conflicts || []
      )
        .slice(0, 10)
        .map((c) => `<li>${h(c)}</li>`)
        .join(
          "",
        )}</ul><p>Create a recovered project to keep your version, or reload the server version. Your local recovery draft is retained.</p>`,
      `<button id="conflict-remote" class="secondary-button">Load server version</button><button id="conflict-fork" class="primary-button">Save my version as copy</button>`,
    );
    d.classList.add("conflict-dialog");
    $("#conflict-remote", d).onclick = async () => {
      await collab.acceptRemote();
      d.close();
    };
    $("#conflict-fork", d).onclick = async () => {
      try {
        await collab.forkConflict();
        d.close();
        toast("Recovered copy saved");
      } catch (e) {
        toast(e.message, true);
      }
    };
  }
});
window.addEventListener(
  "pagehide",
  () => {
    clearInterval(presenceTimer);
    clearTimeout(gpuTimer);
    collab.destroy();
    gpu.destroy();
  },
  { once: true },
);
let presenceTimer = setInterval(() => {
  if (!document.hidden) collab.presence(lastCursor);
}, 4000);
window.addEventListener("beforeunload", (e) => {
  collab.persistDraft();
  if (collab.dirty && collab.project) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("resize", () => {
  updateCamera();
  renderOverlay();
});
if (localStorage.getItem("vellum-theme") === "dark")
  document.body.classList.add("dark");
store.select([store.nodes[7].id]);
draw();
inspect();
requestAnimationFrame(() => fit());
gpu.initialize().then(() => draw());
async function boot() {
  const id = new URLSearchParams(location.search).get("project");
  try {
    await collab.initialize();
    cloudAvailable = true;
    if (id) {
      await collab.open(id);
      fit();
    }
  } catch (e) {
    $("#save-status").textContent = id
      ? (isStatic ? "Browser storage unavailable · local draft" : "Cloud unavailable · local draft")
      : "Local draft";
    if (id) toast((isStatic ? "Could not open the browser project: " : "Could not open the cloud project: ") + e.message, true);
  }
  try {
    const key = collab.draftKey(id),
      draft = JSON.parse(localStorage.getItem(key) || "null");
    if (
      draft &&
      draft.dirty !== false &&
      Date.now() - draft.updated < 604800000 &&
      draft.document &&
      JSON.stringify(draft.document) !== JSON.stringify(store.doc)
    ) {
      const d = dialog(
        "Recover unsaved artwork",
        `<p>A local recovery draft of <strong>${h(draft.document.name)}</strong> is available from ${new Date(draft.updated).toLocaleString()}.</p>`,
        `<button id="draft-dismiss" class="secondary-button">Keep current artwork</button><button id="draft-recover" class="primary-button">Recover as local copy</button>`,
      );
      $("#draft-dismiss", d).onclick = () => d.close();
      $("#draft-recover", d).onclick = () => {
        collab.stop();
        collab.project = null;
        collab.base = null;
        store.replace(draft.document);
        history.replaceState(null, "", location.pathname);
        d.close();
        fit();
        toast((isStatic ? "Recovered as a local copy; save in this browser or download a backup" : "Recovered as a local copy; save to create a cloud project"));
      };
    }
  } catch (e) {
    toast("Could not read the recovery draft: " + e.message, true);
  }
}

boot();
window.vellum = {
  store,
  renderer,
  gpu,
  commands,
  plugins,
  collaboration: collab,
  version: "2.0.0",
  exportSVG: () => toSVG(store.doc, store.page.id),
};
if (document.modelContext?.registerTool) {
  const abort = new AbortController();
  for (const definition of [
    {
      name: "vellum_read_document",
      description: "Read the active document and selection.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => ({
        document: clone(store.doc),
        selection: [...store.selection],
      }),
    },
    {
      name: "vellum_create_shapes",
      description: "Create editable shapes on the active page.",
      inputSchema: {
        type: "object",
        properties: {
          shapes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { enum: ["rect", "ellipse", "polygon", "text"] },
                x: { type: "number" },
                y: { type: "number" },
                width: { type: "number" },
                height: { type: "number" },
                fill: { type: "string" },
                text: { type: "string" },
              },
              required: ["type", "x", "y", "width", "height"],
              additionalProperties: false,
            },
          },
        },
        required: ["shapes"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => {
        if (
          !Array.isArray(input.shapes) ||
          !input.shapes.length ||
          input.shapes.length > 100
        )
          throw new Error("Provide 1–100 shapes");
        const nodes = input.shapes.map((s) => {
          if (
            !["rect", "ellipse", "polygon", "text"].includes(s.type) ||
            ![s.x, s.y, s.width, s.height].every(Number.isFinite) ||
            s.width <= 0 ||
            s.height <= 0
          )
            throw new Error("Invalid shape");
          return createNode(s.type, { ...s, pageId: store.page.id });
        });
        store.transact("Create shapes", (d) => d.nodes.push(...nodes));
        store.select(nodes.map((n) => n.id));
        return { ids: nodes.map((n) => n.id) };
      },
    },
  ])
    try {
      Promise.resolve(
        document.modelContext.registerTool(definition, {
          signal: abort.signal,
        }),
      ).catch(() => {});
    } catch {}
  window.addEventListener("pagehide", () => abort.abort(), { once: true });
}

installAdvancedUI({
  store,
  commands,
  menuData,
  draw,
  inspect,
  fit,
  stage,
  pagePoint,
  setTool,
  getTool: () => tool,
  getZoom: () => zoom,
  fitSpread: () => {
    const l = pageLayout(store.doc),
      w = l.at(-1).x + l.at(-1).width,
      h = Math.max(...l.map((p) => p.height));
    zoom = clamp(
      Math.min((stage.clientWidth - 100) / w, (stage.clientHeight - 100) / h),
      0.01,
      4,
    );
    pan = { x: 50, y: 50 };
    draw();
  },
  collab,
});

installStaticUI({ commands, collab });
