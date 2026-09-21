import test from "node:test";
import assert from "node:assert/strict";
import paper from "paper";
import {
  configureGeometry,
  booleanOperation,
  convertToPath,
  editableNodes,
  breakApart,
  textToOutlines,
} from "../public/studio/io/index.js";
import { createNode } from "../public/studio/core/index.js";
configureGeometry(paper);
test("Boolean subtraction creates a real curve, not its bounding primitive", async () => {
  const a = createNode("rect", { x: 0, y: 0, width: 100, height: 100 }),
    b = createNode("rect", { x: 50, y: 0, width: 100, height: 100 }),
    result = await booleanOperation([a, b], "subtract");
  assert.equal(result.type, "path");
  assert.equal(result.width, 50);
  assert.equal(result.height, 100);
  assert.ok(result.d.length > 5);
});
test("circle conversion retains Bezier geometry", async () => {
  const n = await convertToPath(
    createNode("ellipse", { x: 20, y: 30, width: 200, height: 100 }),
  );
  assert.equal(n.type, "path");
  assert.match(n.d, /[cC]/);
  assert.equal(n.x, 20);
  assert.equal(n.width, 200);
});
test("Boolean intersection yields overlap area", async () => {
  const a = createNode("rect", { x: 0, y: 0, width: 100, height: 100 }),
    b = createNode("rect", { x: 60, y: 70, width: 100, height: 100 }),
    r = await booleanOperation([a, b], "intersect");
  assert.ok(Math.abs(r.x - 60) < 1e-8);
  assert.ok(Math.abs(r.y - 70) < 1e-8);
  assert.ok(Math.abs(r.width - 40) < 1e-8);
  assert.ok(Math.abs(r.height - 30) < 1e-8);
});
test("rotated rectangle converts to world-space editable nodes", async () => {
  const a = createNode("rect", {
      x: 20,
      y: 30,
      width: 100,
      height: 50,
      rotation: 90,
    }),
    r = await editableNodes(a);
  assert.equal(r.rotation, 0);
  assert.equal(r.type, "path");
  assert.equal(r.points.length, 4);
  assert.ok(Math.abs(r.width - 50) < 1e-8);
  assert.ok(Math.abs(r.height - 100) < 1e-8);
});
test("compound paths break into independently editable pieces", async () => {
  const a = createNode("ellipse", { x: 0, y: 0, width: 100, height: 100 }),
    b = createNode("ellipse", { x: 25, y: 25, width: 50, height: 50 }),
    r = await booleanOperation([a, b], "subtract"),
    parts = await breakApart(r);
  assert.equal(parts.length, 2);
  assert.ok(parts.every((n) => n.type === "path"));
});
