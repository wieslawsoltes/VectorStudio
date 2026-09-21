import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createDocument,
  createNode,
  DocumentStore,
  effectiveLocked,
  validateDocument,
} from "../public/studio/core/index.js";
import {
  createMesh,
  meshCells,
  bilinear,
  brushOutline,
} from "../public/studio/advanced/index.js";
import { toSVG } from "../public/studio/render/index.js";
import { sanitizeSVG } from "../public/studio/svg/index.js";
import {
  Y,
  createReplica,
  applyDocumentChanges,
  materializeDocument,
  validateReplica,
} from "../public/studio/collab/crdt.js";
import {
  layoutText,
  shapedOutlines,
  visualRuns,
} from "../public/studio/typography/index.js";
const doc = () => {
  const d = createDocument();
  d.nodes.push(
    createNode("text", { pageId: d.pages[0].id, text: "abc", fontSize: 24 }),
  );
  return d;
};
const replicas = () => {
  const d = doc(),
    seed = createReplica(d),
    a = createReplica(),
    b = createReplica();
  for (const r of [a, b]) Y.applyUpdate(r, Y.encodeStateAsUpdate(seed));
  return { d, a, b };
};
test("nested groups composite once and inherit lock", () => {
  const d = doc();
  d.nodes.push(createNode("rect", { pageId: d.pages[0].id }));
  const s = new DocumentStore(d);
  s.select(d.nodes.map((n) => n.id));
  s.group();
  const inner = s.doc.groups[0];
  s.doc.nodes.push(createNode("ellipse", { pageId: s.pageId }));
  s.select(s.doc.nodes.map((n) => n.id));
  s.group();
  assert.equal(s.doc.groups.length, 2);
  assert.ok(inner.parentId);
  s.transact(
    "lock",
    (d) => (d.groups.find((g) => g.id === inner.parentId).locked = true),
  );
  assert.equal(effectiveLocked(s.doc, s.doc.nodes[0]), true);
  assert.equal((toSVG(s.doc).match(/data-group=/g) || []).length, 2);
});
test("duplicate page remaps nested groups and text links", () => {
  const d = doc();
  d.nodes.push(createNode("text", { pageId: d.pages[0].id, text: "def" }));
  d.nodes[0].nextFrame = d.nodes[1].id;
  const s = new DocumentStore(d);
  s.select(d.nodes.map((n) => n.id));
  s.group();
  const p = s.duplicatePage();
  const ns = s.doc.nodes.filter((n) => n.pageId === p.id);
  assert.equal(ns[0].nextFrame, ns[1].id);
  assert.notEqual(ns[0].groupId, d.nodes[0].groupId);
  validateDocument(s.doc);
  s.deletePage(p.id);
  validateDocument(s.doc);
});
test("cyclic group and frame structures reject transaction", () => {
  const d = doc();
  d.nodes[0].nextFrame = d.nodes[0].id;
  assert.throws(() => validateDocument(d), /cycle/);
});
test("mesh and envelope produce real geometry", () => {
  const mesh = createMesh();
  assert.equal(meshCells(mesh, 300, 200).length, 144);
  assert.deepEqual(
    bilinear(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 1 },
        { x: 0, y: 1 },
      ],
      0.5,
      0.5,
    ),
    { x: 0.75, y: 0.5 },
  );
  const d = doc();
  d.nodes = [createNode("rect", { pageId: d.pages[0].id, mesh })];
  assert.match(toSVG(d), /clip-path/);
  assert.match(toSVG(d), /<polygon/);
});
test("pressure and calligraphy outlines vary in width", () => {
  const samples = [
    { x: 0, y: 0, pressure: 0.1 },
    { x: 20, y: 0, pressure: 1 },
  ];
  const p = brushOutline(samples, { size: 20, pressure: true });
  assert.equal(p.length, 4);
  assert.equal(p[0].y, 1);
  assert.equal(p[1].y, 10);
  const calligraphy = brushOutline(samples, {
    size: 20,
    pressure: false,
    kind: "calligraphy",
    angle: 0,
    aspect: 0.2,
  });
  assert.equal(calligraphy[0].y, 2);
});
test("SVG preservation retains filters masks and text paths, strips active/external content", () => {
  const s = sanitizeSVG(
    '<svg viewBox="0 0 100 100"><defs><path id="p" d="M0 0L100 100"/><filter id="f"><feGaussianBlur stdDeviation="2"/></filter></defs><text filter="url(#f)"><textPath href="#p">Hello</textPath></text><script>alert(1)</script><image href="https://evil.example/a.png"/><rect onclick="bad()" style="fill:#123456;filter:url(https://evil.example)"></rect></svg>',
    { prefix: "a-" },
  );
  assert.match(s.svg, /textPath href="#a-p"/);
  assert.match(s.svg, /feGaussianBlur/);
  assert.doesNotMatch(s.svg, /script|onclick|https:/);
  assert.equal(sanitizeSVG(s.svg).svg, s.svg);
});
test("Yjs concurrent fields and character inserts survive", () => {
  const { d, a, b } = replicas(),
    da = structuredClone(d),
    db = structuredClone(d);
  da.nodes[0].x = 91;
  da.nodes[0].text = "aXbc";
  db.nodes[0].fill = "#abcdef";
  db.nodes[0].text = "aYbc";
  applyDocumentChanges(a, d, da);
  applyDocumentChanges(b, d, db);
  const ua = Y.encodeStateAsUpdate(a),
    ub = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, ub);
  Y.applyUpdate(b, ua);
  const out = validateReplica(a);
  assert.deepEqual(out, validateReplica(b));
  assert.equal(out.nodes[0].x, 91);
  assert.equal(out.nodes[0].fill, "#abcdef");
  assert.match(out.nodes[0].text, /^a(XY|YX)bc$/);
});
test("Yjs repeated and out of order delivery converges without duplicate text", () => {
  const { d, a, b } = replicas(),
    next = structuredClone(d),
    updates = [];
  a.on("update", (u) => updates.push(u));
  next.nodes[0].text = "abc!";
  applyDocumentChanges(a, d, next);
  const after = structuredClone(next);
  after.nodes[0].text = "abc!!";
  applyDocumentChanges(a, next, after);
  for (const u of [...updates].reverse()) Y.applyUpdate(b, u);
  for (const u of updates) Y.applyUpdate(b, u);
  assert.equal(materializeDocument(b).nodes[0].text, "abc!!");
});
test("Yjs concurrent reorders produce unique deterministic pages", () => {
  const d = doc();
  for (let i = 0; i < 3; i++)
    d.pages.push({ ...d.pages[0], id: crypto.randomUUID(), name: "Page " + i });
  const seed = createReplica(d),
    a = createReplica(),
    b = createReplica();
  for (const r of [a, b]) Y.applyUpdate(r, Y.encodeStateAsUpdate(seed));
  const x = structuredClone(d),
    y = structuredClone(d);
  x.pages.reverse();
  y.pages.push(y.pages.shift());
  applyDocumentChanges(a, d, x);
  applyDocumentChanges(b, d, y);
  const ua = Y.encodeStateAsUpdate(a),
    ub = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, ub);
  Y.applyUpdate(b, ua);
  assert.deepEqual(materializeDocument(a), materializeDocument(b));
  assert.equal(new Set(materializeDocument(a).pages.map((p) => p.id)).size, 4);
});
test("CRDT local undo preserves a remote field edit", () => {
  const { d, a, b } = replicas(),
    manager = new Y.UndoManager(a.getMap("nodes"), {
      trackedOrigins: new Set(["vellum-local"]),
    }),
    da = structuredClone(d),
    db = structuredClone(d);
  da.nodes[0].x = 80;
  db.nodes[0].y = 99;
  applyDocumentChanges(a, d, da);
  applyDocumentChanges(b, d, db);
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b), "remote");
  manager.undo();
  const out = materializeDocument(a);
  assert.equal(out.nodes[0].x, 0);
  assert.equal(out.nodes[0].y, 99);
});
test("Unicode paragraph columns report overflow and preserve source offsets", () => {
  const n = {
      text: "alpha beta gamma delta",
      fontSize: 10,
      lineHeight: 1,
      width: 60,
      height: 10,
      textFrame: { columns: 2, gap: 0, inset: 0 },
    },
    layout = layoutText(n, (t) => t.length * 5);
  assert.equal(layout.lines.length, 2);
  assert.equal(layout.overset, true);
  assert.equal(n.text.slice(layout.consumed), layout.remaining);
});
test("HarfBuzz shapes Arabic joining and Latin ligatures from real font", async () => {
  const bytes = new Uint8Array(await readFile(process.env.VELLUM_TEST_FONT || "tests/fixtures/DejaVuSans.ttf"));
  const n = { text: "office", fontSize: 32, width: 500, height: 100 };
  const shaped = await shapedOutlines(n, bytes);
  assert.ok(shaped.paths.length < 6);
  assert.equal(shaped.missingGlyphs, false);
  const arabic = await shapedOutlines(
    { ...n, text: "سلام", direction: "rtl" },
    bytes,
  );
  assert.ok(arabic.paths.length > 0);
  assert.equal(arabic.missingGlyphs, false);
  assert.ok(visualRuns("abc שלום xyz").some((r) => r.rtl));
});
test("SVG dimensions honor physical units and viewport separately from viewBox", () => {
  assert.equal(
    sanitizeSVG(
      '<svg width="100" height="50" viewBox="0 0 1000 500"><path d="M0 0L2 2"/></svg>',
    ).width,
    100,
  );
  assert.ok(
    Math.abs(
      sanitizeSVG('<svg width="210mm" height="297mm"/>').width - 793.7007874,
    ) < 0.001,
  );
  const d = doc(),
    safe = sanitizeSVG(
      '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
    );
  d.nodes = [
    createNode("svg", {
      pageId: d.pages[0].id,
      width: 80,
      height: 40,
      fill: "none",
      svg: safe.svg,
    }),
  ];
  const svg = toSVG(d);
  assert.match(svg, /width="80" height="40"|height="40"[^>]*width="80"/);
  assert.match(svg, /fill="#000000"/);
});
test("local property edit does not overwrite a remote reorder", () => {
  const d = doc();
  d.nodes.push(createNode("rect", { pageId: d.pages[0].id }));
  const replica = createReplica(d),
    remote = structuredClone(d);
  remote.nodes.reverse();
  applyDocumentChanges(replica, d, remote);
  const local = structuredClone(d);
  local.nodes[0].fill = "#ff0000";
  applyDocumentChanges(replica, d, local);
  assert.deepEqual(
    materializeDocument(replica).nodes.map((n) => n.id),
    remote.nodes.map((n) => n.id),
  );
});
test("forged CRDT entity ID is rejected", () => {
  const d = doc(),
    r = createReplica(d);
  r.getMap("nodes").get(d.nodes[0].id).set("id", "forged");
  assert.throws(() => validateReplica(r), /Invalid CRDT field/);
});
