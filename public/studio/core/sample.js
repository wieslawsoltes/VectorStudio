import { createDocument, createNode } from "./index.js";
export function sampleDocument() {
  const d = createDocument("Form & Future — identity exploration");
  d.pages[0] = {
    ...d.pages[0],
    name: "01 · Exhibition poster",
    width: 760,
    height: 980,
    background: "#f3f1e9",
  };
  const pageId = d.pages[0].id;
  const add = (type, p) => d.nodes.push(createNode(type, { pageId, ...p }));
  add("text", {
    name: "Edition",
    x: 48,
    y: 44,
    width: 420,
    height: 20,
    text: "FORM STUDIO   /   DESIGN EXHIBITION 2026",
    fontSize: 13,
    fontFamily: "Arial",
    fontWeight: 600,
    letterSpacing: 1.5,
    fill: "#222e2c",
  });
  add("text", {
    name: "Issue",
    x: 630,
    y: 44,
    width: 100,
    height: 20,
    text: "VOL. 08",
    fontSize: 13,
    fill: "#222e2c",
  });
  add("line", {
    name: "Top rule",
    x: 48,
    y: 83,
    width: 664,
    height: 0,
    fill: "none",
    stroke: "#333d37",
    strokeWidth: 1,
  });
  add("text", {
    name: "Form",
    x: 42,
    y: 111,
    width: 680,
    height: 147,
    text: "FORM",
    fontSize: 158,
    fontFamily: "Arial",
    fontWeight: 800,
    letterSpacing: -10,
    fill: "#183d33",
  });
  add("text", {
    name: "Future",
    x: 42,
    y: 264,
    width: 680,
    height: 126,
    text: "& FUTURE",
    fontSize: 111,
    fontFamily: "Arial",
    fontWeight: 800,
    letterSpacing: -7,
    fill: "#183d33",
  });
  add("text", {
    name: "Subtitle",
    x: 50,
    y: 413,
    width: 480,
    height: 28,
    text: "A new perspective on what comes next.",
    fontSize: 19,
    fontFamily: "Arial",
    fill: "#46544c",
  });
  add("rect", {
    name: "Sculpture / emerald",
    x: 51,
    y: 496,
    width: 320,
    height: 340,
    rx: 160,
    fill: "#007b60",
  });
  add("rect", {
    name: "Sculpture / lime",
    x: 235,
    y: 496,
    width: 320,
    height: 340,
    rx: 160,
    fill: "#c6ec74",
    rotation: -25,
  });
  add("ellipse", {
    name: "Sculpture / forest",
    x: 401,
    y: 508,
    width: 287,
    height: 287,
    fill: "#183d33",
  });
  add("ellipse", {
    name: "Sculpture / opening",
    x: 471,
    y: 578,
    width: 147,
    height: 147,
    fill: "#f3f1e9",
  });
  add("line", {
    name: "Bottom rule",
    x: 48,
    y: 876,
    width: 664,
    height: 0,
    fill: "none",
    stroke: "#899187",
    strokeWidth: 1,
  });
  add("text", {
    name: "Date",
    x: 48,
    y: 903,
    width: 200,
    height: 38,
    text: "OCT 16—28\n2026",
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.4,
    fill: "#183d33",
  });
  add("text", {
    name: "Venue",
    x: 304,
    y: 903,
    width: 220,
    height: 40,
    text: "THE DESIGN MUSEUM\nWARSAW, POLAND",
    fontSize: 13,
    lineHeight: 1.5,
    fill: "#183d33",
  });
  add("text", {
    name: "Website",
    x: 566,
    y: 903,
    width: 190,
    height: 40,
    text: "EXPLORING SHAPE.\nRETHINKING TOMORROW.",
    fontSize: 11,
    lineHeight: 1.6,
    fill: "#183d33",
  });
  const p2 = {
    id: crypto.randomUUID(),
    name: "02 · Social cover",
    width: 1000,
    height: 1000,
    background: "#183d33",
  };
  d.pages.push(p2);
  for (const n of [
    createNode("text", {
      name: "Social title",
      x: 72,
      y: 90,
      width: 860,
      height: 240,
      text: "FORM &\nFUTURE",
      fontSize: 142,
      fontWeight: 800,
      letterSpacing: -7,
      fill: "#c6ec74",
    }),
    createNode("ellipse", {
      name: "Circle",
      x: 320,
      y: 430,
      width: 580,
      height: 580,
      fill: "#c6ec74",
    }),
    createNode("ellipse", {
      name: "Circle cutout",
      x: 466,
      y: 576,
      width: 288,
      height: 288,
      fill: "#183d33",
    }),
    createNode("text", {
      name: "Exhibition details",
      x: 72,
      y: 846,
      width: 420,
      height: 90,
      text: "A NEW PERSPECTIVE.\nOCT 16—28 / WARSAW",
      fontSize: 20,
      lineHeight: 1.5,
      fill: "#f3f1e9",
    }),
  ])
    d.nodes.push({ ...n, pageId: p2.id });
  return d;
}
