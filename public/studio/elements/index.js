/** Reusable web components. DOM-only: no framework, server, or studio shell required. */
import {
  DocumentStore,
  createDocument,
  createNode,
  clone,
  uid,
  bounds,
  intersects,
} from "../core/index.js";
import { SVGRenderer } from "../render/index.js";
import { htmlEscape as escape, icon } from "../controls/index.js";
const baseCSS = `:host{display:block;font:13px system-ui,sans-serif;color:#263a31;box-sizing:border-box}*{box-sizing:border-box}button,input{font:inherit;color:inherit}button{cursor:pointer;border:1px solid #dce5df;background:white;border-radius:4px;padding:6px}button:hover{background:#e9f4ee}input{width:100%;padding:6px;border:1px solid #dce5df;border-radius:4px}button:focus-visible,input:focus-visible{outline:2px solid #087f68;outline-offset:2px}svg{display:block}button:disabled{opacity:.5}`;
class StoreElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._store = null;
    this.onChange = () => this.render();
  }
  set store(value) {
    if (this._store)
      for (const e of ["change", "selection", "remote"])
        this._store.removeEventListener(e, this.onChange);
    this._store = value;
    if (value)
      for (const e of ["change", "selection", "remote"])
        value.addEventListener(e, this.onChange);
    if (this.isConnected) this.render();
  }
  get store() {
    return this._store;
  }
  connectedCallback() {
    this.store = this._store || new DocumentStore(createDocument());
    this.render();
  }
  disconnectedCallback() {
    if (this._store)
      for (const e of ["change", "selection", "remote"])
        this._store.removeEventListener(e, this.onChange);
  }
  emit(name, detail) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true }),
    );
  }
}
export class VellumPropertyGrid extends StoreElement {
  constructor() {
    super();
    this.schema = [
      { key: "x", label: "X", type: "number" },
      { key: "y", label: "Y", type: "number" },
      { key: "width", label: "Width", type: "number", min: 1 },
      { key: "height", label: "Height", type: "number", min: 1 },
      { key: "rotation", label: "Rotation", type: "number" },
      { key: "fill", label: "Fill", type: "color" },
      { key: "strokeWidth", label: "Stroke", type: "number", min: 0 },
      {
        key: "opacity",
        label: "Opacity",
        type: "number",
        min: 0,
        max: 1,
        step: 0.01,
      },
    ];
  }
  render() {
    if (!this.store) return;
    const n = this.store.selected[0];
    this.shadowRoot.innerHTML = `<style>${baseCSS}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:15px}label{display:flex;flex-direction:column;gap:5px;font-size:11px;color:#718479}h3{font-size:13px;margin:0;padding:15px;border-bottom:1px solid #dce5df}p{padding:15px;color:#718479}input[type=color]{height:29px;padding:0}</style><h3>${n ? escape(n.name) : "Properties"}</h3>${n ? `<div class="grid">${this.schema.map((f) => `<label>${escape(f.label)}<input data-key="${escape(f.key)}" type="${f.type || "text"}" value="${escape(f.type === "color" && !/^#[0-9a-f]{6}$/i.test(n[f.key]) ? "#000000" : (n[f.key] ?? ""))}" ${f.min != null ? `min="${f.min}"` : ""} ${f.max != null ? `max="${f.max}"` : ""} step="${f.step || 1}"></label>`).join("")}</div>` : "<p>Select an object on the canvas.</p>"}`;
    this.shadowRoot.onchange = (e) => {
      const key = e.target.dataset.key,
        s = this.schema.find((f) => f.key === key);
      if (!s) return;
      let value = s.type === "number" ? Number(e.target.value) : e.target.value;
      if (
        s.type === "number" &&
        (!Number.isFinite(value) ||
          (s.min != null && value < s.min) ||
          (s.max != null && value > s.max))
      ) {
        this.render();
        return;
      }
      try {
        this.store.update(
          [...this.store.selection],
          (n) => {
            const patch = { [key]: value };
            if ((key === "width" || key === "height") && n.points) {
              const axis = key === "width" ? "x" : "y",
                ratio = value / Math.max(1, n[key]);
              patch.points = n.points.map((point) => {
                const p = clone(point);
                p[axis] *= ratio;
                for (const k of ["in", "out"]) if (p[k]) p[k][axis] *= ratio;
                return p;
              });
            }
            if (key === "height" && n.type === "text")
              patch.fontSize = (n.fontSize * value) / Math.max(1, n.height);
            if (key === "fill") patch.gradient = null;
            return patch;
          },
          "Set " + key,
        );
        this.emit("property-change", { key, value });
      } catch (error) {
        this.emit("editor-error", { message: error.message });
        this.render();
      }
    };
  }
}
export class VellumObjectTree extends StoreElement {
  render() {
    if (!this.store) return;
    this.shadowRoot.innerHTML = `<style>${baseCSS}h3{font-size:13px;padding:14px;margin:0;border-bottom:1px solid #dce5df}.row{display:flex;align-items:center;gap:7px;padding:4px}.select{border:0;flex:1;text-align:left;display:flex;align-items:center;gap:8px;font-size:12px;overflow:hidden}.active{background:#e0f3ea}.visibility{padding:4px;border:0}span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style><h3>Objects</h3>${[
      ...this.store.nodes,
    ]
      .reverse()
      .map(
        (n) =>
          `<div class="row ${this.store.selection.has(n.id) ? "active" : ""}"><button class="select" data-id="${n.id}">${icon(n.type === "path" ? "nodes" : n.type, 15)}<span>${escape(n.name)}</span></button><button class="visibility" data-toggle="${n.id}" title="Toggle visibility">${n.visible === false ? "○" : "●"}</button></div>`,
      )
      .join("")}`;
    this.shadowRoot.onclick = (e) => {
      const b = e.target.closest("button");
      if (b?.dataset.id)
        this.store.select(
          e.shiftKey ? [...this.store.selection, b.dataset.id] : [b.dataset.id],
        );
      if (b?.dataset.toggle)
        this.store.transact("Toggle visibility", (d) => {
          const n = d.nodes.find((n) => n.id === b.dataset.toggle);
          n.visible = n.visible === false;
        });
    };
  }
}
export class VellumColorPalette extends StoreElement {
  constructor() {
    super();
    this.colors = [
      "#183d33",
      "#007b60",
      "#17aa91",
      "#c6ec74",
      "#f3f1e9",
      "#ffffff",
      "#f18d62",
      "#8e8ad8",
    ];
  }
  render() {
    this.shadowRoot.innerHTML = `<style>${baseCSS}.palette{display:flex;gap:6px;padding:12px;flex-wrap:wrap}button{width:26px;height:26px;border-radius:4px;border:1px solid #0002}</style><div class="palette">${this.colors.map((c) => `<button title="${escape(c)}" aria-label="Fill ${escape(c)}" data-color="${escape(c)}" style="background:${/^#[0-9a-f]{3,8}$/i.test(c) ? c : "#000"}"></button>`).join("")}</div>`;
    this.shadowRoot.onclick = (e) => {
      const color = e.target.dataset.color;
      if (color) {
        this.store?.update(
          [...this.store.selection],
          {
            [e.shiftKey ? "stroke" : "fill"]: color,
            ...(!e.shiftKey ? { gradient: null } : {}),
          },
          "Set color",
        );
        this.emit("color-change", { color, stroke: e.shiftKey });
      }
    };
  }
}
export class VellumCanvas extends StoreElement {
  constructor() {
    super();
    this.zoom = 1;
    this.pan = { x: 30, y: 30 };
    this.tool = "select";
    this.fill = "#17aa91";
    this.gesture = null;
    this.drawn = false;
  }
  connectedCallback() {
    super.connectedCallback();
    this.observer = new ResizeObserver(() => this.fit());
    this.observer.observe(this);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.observer?.disconnect();
    this.renderer?.destroy();
  }
  fit() {
    if (!this.store) return;
    const p = this.store.page;
    this.zoom = Math.min(
      (this.clientWidth - 60) / p.width,
      (this.clientHeight - 60) / p.height,
    );
    this.zoom = Math.max(0.02, this.zoom);
    this.pan = {
      x: (this.clientWidth - p.width * this.zoom) / 2,
      y: (this.clientHeight - p.height * this.zoom) / 2,
    };
    this.render();
  }
  setTool(tool) {
    if (!["select", "rect", "ellipse", "text", "pan"].includes(tool))
      throw new Error("Unsupported canvas tool");
    this.tool = tool;
  }
  render() {
    if (!this.store) return;
    if (!this.drawn) {
      this.drawn = true;
      this.shadowRoot.innerHTML = `<style>${baseCSS}:host{height:500px;min-height:200px;position:relative;background:#e8edeb;overflow:hidden;touch-action:none}.world{position:absolute;transform-origin:0 0;background:white;box-shadow:0 4px 20px #16352420}.art{width:100%;height:100%;display:block}.selection{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}.view{position:absolute;inset:0;outline:none}.box{fill:none;stroke:#087f68}</style><div class="view" tabindex="0" aria-label="Vellum vector canvas"><div class="world"><svg class="art" xmlns="http://www.w3.org/2000/svg"></svg><svg class="selection" xmlns="http://www.w3.org/2000/svg"></svg></div></div>`;
      this.view = this.shadowRoot.querySelector(".view");
      this.world = this.shadowRoot.querySelector(".world");
      this.overlay = this.shadowRoot.querySelector(".selection");
      this.renderer = new SVGRenderer(this.shadowRoot.querySelector(".art"));
      this.view.addEventListener("pointerdown", (e) => this.pointerDown(e));
      this.view.addEventListener("pointermove", (e) => this.pointerMove(e));
      this.view.addEventListener("pointerup", (e) => this.pointerUp(e));
      this.view.addEventListener("pointercancel", () => {
        this.gesture = null;
        this.store.cancel();
      });
      this.view.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          const r = this.view.getBoundingClientRect(),
            x = e.clientX - r.left,
            y = e.clientY - r.top,
            z = Math.min(
              12,
              Math.max(0.02, this.zoom * Math.exp(-e.deltaY * 0.002)),
            );
          this.pan = {
            x: x - ((x - this.pan.x) * z) / this.zoom,
            y: y - ((y - this.pan.y) * z) / this.zoom,
          };
          this.zoom = z;
          this.render();
        },
        { passive: false },
      );
      this.view.onkeydown = (e) => {
        if (e.key === "Delete") {
          this.store.remove();
          e.preventDefault();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "z") {
          e.shiftKey ? this.store.redo() : this.store.undo();
          e.preventDefault();
        }
        if (e.key === "Escape") {
          this.gesture = null;
          this.store.cancel();
          this.store.select([]);
        }
      };
    }
    const p = this.store.page;
    Object.assign(this.world.style, {
      width: p.width + "px",
      height: p.height + "px",
      transform: `translate(${this.pan.x}px,${this.pan.y}px) scale(${this.zoom})`,
    });
    this.renderer.render(this.store.doc, p.id);
    this.overlay.setAttribute("viewBox", `0 0 ${p.width} ${p.height}`);
    this.overlay.innerHTML = this.store.selected
      .map((n) => {
        const b = bounds(n);
        return `<rect class="box" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" stroke-width="${1 / this.zoom}"/>`;
      })
      .join("");
  }
  point(e) {
    const r = this.view.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - this.pan.x) / this.zoom,
      y: (e.clientY - r.top - this.pan.y) / this.zoom,
    };
  }
  pointerDown(e) {
    if (e.button !== 0) return;
    this.view.focus();
    this.view.setPointerCapture(e.pointerId);
    const p = this.point(e);
    if (this.tool === "pan") {
      this.gesture = {
        kind: "pan",
        x: e.clientX,
        y: e.clientY,
        pan: { ...this.pan },
      };
      return;
    }
    if (this.tool === "select") {
      const candidates = this.store.index
          .query({ x: p.x, y: p.y, width: 1, height: 1 })
          .filter((n) => !n.locked),
        n = candidates.at(-1);
      this.store.select(
        n ? (e.shiftKey ? [...this.store.selection, n.id] : [n.id]) : [],
      );
      if (n) {
        this.store.begin();
        this.gesture = {
          kind: "move",
          point: p,
          nodes: clone(this.store.selected.filter((n) => !n.locked)),
        };
      }
      return;
    }
    const type = this.tool;
    if (type === "text") {
      this.store.add("text", {
        x: p.x,
        y: p.y,
        width: 260,
        height: 60,
        text: "New text",
        fontSize: 48,
        fill: this.fill,
      });
      return;
    }
    this.store.begin();
    const n = createNode(type, {
      pageId: this.store.page.id,
      x: p.x,
      y: p.y,
      width: 1,
      height: 1,
      fill: this.fill,
    });
    this.store.doc.nodes.push(n);
    this.store.select([n.id]);
    this.gesture = { kind: "draw", point: p, id: n.id };
    this.render();
  }
  pointerMove(e) {
    const g = this.gesture;
    if (!g) return;
    const p = this.point(e);
    if (g.kind === "pan") {
      this.pan = { x: g.pan.x + e.clientX - g.x, y: g.pan.y + e.clientY - g.y };
    }
    if (g.kind === "move")
      for (const original of g.nodes) {
        const n = this.store.doc.nodes.find((n) => n.id === original.id);
        n.x = original.x + p.x - g.point.x;
        n.y = original.y + p.y - g.point.y;
      }
    if (g.kind === "draw") {
      const n = this.store.doc.nodes.find((n) => n.id === g.id);
      Object.assign(n, {
        x: Math.min(p.x, g.point.x),
        y: Math.min(p.y, g.point.y),
        width: Math.max(1, Math.abs(p.x - g.point.x)),
        height: Math.max(1, Math.abs(p.y - g.point.y)),
      });
      if (e.shiftKey) n.width = n.height = Math.max(n.width, n.height);
    }
    this.render();
  }
  pointerUp(e) {
    const g = this.gesture;
    this.gesture = null;
    if (this.view.hasPointerCapture(e.pointerId))
      this.view.releasePointerCapture(e.pointerId);
    if (g && g.kind !== "pan")
      this.store.commit(g.kind === "draw" ? "Draw shape" : "Move selection");
    this.render();
    this.emit("canvas-change", { document: this.store.doc });
  }
}
export function registerElements(prefix = "vellum") {
  for (const [name, Class] of [
    ["canvas", VellumCanvas],
    ["property-grid", VellumPropertyGrid],
    ["object-tree", VellumObjectTree],
    ["color-palette", VellumColorPalette],
  ])
    if (!customElements.get(prefix + "-" + name))
      customElements.define(prefix + "-" + name, class extends Class {});
}
