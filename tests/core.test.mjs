import test from "node:test";
import assert from "node:assert/strict";
import {
  createDocument,
  createNode,
  DocumentStore,
  Matrix,
  bounds,
  SpatialIndex,
  validateDocument,
  splitCubic,
  cubic,
} from "../public/studio/core/index.js";
import { sampleDocument } from "../public/studio/core/sample.js";
import {
  diffDocument,
  mergeChanges,
  CollaborationClient,
} from "../public/studio/collab/index.js";
import { toSVG } from "../public/studio/render/index.js";
const fixture = () => {
  const d = createDocument("Test");
  d.nodes.push(
    createNode("rect", {
      pageId: d.pages[0].id,
      name: "A",
      x: 20,
      y: 30,
      width: 100,
      height: 80,
    }),
    createNode("ellipse", {
      pageId: d.pages[0].id,
      name: "B",
      x: 70,
      y: 50,
      width: 60,
      height: 60,
    }),
  );
  return d;
};
test("matrix inversion roundtrips rotated points", () => {
  const m = [0.8, 0.6, -0.6, 0.8, 200, -80],
    p = { x: 12, y: 37 };
  const q = Matrix.point(Matrix.inverse(m), Matrix.point(m, p));
  assert.ok(Math.abs(q.x - p.x) < 1e-9);
  assert.ok(Math.abs(q.y - p.y) < 1e-9);
});
test("cubic split preserves curve position", () => {
  const p = [
      { x: 0, y: 0 },
      { x: 20, y: 80 },
      { x: 70, y: -10 },
      { x: 100, y: 50 },
    ],
    split = splitCubic(...p, 0.4);
  assert.deepEqual(split[0][3], split[1][0]);
  const q = cubic(...p, 0.4);
  assert.ok(Math.abs(q.x - split[0][3].x) < 1e-9);
});
test("sample validates and exports all visible objects", () => {
  const d = sampleDocument();
  validateDocument(d);
  const svg = toSVG(d);
  assert.ok(svg.includes("FORM"));
  assert.ok(svg.includes("Exhibition poster"));
  assert.equal((svg.match(/data-node=/g) || []).length, 14);
});
test("transaction, undo, redo, duplicate and selection", () => {
  const s = new DocumentStore(fixture());
  s.select([s.nodes[0].id]);
  s.update([...s.selection], { x: 300 }, "Move");
  assert.equal(s.nodes[0].x, 300);
  s.undo();
  assert.equal(s.nodes[0].x, 20);
  s.redo();
  assert.equal(s.nodes[0].x, 300);
  s.duplicate();
  assert.equal(s.nodes.length, 3);
  assert.equal(s.selected[0].x, 324);
});
test("invalid transaction rolls back and rebuilds spatial index", () => {
  const s = new DocumentStore(fixture()),
    id = s.nodes[0].id;
  assert.throws(() => s.update([id], { width: -10 }));
  assert.equal(
    s.index
      .query({ x: 20, y: 30, width: 1, height: 1 })
      .find((n) => n.id === id).width,
    100,
  );
});
test("oversized spatial objects use coarse bucket", () => {
  const index = new SpatialIndex(),
    n = createNode("rect", { width: 100000, height: 100000 });
  index.rebuild([n]);
  assert.equal(index.large.size, 1);
  assert.equal(index.cells.size, 0);
  assert.equal(
    index.query({ x: 99999, y: 99999, width: 1, height: 1 }).length,
    1,
  );
});
test("different fields on the same object merge", () => {
  const d = fixture(),
    local = structuredClone(d),
    remote = structuredClone(d);
  local.nodes[0].x = 150;
  remote.nodes[0].fill = "#ff0000";
  const m = mergeChanges(remote, diffDocument(d, local));
  assert.deepEqual(m.conflicts, []);
  assert.equal(m.document.nodes[0].x, 150);
  assert.equal(m.document.nodes[0].fill, "#ff0000");
});
test("same-field concurrent edits conflict without mutation", () => {
  const d = fixture(),
    local = structuredClone(d),
    remote = structuredClone(d);
  local.nodes[0].x = 150;
  remote.nodes[0].x = 250;
  const m = mergeChanges(remote, diffDocument(d, local));
  assert.equal(m.conflicts.length, 1);
  assert.equal(m.document.nodes[0].x, 250);
});
test("insertions at bottom and middle preserve stacking", () => {
  for (const position of [0, 1, 2]) {
    const d = fixture(),
      after = structuredClone(d);
    after.nodes.splice(
      position,
      0,
      createNode("rect", { pageId: d.pages[0].id }),
    );
    const m = mergeChanges(d, diffDocument(d, after));
    assert.deepEqual(m.conflicts, []);
    assert.deepEqual(
      m.document.nodes.map((n) => n.id),
      after.nodes.map((n) => n.id),
    );
  }
});
test("concurrent additions survive ordering merge", () => {
  const d = fixture(),
    after = structuredClone(d),
    remote = structuredClone(d);
  after.nodes.unshift(createNode("rect", { pageId: d.pages[0].id }));
  remote.nodes.push(createNode("rect", { pageId: d.pages[0].id }));
  const m = mergeChanges(remote, diffDocument(d, after));
  assert.equal(m.conflicts.length, 0);
  assert.equal(m.document.nodes.length, 4);
  assert.equal(m.document.nodes[0].id, after.nodes[0].id);
});
test("delete versus edit conflicts", () => {
  const d = fixture(),
    after = structuredClone(d),
    remote = structuredClone(d);
  after.nodes.shift();
  remote.nodes[0].fill = "#000000";
  assert.equal(
    mergeChanges(remote, diffDocument(d, after)).conflicts.length,
    1,
  );
});
test("styles and page modifications are synchronized", () => {
  const d = fixture(),
    after = structuredClone(d);
  after.styles = [{ name: "Green", fill: "#008855" }];
  after.pages[0].width = 2000;
  const m = mergeChanges(d, diffDocument(d, after));
  assert.deepEqual(m.document, after);
});
test("injection, unbounded polygon, malformed handle rejected", () => {
  for (const mutation of [
    (n) => (n.fontWeight = '400" onmouseover="alert(1)'),
    (n) => (n.id = '" onclick="bad'),
    (n) => {
      n.type = "polygon";
      n.sides = 1e12;
    },
    (n) =>
      (n.gradient = {
        type: "linear",
        stops: [
          { offset: '0" onload="x', color: "#fff" },
          { offset: 1, color: "#000" },
        ],
      }),
    (n) => (n.points = [{ x: 0, y: 0, in: { x: "bad", y: 0 } }]),
    (n) => (n.src = "javascript:alert(1)"),
  ]) {
    const d = fixture();
    mutation(d.nodes[0]);
    assert.throws(() => validateDocument(d));
  }
});
test("SVG text and names are escaped", () => {
  const d = fixture();
  d.nodes.push(
    createNode("text", {
      pageId: d.pages[0].id,
      text: '<script>alert("x")</script>',
      fontSize: 20,
    }),
  );
  const s = toSVG(d);
  assert.ok(!s.includes("<script>"));
  assert.ok(s.includes("&lt;script&gt;"));
});
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, v),
};
globalThis.history = { replaceState() {} };
test("edits during cloud creation remain dirty", async () => {
  const store = new DocumentStore(fixture()),
    c = new CollaborationClient(store);
  let respond;
  c.request = () => new Promise((r) => (respond = r));
  const sent = structuredClone(store.doc),
    pending = c.create();
  store.update([store.nodes[0].id], { x: 300 });
  respond({ id: "cloud1", revision: 1, document: sent });
  await pending;
  assert.equal(c.dirty, true);
  assert.equal(c.base.nodes[0].x, 20);
  assert.equal(store.doc.nodes[0].x, 300);
  c.destroy();
});
test("late response cannot overwrite a newly opened document", async () => {
  const store = new DocumentStore(fixture()),
    c = new CollaborationClient(store),
    old = structuredClone(store.doc);
  c.project = { id: "old", revision: 1 };
  c.base = structuredClone(old);
  c.start();
  let resolveOld;
  c.request = (path) =>
    path.includes("old")
      ? new Promise((r) => (resolveOld = r))
      : Promise.resolve({
          id: "new",
          revision: 1,
          document: { ...fixture(), name: "New project" },
        });
  const syncing = c.sync();
  await c.open("new");
  resolveOld({
    id: "old",
    revision: 2,
    document: { ...old, name: "Wrong project" },
  });
  await syncing;
  assert.equal(store.doc.name, "New project");
  assert.equal(c.project.id, "new");
  c.destroy();
});
test("remote snapshot is deferred during a pointer transaction", async () => {
  const store = new DocumentStore(fixture()),
    c = new CollaborationClient(store);
  c.project = { id: "p", revision: 1 };
  c.base = structuredClone(store.doc);
  c.start();
  let respond;
  c.request = () => new Promise((r) => (respond = r));
  const pending = c.sync();
  store.begin();
  store.doc.nodes[0].x = 999;
  respond({ revision: 2, document: { ...fixture(), name: "Remote" } });
  await pending;
  assert.equal(store.doc.nodes[0].x, 999);
  assert.equal(c.project.revision, 1);
  store.cancel();
  c.destroy();
});
