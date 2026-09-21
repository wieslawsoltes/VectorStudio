import { performance } from "node:perf_hooks";
import { createNode, SpatialIndex } from "../public/studio/core/index.js";
const nodes = Array.from({ length: 10000 }, (_, i) =>
  createNode("rect", {
    x: (i % 100) * 30,
    y: Math.floor(i / 100) * 30,
    width: 20,
    height: 20,
  }),
);
const index = new SpatialIndex(),
  start = performance.now();
index.rebuild(nodes);
const build = performance.now() - start;
let matches = 0;
const q = performance.now();
for (let i = 0; i < 10000; i++)
  matches += index.query({
    x: (i % 100) * 30 + 5,
    y: Math.floor(i / 100) * 30 + 5,
    width: 1,
    height: 1,
  }).length;
const query = performance.now() - q;
console.log(
  JSON.stringify(
    {
      environment: process.version,
      objects: nodes.length,
      indexBuildMs: Math.round(build * 100) / 100,
      pointQueries: 10000,
      totalQueryMs: Math.round(query * 100) / 100,
      averageQueryMs: Math.round((query / 10000) * 10000) / 10000,
      matches,
    },
    null,
    2,
  ),
);
