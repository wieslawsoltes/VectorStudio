import { sanitizeSVG } from "../svg/index.js";
import { toBase64, fromBase64 } from "../color/index.js";
import {
  shapedOutlines,
  flowDocument,
  matchingFont,
} from "../typography/index.js";
import {
  effectiveVisible,
  createNode,
  createDocument,
  uid,
  validateDocument,
  objectMatrix,
} from "../core/index.js";
import { toSVG, nodeMarkup, pathData, escapeXML } from "../render/index.js";
export function download(data, name, type = "application/json") {
  const url = URL.createObjectURL(
      data instanceof Blob ? data : new Blob([data], { type }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const safeName = (name) =>
  name.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 100) || "artwork";
const sessionFonts = new Set();
export async function rasterize(
  doc,
  pageId,
  { scale = 2, transparent = false } = {},
) {
  const page = doc.pages.find((p) => p.id === pageId),
    w = Math.ceil(page.width * scale),
    h = Math.ceil(page.height * scale);
  if (w * h > 64_000_000)
    throw new Error("Export exceeds 64 megapixels; reduce the scale");
  const svg = toSVG(doc, pageId, { transparent }),
    url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Image export failed"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function exportPDF(doc, pages = doc.pages) {
  const { jsPDF } = await import("../vendor/pdf.js");
  const first = pages[0],
    pdf = new jsPDF({
      orientation: first.width > first.height ? "landscape" : "portrait",
      unit: "pt",
      format: [first.width * 0.75, first.height * 0.75],
      compress: true,
    });
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (i)
      pdf.addPage(
        [p.width * 0.75, p.height * 0.75],
        p.width > p.height ? "landscape" : "portrait",
      );
    const svg = new DOMParser().parseFromString(
      toSVG(doc, p.id),
      "image/svg+xml",
    ).documentElement;
    await pdf.svg(svg, {
      x: 0,
      y: 0,
      width: p.width * 0.75,
      height: p.height * 0.75,
    });
  }
  return pdf.output("blob");
}
let paperScope;
export function configureGeometry(paper) {
  paperScope = new paper.PaperScope();
  paperScope.setup(new paperScope.Size(1, 1));
  return paperScope;
}
export async function geometry() {
  if (!paperScope) {
    const { paper } = await import("../vendor/geometry.js");
    paperScope = new paper.PaperScope();
    paperScope.setup(new paperScope.Size(1, 1));
  }
  paperScope.activate();
  return paperScope;
}
export async function paperPath(n) {
  const p = await geometry();
  let item;
  if (n.type === "path") item = new p.CompoundPath(pathData(n));
  else if (n.type === "rect")
    item = new p.Path.Rectangle({
      point: [0, 0],
      size: [n.width, n.height],
      radius: Math.min(n.rx || 0, n.width / 2, n.height / 2),
    });
  else if (n.type === "ellipse")
    item = new p.Path.Ellipse({ rectangle: [0, 0, n.width, n.height] });
  else if (n.type === "line")
    item = new p.Path.Line([0, 0], [n.width, n.height]);
  else if (n.type === "polygon") {
    item = new p.Path();
    const count = (n.sides || 6) * (n.star ? 2 : 1);
    for (let i = 0; i < count; i++) {
      const a = (i * 2 * Math.PI) / count - Math.PI / 2,
        r = n.star && i % 2 ? n.innerRadius || 0.45 : 1;
      item.add([
        n.width / 2 + ((Math.cos(a) * n.width) / 2) * r,
        n.height / 2 + ((Math.sin(a) * n.height) / 2) * r,
      ]);
    }
    item.closed = true;
  } else
    throw new Error(
      "Convert text to outlines with an imported font before this operation",
    );
  if (n.type === "path" && n.nativeWidth)
    item.scale(
      n.width / n.nativeWidth,
      n.height / n.nativeHeight,
      new p.Point(0, 0),
    );
  item.transform(new p.Matrix(...objectMatrix(n)));
  return item;
}
function fromPaper(item, style = {}) {
  const b = item.bounds.clone();
  item.translate([-b.x, -b.y]);
  const w = Math.max(b.width, 0.01),
    h = Math.max(b.height, 0.01);
  const n = createNode("path", {
    ...style,
    type: "path",
    id: uid(),
    x: b.x,
    y: b.y,
    width: w,
    height: h,
    nativeWidth: w,
    nativeHeight: h,
    rotation: 0,
    flipX: false,
    flipY: false,
    envelope: null,
    brush: null,
    d: item.pathData,
    points: undefined,
  });
  item.remove();
  return n;
}
export async function booleanOperation(nodes, operation) {
  if (nodes.length < 2) throw new Error("Select at least two shapes");
  if (!["unite", "subtract", "intersect", "exclude"].includes(operation))
    throw new Error("Invalid Boolean operation");
  const p = await geometry();
  try {
    let result = await paperPath(nodes[0]);
    for (const n of nodes.slice(1)) {
      const next = await paperPath(n),
        old = result;
      result = result[operation](next);
      old.remove();
      next.remove();
    }
    if (result.isEmpty())
      throw new Error("The operation produced an empty shape");
    return fromPaper(result, {
      ...nodes[0],
      name: {
        unite: "Union",
        subtract: "Difference",
        intersect: "Intersection",
        exclude: "Exclusion",
      }[operation],
      gradient: null,
      shadow: null,
    });
  } finally {
    p.project.clear();
  }
}
export async function convertToPath(n) {
  const p = await geometry();
  try {
    return fromPaper(await paperPath(n), n);
  } finally {
    p.project.clear();
  }
}
export async function editableNodes(n) {
  const p = await geometry();
  try {
    const item = await paperPath(n);
    let target = item;
    if (item.children) {
      if (item.children.length !== 1)
        throw new Error(
          "Break this compound path apart before editing its nodes",
        );
      target = item.children[0];
    }
    const b = target.bounds.clone();
    const points = target.segments.map((s) => ({
      x: s.point.x - b.x,
      y: s.point.y - b.y,
      ...(!s.handleIn.isZero()
        ? {
            in: {
              x: s.point.x + s.handleIn.x - b.x,
              y: s.point.y + s.handleIn.y - b.y,
            },
          }
        : {}),
      ...(!s.handleOut.isZero()
        ? {
            out: {
              x: s.point.x + s.handleOut.x - b.x,
              y: s.point.y + s.handleOut.y - b.y,
            },
          }
        : {}),
    }));
    return {
      ...n,
      type: "path",
      d: null,
      envelope: null,
      brush: null,
      nativeWidth: null,
      nativeHeight: null,
      rotation: 0,
      flipX: false,
      flipY: false,
      x: b.x,
      y: b.y,
      width: Math.max(1, b.width),
      height: Math.max(1, b.height),
      points,
      closed: target.closed,
    };
  } finally {
    p.project.clear();
  }
}
export async function breakApart(n) {
  const p = await geometry();
  try {
    const path = await paperPath(n),
      items = path.children ? [...path.children] : [path];
    return items.map((item) =>
      fromPaper(item, { ...n, name: n.name + " · part" }),
    );
  } finally {
    p.project.clear();
  }
}
export async function smoothPath(n, tolerance = 2) {
  const p = await geometry();
  try {
    const item = await paperPath(n);
    for (const path of item.children || [item]) {
      path.simplify(tolerance);
      path.smooth({ type: "catmull-rom", factor: 0.5 });
    }
    return fromPaper(item, n);
  } finally {
    p.project.clear();
  }
}
export async function flattenSVG(source, pageId) {
  if (source.length > 4_000_000) throw new Error("SVG exceeds 4 MB");
  const xml = new DOMParser().parseFromString(source, "image/svg+xml");
  if (
    xml.querySelector("parsererror") ||
    xml.documentElement.tagName.toLowerCase() !== "svg"
  )
    throw new Error("Invalid SVG");
  const allowed = new Set([
    "svg",
    "g",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polygon",
    "polyline",
    "text",
    "tspan",
    "defs",
    "linearGradient",
    "radialGradient",
    "stop",
    "title",
    "desc",
  ]);
  let omitted = 0;
  for (const el of [...xml.querySelectorAll("*")]) {
    if (el.hasAttribute("transform") && ["text", "tspan"].includes(el.tagName))
      omitted++;
    if (el.tagName === "g" && el.hasAttribute("opacity")) omitted++;
    if (["linearGradient", "radialGradient"].includes(el.tagName)) omitted++;
    if (!allowed.has(el.tagName)) {
      el.remove();
      omitted++;
      continue;
    }
    for (const a of [...el.attributes])
      if (
        /^on/i.test(a.name) ||
        /href/i.test(a.name) ||
        a.name === "style" ||
        (/url\(/i.test(a.value) && !/^url\(#[A-Za-z0-9_-]+\)$/.test(a.value))
      ) {
        el.removeAttribute(a.name);
        omitted++;
      }
  }
  const p = await geometry();
  try {
    const root = p.project.importSVG(xml.documentElement, {
        insert: false,
        expandShapes: true,
      }),
      nodes = [];
    const walk = (item) => {
      if (item.className === "Group" || item.className === "Layer") {
        for (const child of [...item.children]) walk(child);
        return;
      }
      if (item.className === "PointText") {
        const pt = item.localToGlobal(item.point);
        nodes.push(
          createNode("text", {
            pageId,
            name: item.name || "Imported text",
            x: pt.x,
            y: pt.y - item.fontSize * 0.85,
            width: Math.max(1, item.bounds.width),
            height: Math.max(1, item.bounds.height),
            text: item.content,
            fontSize: item.fontSize,
            fontFamily: item.fontFamily,
            fontWeight:
              Number(item.fontWeight) ||
              (item.fontWeight === "bold" ? 700 : 400),
            fill: item.fillColor?.toCSS(true) || "#222222",
          }),
        );
        return;
      }
      if (!["Path", "CompoundPath"].includes(item.className)) {
        omitted++;
        return;
      }
      const matrix = item.globalMatrix.clone(),
        copy = item.clone({ insert: false });
      copy.matrix = new p.Matrix();
      copy.transform(matrix);
      let fill = copy.fillColor?.toCSS(true) || "none",
        gradient = null;
      if (copy.fillColor?.gradient) {
        const stops = copy.fillColor.gradient.stops;
        gradient = {
          type: copy.fillColor.gradient.radial ? "radial" : "linear",
          angle: 0,
          stops: stops.map((s, i) => ({
            offset: s.offset ?? i / (stops.length - 1),
            color: s.color.toCSS(true),
          })),
        };
        fill = stops[0].color.toCSS(true);
      }
      nodes.push(
        fromPaper(copy, {
          pageId,
          name: item.name || "Imported curve",
          fill,
          gradient,
          stroke: copy.strokeColor?.toCSS(true) || "none",
          strokeWidth: copy.strokeWidth,
          opacity: copy.opacity,
          fillRule: copy.fillRule || "nonzero",
        }),
      );
    };
    walk(root);
    root.remove();
    return { nodes, omitted };
  } finally {
    p.project.clear();
  }
}
export async function readFile(file, pageId) {
  if (file.size > 8_000_000) throw new Error("File exceeds 8 MB");
  if (/\.cdr$/i.test(file.name)) {
    if (globalThis.VELLUM_STATIC === true)
      throw new Error("Native CDR import requires the standalone server. Use SVG, images or .vellum files in the GitHub Pages edition.");
    const r = await fetch("/api/native/cdr", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error);
    return b;
  }
  if (/\.(vellum|json)$/i.test(file.name))
    return { document: validateDocument(JSON.parse(await file.text())) };
  if (/\.svg$/i.test(file.name) || file.type === "image/svg+xml")
    return importSVG(await file.text(), pageId);
  if (/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    const src = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      }),
      img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, 700 / img.width);
    return {
      nodes: [
        createNode("image", {
          pageId,
          name: file.name,
          x: 40,
          y: 40,
          width: img.width * scale,
          height: img.height * scale,
          src,
          imagePixels: { width: img.width, height: img.height },
          fill: "none",
        }),
      ],
    };
  }
  throw new Error("Open a Vellum JSON, SVG, PNG, JPEG, WebP or GIF file");
}
export async function importFont(file) {
  const buffer = await file.arrayBuffer(),
    { opentype } = await import("../vendor/fonts.js"),
    font = opentype.parse(buffer),
    family = font.names.fontFamily.en || file.name;
  if (font.tables.os2?.fsType & 2)
    throw new Error("This font prohibits document embedding");
  const weight = font.tables.os2?.usWeightClass || 400,
    italic = !!(font.tables.os2?.fsSelection & 1);
  const face = new FontFace(family, buffer, {
    weight: String(weight),
    style: italic ? "italic" : "normal",
  });
  await face.load();
  document.fonts.add(face);
  sessionFonts.add(family);
  return {
    font,
    family,
    weight,
    italic,
    src:
      "data:font/" +
      (/\.otf$/i.test(file.name)
        ? "otf"
        : /\.woff$/i.test(file.name)
          ? "woff"
          : "ttf") +
      ";base64," +
      toBase64(new Uint8Array(buffer)),
  };
}
export function textToOutlines(n, font) {
  const paths = [];
  String(n.text)
    .split("\n")
    .forEach((line, i) => {
      const glyphs = font.stringToGlyphs(line),
        size = n.fontSize,
        scale = size / font.unitsPerEm,
        spacing = n.letterSpacing || 0;
      let advance = 0;
      for (let j = 0; j < glyphs.length; j++) {
        advance += (glyphs[j].advanceWidth || 0) * scale;
        if (j < glyphs.length - 1)
          advance +=
            font.getKerningValue(glyphs[j], glyphs[j + 1]) * scale + spacing;
      }
      let x =
        n.textAlign === "center"
          ? (n.width - advance) / 2
          : n.textAlign === "right"
            ? n.width - advance
            : 0;
      for (let j = 0; j < glyphs.length; j++) {
        const glyph = glyphs[j];
        paths.push(
          glyph
            .getPath(x, size * (0.85 + i * (n.lineHeight || 1.2)), size)
            .toPathData(3),
        );
        x += (glyph.advanceWidth || 0) * scale + spacing;
        if (j < glyphs.length - 1)
          x += font.getKerningValue(glyph, glyphs[j + 1]) * scale;
      }
    });
  return {
    ...n,
    type: "path",
    name: n.name + " · outlines",
    d: paths.join(" "),
    nativeWidth: n.width,
    nativeHeight: n.height,
  };
}

export async function importSVG(source, pageId) {
  const safe = sanitizeSVG(source, { prefix: uid() + "-" });
  return {
    nodes: [
      createNode("svg", {
        pageId,
        name: "Imported SVG",
        x: 40,
        y: 40,
        width: safe.width,
        height: safe.height,
        svg: safe.svg,
        fill: "none",
      }),
    ],
    omitted: safe.omitted,
  };
}
export async function shapeTextToPath(n, bytes) {
  const { paths, missingGlyphs } = await shapedOutlines(n, bytes);
  if (missingGlyphs)
    throw new Error("This font does not contain every required glyph");
  const p = await geometry();
  try {
    const compound = new p.CompoundPath();
    for (const glyph of paths) {
      const part = new p.CompoundPath(glyph.d);
      part.transform(
        new p.Matrix(glyph.scale, 0, 0, -glyph.scale, glyph.x, glyph.y),
      );
      for (const child of [...part.children]) compound.addChild(child);
      part.remove();
    }
    compound.transform(new p.Matrix(...objectMatrix(n)));
    return fromPaper(compound, {
      ...n,
      textFrame: null,
      nextFrame: null,
      name: n.name + " · shaped outlines",
    });
  } finally {
    p.project.clear();
  }
}
export async function outlineDocument(doc) {
  const copy = structuredClone(doc),
    flow = flowDocument(doc);
  for (let i = 0; i < copy.nodes.length; i++) {
    const original = copy.nodes[i],
      n = flow.get(original.id) || original;
    if (n.type !== "text") continue;
    const f = matchingFont(copy, n);
    if (!f)
      throw new Error(
        `Embed ${n.fontFamily || "Arial"} before exact text export`,
      );
    copy.nodes[i] = {
      ...(await shapeTextToPath(n, fromBase64(f.src.split(",")[1]))),
      id: n.id,
    };
  }
  return copy;
}
/** Exact process-color path output; other artwork uses the SVG-to-PDF adapter. */
export async function exportProcessPDF(doc) {
  const { jsPDF } = await import("../vendor/pdf.js"),
    bleed = doc.print?.bleed || 0,
    pages = doc.pages,
    first = pages[0],
    format = (p) => [
      (p.width + 2 * bleed) * 0.75,
      (p.height + 2 * bleed) * 0.75,
    ],
    pdf = new jsPDF({
      unit: "pt",
      format: format(first),
      orientation: first.width > first.height ? "landscape" : "portrait",
      compress: true,
    });
  if ((doc.groups || []).some((g) => g.opacity !== 1))
    throw new Error(
      "Exact process-color export currently requires opaque groups. Flatten or remove group transparency.",
    );
  for (const [i, page] of pages.entries()) {
    if (i)
      pdf.addPage(
        format(page),
        page.width > page.height ? "landscape" : "portrait",
      );
    pdf.setFillColor(page.background);
    pdf.rect(0, 0, ...format(page), "F");
    for (const n of doc.nodes.filter(
      (n) => n.pageId === page.id && effectiveVisible(doc, n),
    )) {
      if (n.cmyk && n.fill !== "none" && n.fill !== "transparent") {
        if (
          n.mesh ||
          n.gradient ||
          n.shadow ||
          n.clip ||
          n.type === "svg" ||
          n.type === "image" ||
          n.type === "text"
        )
          throw new Error(
            `${n.name}: convert to a solid vector path for exact CMYK output`,
          );
        const paper = await geometry();
        try {
          const item = await paperPath(n),
            ops = [],
            pt = (p) => [(p.x + bleed) * 0.75, (p.y + bleed) * 0.75];
          for (const path of item.children || [item]) {
            if (!path.segments.length) continue;
            ops.push({ op: "m", c: pt(path.firstSegment.point) });
            for (const curve of path.curves) {
              const v = curve.values;
              ops.push({
                op: "c",
                c: [
                  ...pt({ x: v[2], y: v[3] }),
                  ...pt({ x: v[4], y: v[5] }),
                  ...pt({ x: v[6], y: v[7] }),
                ],
              });
            }
            if (path.closed) ops.push({ op: "h", c: [] });
          }
          pdf.saveGraphicsState();
          pdf.setGState(
            new pdf.GState({
              opacity: n.opacity ?? 1,
              "stroke-opacity": n.opacity ?? 1,
            }),
          );
          pdf.setFillColor(...n.cmyk.map((v) => (v / 100).toFixed(5)));
          pdf.setLineWidth((n.strokeWidth || 0) * 0.75);
          if (n.stroke && n.stroke !== "none") pdf.setDrawColor(n.stroke);
          pdf.path(ops);
          if (n.stroke && n.stroke !== "none")
            n.fillRule === "nonzero"
              ? pdf.fillStroke()
              : pdf.fillStrokeEvenOdd();
          else n.fillRule === "nonzero" ? pdf.fill() : pdf.fillEvenOdd();
          pdf.restoreGraphicsState();
          item.remove();
        } finally {
          paper.project.clear();
        }
      } else {
        const svg = new DOMParser().parseFromString(
          toSVG({ ...doc, nodes: [n] }, page.id, { transparent: true }),
          "image/svg+xml",
        ).documentElement;
        await pdf.svg(svg, {
          x: bleed * 0.75,
          y: bleed * 0.75,
          width: page.width * 0.75,
          height: page.height * 0.75,
        });
      }
    }
  }
  return pdf.output("blob");
}
