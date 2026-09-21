/** Vellum Core — framework-free document, geometry, spatial index and history. MIT. */
import { validateSVG } from "../svg/index.js";
import { validateAdvanced, envelopePoints } from "../advanced/index.js";
import {
  validateStructure,
  effectiveLocked,
  effectiveVisible,
  ancestors,
  inGroup,
} from "./structure.js";
export * from "./structure.js";
export const VERSION = "2.0.0";
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `v${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
export const clone = (value) => structuredClone(value);
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const Matrix = {
  identity: () => [1, 0, 0, 1, 0, 0],
  multiply: (a, b) => [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ],
  point: (m, p) => ({
    x: m[0] * p.x + m[2] * p.y + m[4],
    y: m[1] * p.x + m[3] * p.y + m[5],
  }),
  inverse(m) {
    const d = m[0] * m[3] - m[1] * m[2];
    if (Math.abs(d) < 1e-12) throw new Error("Singular transform");
    return [
      m[3] / d,
      -m[1] / d,
      -m[2] / d,
      m[0] / d,
      (m[2] * m[5] - m[3] * m[4]) / d,
      (m[1] * m[4] - m[0] * m[5]) / d,
    ];
  },
};
export function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x:
      u * u * u * p0.x +
      3 * u * u * t * p1.x +
      3 * u * t * t * p2.x +
      t * t * t * p3.x,
    y:
      u * u * u * p0.y +
      3 * u * u * t * p1.y +
      3 * u * t * t * p2.y +
      t * t * t * p3.y,
  };
}
export function splitCubic(p0, p1, p2, p3, t = 0.5) {
  const mix = (a, b) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const a = mix(p0, p1),
    b = mix(p1, p2),
    c = mix(p2, p3),
    d = mix(a, b),
    e = mix(b, c),
    f = mix(d, e);
  return [
    [p0, a, d, f],
    [f, e, c, p3],
  ];
}
export function objectMatrix(n) {
  const a = ((n.rotation || 0) * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    sx = n.flipX ? -1 : 1,
    sy = n.flipY ? -1 : 1;
  return [
    c * sx,
    s * sx,
    -s * sy,
    c * sy,
    n.x + n.width / 2 - (c * sx * n.width) / 2 + (s * sy * n.height) / 2,
    n.y + n.height / 2 - (s * sx * n.width) / 2 - (c * sy * n.height) / 2,
  ];
}
export function bounds(n) {
  const m = objectMatrix(n),
    p = (
      n.envelope && n.points?.length
        ? envelopePoints(
            n.points,
            n.envelope,
            n.width || 1,
            n.height || 1,
          ).flatMap((p) => [p, p.in, p.out].filter(Boolean))
        : [
            { x: 0, y: 0 },
            { x: n.width, y: 0 },
            { x: n.width, y: n.height },
            { x: 0, y: n.height },
          ]
    ).map((p) => Matrix.point(m, p));
  const x = Math.min(...p.map((v) => v.x)),
    y = Math.min(...p.map((v) => v.y));
  return {
    x,
    y,
    width: Math.max(...p.map((v) => v.x)) - x,
    height: Math.max(...p.map((v) => v.y)) - y,
  };
}
export function unionBounds(nodes) {
  if (!nodes.length) return { x: 0, y: 0, width: 0, height: 0 };
  const b = nodes.map(bounds),
    x = Math.min(...b.map((v) => v.x)),
    y = Math.min(...b.map((v) => v.y));
  return {
    x,
    y,
    width: Math.max(...b.map((v) => v.x + v.width)) - x,
    height: Math.max(...b.map((v) => v.y + v.height)) - y,
  };
}
export function intersects(a, b) {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}
export function pointInPolygon(p, vertices) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i],
      b = vertices[j];
    if (
      a.y > p.y != b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export class SpatialIndex {
  constructor(cellSize = 128) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.nodes = new Map();
    this.large = new Set();
    this.order = new Map();
  }
  keys(b) {
    if (
      (Math.ceil(b.width / this.cellSize) + 2) *
        (Math.ceil(b.height / this.cellSize) + 2) >
      4096
    )
      return null;
    const a = [];
    for (
      let x = Math.floor(b.x / this.cellSize);
      x <= Math.floor((b.x + b.width) / this.cellSize);
      x++
    )
      for (
        let y = Math.floor(b.y / this.cellSize);
        y <= Math.floor((b.y + b.height) / this.cellSize);
        y++
      )
        a.push(`${x}:${y}`);
    return a;
  }
  rebuild(nodes) {
    this.cells.clear();
    this.nodes.clear();
    this.large.clear();
    this.order.clear();
    for (const n of nodes) {
      if (n.visible === false) continue;
      this.order.set(n.id, this.order.size);
      this.nodes.set(n.id, n);
      const keys = this.keys(bounds(n));
      if (!keys) {
        this.large.add(n.id);
        continue;
      }
      for (const k of keys) {
        if (!this.cells.has(k)) this.cells.set(k, new Set());
        this.cells.get(k).add(n.id);
      }
    }
  }
  query(b) {
    const keys = this.keys(b);
    if (!keys)
      return [...this.nodes.values()].filter((n) => intersects(bounds(n), b));
    const ids = new Set(this.large);
    for (const k of keys) for (const id of this.cells.get(k) || []) ids.add(id);
    return [...ids]
      .sort((a, b) => this.order.get(a) - this.order.get(b))
      .map((id) => this.nodes.get(id))
      .filter((n) => intersects(bounds(n), b));
  }
}
export function createNode(type, props = {}) {
  return {
    id: uid(),
    type,
    name: type[0].toUpperCase() + type.slice(1),
    x: 0,
    y: 0,
    width: 160,
    height: 120,
    rotation: 0,
    fill: "#17aa91",
    stroke: "none",
    strokeWidth: 1,
    opacity: 1,
    visible: true,
    locked: false,
    ...props,
  };
}
export function createDocument(name = "Untitled artwork") {
  return {
    format: "vellum",
    version: 1,
    id: uid(),
    name,
    units: "px",
    colorSpace: "sRGB",
    pages: [
      {
        id: uid(),
        name: "Page 1",
        width: 800,
        height: 1000,
        background: "#ffffff",
      },
    ],
    nodes: [],
    guides: [],
  };
}
const types = new Set([
  "rect",
  "ellipse",
  "path",
  "polygon",
  "text",
  "image",
  "line",
  "svg",
]);
export function validateDocument(doc) {
  const id = (v) => typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
  const finite = (v, min = -100000, max = 100000) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const text = (v, max) => typeof v === "string" && v.length <= max;
  const color = (v) =>
    typeof v === "string" && /^(#[a-f0-9]{3,8}|[a-z]{1,24})$/i.test(v);
  const fail = (message) => {
    throw new Error("Invalid " + message);
  };
  const style = (n) => {
    for (const k of ["fill", "stroke"])
      if (n[k] != null && !color(n[k])) fail("color");
    for (const k of [
      "strokeWidth",
      "fontSize",
      "letterSpacing",
      "lineHeight",
      "rx",
      "rotation",
      "opacity",
      "fontWeight",
      "innerRadius",
      "sides",
      "nativeWidth",
      "nativeHeight",
      "clipRadius",
    ])
      if (n[k] != null && !finite(n[k])) fail(k);
    if (n.opacity != null && !finite(n.opacity, 0, 1)) fail("opacity");
    if (
      n.sides != null &&
      (!Number.isInteger(n.sides) || !finite(n.sides, 3, 128))
    )
      fail("polygon sides");
    if (
      n.nativeWidth != null &&
      (!finite(n.nativeWidth, 0.000001) || !finite(n.nativeHeight, 0.000001))
    )
      fail("native dimensions");
    if (n.dash != null && !/^(none|[0-9. ,]{1,100})$/.test(n.dash))
      fail("stroke dash");
    for (const k of ["lineCap", "lineJoin", "textAlign", "clip", "fillRule"])
      if (n[k] != null && !/^[a-z-]{1,24}$/.test(n[k])) fail(k);
    if (n.fontFamily != null && !text(n.fontFamily, 200)) fail("font family");
    if (n.gradient) {
      const g = n.gradient;
      if (
        !["linear", "radial"].includes(g.type) ||
        !finite(g.angle ?? 0) ||
        !Array.isArray(g.stops) ||
        g.stops.length < 2 ||
        g.stops.length > 32
      )
        fail("gradient");
      for (const stop of g.stops)
        if (!finite(stop.offset, 0, 1) || !color(stop.color))
          fail("gradient stop");
    }
    if (n.shadow) {
      for (const k of ["x", "y", "blur", "opacity"])
        if (n.shadow[k] != null && !finite(n.shadow[k])) fail("shadow");
      if (n.shadow.color && !color(n.shadow.color)) fail("shadow color");
    }
  };
  if (
    !doc ||
    doc.format !== "vellum" ||
    doc.version !== 1 ||
    !id(doc.id) ||
    !text(doc.name, 180) ||
    !Array.isArray(doc.pages) ||
    !doc.pages.length ||
    !Array.isArray(doc.nodes)
  )
    throw new Error("Not a supported Vellum document");
  if (doc.nodes.length > 20000 || doc.pages.length > 100)
    throw new Error("Document exceeds supported limits");
  const pages = new Set(),
    ids = new Set();
  for (const p of doc.pages) {
    if (
      !id(p.id) ||
      pages.has(p.id) ||
      !text(p.name, 200) ||
      ![p.width, p.height].every((v) => finite(v, 1, 20000)) ||
      !color(p.background)
    )
      fail("page");
    pages.add(p.id);
  }
  for (const n of doc.nodes) {
    if (
      !id(n.id) ||
      ids.has(n.id) ||
      !types.has(n.type) ||
      !pages.has(n.pageId) ||
      !text(n.name, 300)
    )
      fail("or duplicate object");
    ids.add(n.id);
    if (
      ![n.x, n.y, n.width, n.height, n.rotation || 0].every((v) => finite(v)) ||
      n.width < 0 ||
      n.height < 0
    )
      fail("object geometry");
    for (const key of [
      "visible",
      "locked",
      "closed",
      "flipX",
      "flipY",
      "star",
      "italic",
      "underline",
    ])
      if (n[key] != null && typeof n[key] !== "boolean") fail(key);
    if (n.groupId != null && !id(n.groupId)) fail("group");
    style(n);
    if (n.text != null && !text(n.text, 100000)) fail("text");
    if (
      n.d != null &&
      (!text(n.d, 1000000) ||
        !/^[MmZzLlHhVvCcSsQqTtAaEe0-9\s,.+\-]*$/.test(n.d))
    )
      fail("path data");
    if (n.points) {
      if (!Array.isArray(n.points) || n.points.length > 20000)
        fail("path nodes");
      for (const p of n.points)
        for (const point of [p, p.in, p.out].filter(Boolean))
          if (!finite(point.x) || !finite(point.y)) fail("path node");
    }
    if (
      n.src &&
      !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(n.src)
    )
      throw new Error("Only embedded raster images are supported");
  }
  if (doc.guides) {
    if (!Array.isArray(doc.guides) || doc.guides.length > 1000) fail("guides");
    for (const g of doc.guides)
      if (
        !["x", "y"].includes(g.axis) ||
        !finite(g.value) ||
        (g.pageId && !pages.has(g.pageId))
      )
        fail("guide");
  }
  if (doc.styles) {
    if (!Array.isArray(doc.styles) || doc.styles.length > 1000) fail("styles");
    for (const v of doc.styles) {
      if (!text(v.name, 300)) fail("style name");
      style(v);
    }
  }
  for (const n of doc.nodes) if (n.type === "svg") validateSVG(n.svg);
  validateAdvanced(doc, fail);
  validateStructure(doc, fail);
  if (new TextEncoder().encode(JSON.stringify(doc)).length > 8_000_000)
    throw new Error("Document exceeds 8 MB");
  return doc;
}
export class DocumentStore extends EventTarget {
  constructor(doc = createDocument()) {
    super();
    this.doc = clone(validateDocument(doc));
    this.history = [];
    this.future = [];
    this.maxHistoryBytes = 32 * 1024 * 1024;
    this.selection = new Set();
    this.pageId = doc.pages[0].id;
    this.index = new SpatialIndex();
    this.reindex();
  }
  pushHistory(record) {
    record.bytes =
      (JSON.stringify(record.before).length +
        JSON.stringify(record.after).length) *
      2;
    this.history.push(record);
    let bytes = this.history.reduce((sum, h) => sum + (h.bytes || 0), 0);
    while (
      this.history.length > 1 &&
      (this.history.length > 100 || bytes > this.maxHistoryBytes)
    )
      bytes -= this.history.shift().bytes || 0;
  }
  get page() {
    return (
      this.doc.pages.find((p) => p.id === this.pageId) || this.doc.pages[0]
    );
  }
  get nodes() {
    return this.doc.nodes.filter((n) => n.pageId === this.page.id);
  }
  get selected() {
    return this.doc.nodes.filter((n) => this.selection.has(n.id));
  }
  emit(kind = "change", label = "") {
    this.dispatchEvent(
      new CustomEvent(kind, { detail: { label, doc: this.doc } }),
    );
  }
  reindex() {
    this.index.rebuild(this.nodes.filter((n) => effectiveVisible(this.doc, n)));
  }
  select(ids) {
    this.selection = new Set(
      ids.filter((id) => this.doc.nodes.some((n) => n.id === id)),
    );
    this.emit("selection");
  }
  transact(label, fn) {
    if (this.readOnly) throw new Error("This project is read-only");
    const before = clone(this.doc);
    try {
      fn(this.doc);
      validateDocument(this.doc);
    } catch (e) {
      this.doc = before;
      this.reindex();
      this.emit("remote");
      throw e;
    }
    if (JSON.stringify(before) === JSON.stringify(this.doc)) return;
    this.pushHistory({ label, before, after: clone(this.doc) });
    this.future = [];
    this.reindex();
    this.emit("change", label);
  }
  begin() {
    if (this.readOnly) throw new Error("This project is read-only");
    this.pending = clone(this.doc);
  }
  commit(label) {
    if (!this.pending) return;
    const before = this.pending;
    this.pending = null;
    if (JSON.stringify(before) === JSON.stringify(this.doc)) return;
    try {
      validateDocument(this.doc);
    } catch (e) {
      this.doc = before;
      this.reindex();
      this.emit("remote");
      throw e;
    }
    this.pushHistory({ label, before, after: clone(this.doc) });
    this.future = [];
    this.reindex();
    this.emit("change", label);
  }
  cancel() {
    if (this.pending) {
      this.doc = this.pending;
      this.pending = null;
      this.reindex();
      this.emit();
    }
  }
  update(ids, patch, label = "Edit properties") {
    this.transact(label, (doc) => {
      for (const n of doc.nodes)
        if (ids.includes(n.id) && !effectiveLocked(this.doc, n))
          Object.assign(n, typeof patch === "function" ? patch(n) : patch);
    });
  }
  add(type, props = {}) {
    const n = createNode(type, { pageId: this.page.id, ...props });
    this.transact(`Create ${type}`, (d) => d.nodes.push(n));
    this.select([n.id]);
    return n;
  }
  remove() {
    const ids = this.selection;
    this.transact("Delete objects", (d) => {
      d.nodes = d.nodes.filter((n) => !ids.has(n.id) || effectiveLocked(d, n));
      for (const n of d.nodes)
        if (n.nextFrame && !d.nodes.some((x) => x.id === n.nextFrame))
          n.nextFrame = null;
    });
    this.select([]);
  }
  duplicate(offset = 24) {
    const source = this.selected.filter((n) => !effectiveLocked(this.doc, n)),
      ids = new Map(source.map((n) => [n.id, uid()])),
      gm = new Map(
        (this.doc.groups || [])
          .filter((g) =>
            this.doc.nodes
              .filter((n) => inGroup(this.doc, n, g.id))
              .every((n) => ids.has(n.id)),
          )
          .map((g) => [g.id, uid()]),
      );
    const copies = source.map((n) => ({
      ...clone(n),
      id: ids.get(n.id),
      x: n.x + offset,
      y: n.y + offset,
      groupId: gm.get(n.groupId) || null,
      nextFrame: ids.get(n.nextFrame) || null,
    }));
    this.transact("Duplicate", (d) => {
      d.nodes.push(...copies);
      d.groups ??= [];
      d.groups.push(
        ...d.groups
          .filter((g) => gm.has(g.id))
          .map((g) => ({
            ...clone(g),
            id: gm.get(g.id),
            parentId: gm.get(g.parentId) || null,
          })),
      );
    });
    this.select(copies.map((n) => n.id));
  }
  undo() {
    const h = this.history.pop();
    if (!h) return;
    this.future.push(h);
    this.doc = clone(h.before);
    this.reindex();
    this.select([...this.selection]);
    this.emit("change", `Undo ${h.label}`);
  }
  redo() {
    const h = this.future.pop();
    if (!h) return;
    this.history.push(h);
    this.doc = clone(h.after);
    this.reindex();
    this.select([...this.selection]);
    this.emit("change", `Redo ${h.label}`);
  }
  replace(doc, remote = false) {
    this.doc = clone(validateDocument(doc));
    if (!this.doc.pages.some((p) => p.id === this.pageId))
      this.pageId = this.doc.pages[0].id;
    this.history = [];
    this.future = [];
    this.reindex();
    this.select([...this.selection]);
    this.emit(remote ? "remote" : "change");
  }
  align(mode) {
    const ns = this.selected.filter((n) => !effectiveLocked(this.doc, n)),
      b = unionBounds(ns);
    this.transact(`Align ${mode}`, () => {
      for (const n of ns) {
        const a = bounds(n);
        if (mode === "left") n.x += b.x - a.x;
        if (mode === "right") n.x += b.x + b.width - a.x - a.width;
        if (mode === "top") n.y += b.y - a.y;
        if (mode === "bottom") n.y += b.y + b.height - a.y - a.height;
        if (mode === "center") n.x += b.x + b.width / 2 - a.x - a.width / 2;
        if (mode === "middle") n.y += b.y + b.height / 2 - a.y - a.height / 2;
      }
    });
  }
  distribute(axis = "x") {
    const ns = this.selected
      .filter((n) => !effectiveLocked(this.doc, n))
      .sort((a, b) => a[axis] - b[axis]);
    if (ns.length < 3) return;
    const size = axis === "x" ? "width" : "height",
      start = ns[0][axis],
      end = ns.at(-1)[axis] + ns.at(-1)[size],
      gap =
        (end - start - ns.reduce((s, n) => s + n[size], 0)) / (ns.length - 1);
    this.transact("Distribute objects", () => {
      let p = start;
      for (const n of ns) {
        n[axis] = p;
        p += n[size] + gap;
      }
    });
  }
  group() {
    const ns = this.selected.filter((n) => !effectiveLocked(this.doc, n));
    if (ns.length < 2) return;
    const groupId = uid(),
      selected = new Set(ns.map((n) => n.id));
    this.transact("Group objects", (d) => {
      d.groups ??= [];
      const complete = d.groups.filter((g) =>
        d.nodes
          .filter((n) => inGroup(d, n, g.id))
          .every((n) => selected.has(n.id)),
      );
      const roots = complete.filter(
        (g) => !complete.some((p) => p.id === g.parentId),
      );
      for (const g of roots) g.parentId = groupId;
      for (const n of ns)
        if (!roots.some((g) => inGroup(d, n, g.id))) n.groupId = groupId;
      d.groups.push({
        id: groupId,
        pageId: this.pageId,
        name: "Group",
        parentId: null,
        opacity: 1,
        visible: true,
        locked: false,
      });
    });
  }
  ungroup() {
    const gs = new Set(
      this.selected
        .map((n) => ancestors(this.doc, n).at(-1)?.id || n.groupId)
        .filter(Boolean),
    );
    this.transact("Ungroup objects", (d) => {
      for (const n of d.nodes) if (gs.has(n.groupId)) n.groupId = null;
      for (const g of d.groups || []) if (gs.has(g.parentId)) g.parentId = null;
      d.groups = (d.groups || []).filter((g) => !gs.has(g.id));
    });
  }
  reorderPage(id, index) {
    this.transact("Reorder page", (d) => {
      const i = d.pages.findIndex((p) => p.id === id);
      if (i < 0) return;
      const [p] = d.pages.splice(i, 1);
      d.pages.splice(clamp(index, 0, d.pages.length), 0, p);
    });
  }
  moveToPage(ids, pageId) {
    if (!this.doc.pages.some((p) => p.id === pageId))
      throw new Error("Page not found");
    this.update(ids, { pageId, groupId: null }, "Move objects to page");
  }
  duplicatePage(id = this.pageId) {
    const p = this.doc.pages.find((p) => p.id === id),
      page = { ...clone(p), id: uid(), name: p.name + " copy" },
      map = new Map();
    for (const g of this.doc.groups || [])
      if (g.pageId === id) map.set(g.id, uid());
    const nodes = this.doc.nodes.filter((n) => n.pageId === id),
      nodeIds = new Map(nodes.map((n) => [n.id, uid()]));
    this.transact("Duplicate page", (d) => {
      d.pages.splice(d.pages.indexOf(p) + 1, 0, page);
      d.groups ??= [];
      d.groups.push(
        ...d.groups
          .filter((g) => g.pageId === id)
          .map((g) => ({
            ...clone(g),
            id: map.get(g.id),
            parentId: map.get(g.parentId) || null,
            pageId: page.id,
          })),
      );
      d.nodes.push(
        ...nodes.map((n) => ({
          ...clone(n),
          id: nodeIds.get(n.id),
          pageId: page.id,
          groupId: map.get(n.groupId) || null,
          nextFrame: nodeIds.get(n.nextFrame) || null,
        })),
      );
    });
    return page;
  }
  deletePage(id = this.pageId) {
    if (this.doc.pages.length === 1) throw new Error("Keep at least one page");
    this.transact("Delete page", (d) => {
      d.pages = d.pages.filter((p) => p.id !== id);
      d.nodes = d.nodes.filter((n) => n.pageId !== id);
      d.groups = (d.groups || []).filter((g) => g.pageId !== id);
      d.guides = (d.guides || []).filter((g) => g.pageId !== id);
      for (const n of d.nodes)
        if (n.nextFrame && !d.nodes.some((v) => v.id === n.nextFrame))
          n.nextFrame = null;
    });
    if (this.pageId === id) this.pageId = this.doc.pages[0].id;
    this.reindex();
    this.select([]);
  }

  arrange(mode) {
    const ids = this.selection;
    this.transact(`Arrange ${mode}`, (d) => {
      if (mode === "front")
        d.nodes = [
          ...d.nodes.filter((n) => !ids.has(n.id)),
          ...d.nodes.filter((n) => ids.has(n.id)),
        ];
      else if (mode === "back")
        d.nodes = [
          ...d.nodes.filter((n) => ids.has(n.id)),
          ...d.nodes.filter((n) => !ids.has(n.id)),
        ];
      else {
        const direction = mode === "forward" ? 1 : -1;
        const indices = d.nodes
          .map((n, i) => (ids.has(n.id) ? i : -1))
          .filter((i) => i >= 0);
        if (direction > 0) indices.reverse();
        for (const i of indices) {
          const j = i + direction;
          if (
            j >= 0 &&
            j < d.nodes.length &&
            !ids.has(d.nodes[j].id) &&
            d.nodes[j].pageId === d.nodes[i].pageId
          )
            [d.nodes[i], d.nodes[j]] = [d.nodes[j], d.nodes[i]];
        }
      }
    });
  }
}
export class PluginRegistry {
  constructor() {
    this.plugins = new Map();
    this.commands = new Map();
    this.exporters = new Map();
  }
  register(plugin) {
    if (!plugin?.id || this.plugins.has(plugin.id))
      throw new Error("Unique plugin id required");
    this.plugins.set(plugin.id, plugin);
    for (const [k, v] of Object.entries(plugin.commands || {}))
      this.commands.set(k, v);
    for (const [k, v] of Object.entries(plugin.exporters || {}))
      this.exporters.set(k, v);
    return () => {
      this.plugins.delete(plugin.id);
      for (const k of Object.keys(plugin.commands || {}))
        this.commands.delete(k);
      for (const k of Object.keys(plugin.exporters || {}))
        this.exporters.delete(k);
    };
  }
  execute(name, context) {
    if (!this.commands.has(name)) throw new Error(`Unknown command: ${name}`);
    return this.commands.get(name)(context);
  }
}
