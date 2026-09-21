import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import paper from "paper";
const win = new Window({ url: "http://localhost/" });
for (const name of [
  "window",
  "document",
  "navigator",
  "location",
  "history",
  "localStorage",
  "HTMLElement",
  "Element",
  "SVGElement",
  "MutationObserver",
  "ResizeObserver",
  "DOMParser",
  "XMLSerializer",
  "DOMPoint",
  "EventTarget",
  "Event",
  "CustomEvent",
  "Image",
  "KeyboardEvent",
  "PointerEvent",
  "MouseEvent",
])
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: name === "window" ? win : win[name],
  });
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
globalThis.devicePixelRatio = 1;
globalThis.fetch = async () =>
  new Response(JSON.stringify({ error: "Offline test" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
win.HTMLCanvasElement.prototype.getContext = function () {
  return {
    font: "",
    measureText: (t) => ({ width: t.length * 12 }),
    isPointInPath: () => true,
    isPointInStroke: () => true,
    clearRect() {},
    drawImage() {},
  };
};
Object.defineProperty(win.HTMLElement.prototype, "clientWidth", {
  get() {
    return this.id === "stage" ? 1100 : 1600;
  },
});
Object.defineProperty(win.HTMLElement.prototype, "clientHeight", {
  get() {
    return this.id === "stage" ? 750 : 1000;
  },
});
win.document.body.innerHTML = '<div id="studio"></div>';
const io = await import("../public/studio/io/index.js");
io.configureGeometry(paper);
await import("../public/studio/app.js");
const app = win.vellum;
test("plain JS app boots with complete menus and all artboards", () => {
  assert.ok(app);
  assert.equal(app.version, "2.0.0");
  assert.equal(
    win.document.querySelectorAll(".spread-page").length,
    app.store.doc.pages.length - 1,
  );
  for (const id of [
    "mesh-fill",
    "envelope",
    "typography",
    "brush-settings",
    "page-manager",
    "structure",
    "color-management",
    "print-production",
    "administration",
  ])
    assert.ok(app.commands.commands.has(id), id);
});
test("mesh inspector applies editable fill data through a real control event", async () => {
  const n = app.store.doc.nodes.find(
    (n) => n.type === "rect" && n.pageId === app.store.pageId,
  );
  app.store.select([n.id]);
  await app.commands.execute("mesh-fill");
  assert.ok(win.document.querySelector("dialog .mesh-preview"));
  win.document.querySelector("#mesh-color").value = "#ff3300";
  win.document
    .querySelector("#mesh-color")
    .dispatchEvent(new win.Event("input"));
  win.document.querySelector("#mesh-apply").click();
  assert.equal(app.store.selected[0].mesh.points[0].color, "#ff3300");
});
test("typography inspector saves columns, features and direction", async () => {
  const n = app.store.doc.nodes.find(
    (n) => n.type === "text" && n.pageId === app.store.pageId,
  );
  app.store.select([n.id]);
  await app.commands.execute("typography");
  win.document.querySelector("#text-layout").value = "frame";
  win.document.querySelector("#text-columns").value = "2";
  win.document.querySelector("#text-direction").value = "rtl";
  win.document.querySelector("#text-apply").click();
  assert.equal(app.store.selected[0].textFrame.columns, 2);
  assert.equal(app.store.selected[0].direction, "rtl");
});
test("page manager copies an editable page and can reorder it", async () => {
  const old = app.store.doc.pages.length;
  await app.commands.execute("page-manager");
  win.document.querySelector("[data-page-copy]").click();
  assert.equal(app.store.doc.pages.length, old + 1);
  const last = app.store.doc.pages.at(-1).id;
  app.store.reorderPage(last, 0);
  assert.equal(app.store.doc.pages[0].id, last);
  assert.equal(
    win.document.querySelectorAll(".spread-page").length,
    app.store.doc.pages.length - 1,
  );
});
test.after(() => {
  win.dispatchEvent(new win.Event("pagehide"));
  app.collaboration.destroy();
  win.happyDOM.abort();
  win.close();
});
