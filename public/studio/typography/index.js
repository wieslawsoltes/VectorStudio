/** Unicode line breaking, bidirectional run ordering and HarfBuzz outline shaping. */
import { bidiFactory, LineBreaker } from "../vendor/text.js";
const bidi = bidiFactory(),
  fontCache = new Map();
let canvas;
export function measureText(text, n) {
  if (typeof document === "undefined")
    return [...text].length * (n.fontSize || 24) * 0.55;
  canvas ??= document.createElement("canvas");
  const c = canvas.getContext("2d");
  c.font = `${n.italic ? "italic " : ""}${n.fontWeight || 400} ${n.fontSize || 24}px "${String(n.fontFamily || "Arial").replace(/["\\]/g, "")}"`;
  return (
    c.measureText(text).width +
    Math.max(0, [...text].length - 1) * (n.letterSpacing || 0)
  );
}
export function layoutText(
  n,
  measure = (t) => measureText(t, n),
  text = n.text || "",
) {
  const f = n.textFrame,
    size = n.fontSize || 24,
    leading = size * (n.lineHeight || 1.2),
    inset = f?.inset || 0,
    cols = f?.columns || 1,
    gap = f?.gap || 0,
    width = (n.width - inset * 2 - gap * (cols - 1)) / cols,
    maxLines = f
      ? Math.max(0, Math.floor((n.height - inset * 2) / leading))
      : Infinity,
    lines = [];
  let offset = 0,
    column = 0,
    row = 0;
  const add = (value, start, end) => {
    if (row >= maxLines) {
      column++;
      row = 0;
    }
    if (column >= cols) return false;
    const w = measure(value),
      align =
        n.textAlign === "center"
          ? (width - w) / 2
          : n.textAlign === "right"
            ? width - w
            : 0;
    lines.push({
      text: value,
      x: inset + column * (width + gap) + align,
      y: inset + size * 0.85 + row * leading,
      width: w,
      start,
      end,
    });
    row++;
    return true;
  };
  for (const paragraph of text.split("\n")) {
    if (!f) {
      add(paragraph, offset, offset + paragraph.length);
      offset += paragraph.length + 1;
      continue;
    }
    const breaker = new LineBreaker(paragraph),
      breaks = [];
    let br;
    while ((br = breaker.nextBreak())) breaks.push(br.position);
    let start = 0,
      end = 0;
    for (const next of breaks) {
      if (
        measure(paragraph.slice(start, next).trimEnd()) > width &&
        end > start
      ) {
        if (
          !add(
            paragraph.slice(start, end).trimEnd(),
            offset + start,
            offset + end,
          )
        )
          return {
            lines,
            remaining: text.slice(offset + start),
            consumed: offset + start,
            overset: true,
          };
        start = end;
      }
      if (measure(paragraph.slice(start, next).trimEnd()) > width) {
        for (let i = start; i < next;) {
          const cp = paragraph.codePointAt(i),
            step = cp > 65535 ? 2 : 1;
          if (i > start && measure(paragraph.slice(start, i + step)) > width) {
            if (!add(paragraph.slice(start, i), offset + start, offset + i))
              return {
                lines,
                remaining: text.slice(offset + start),
                consumed: offset + start,
                overset: true,
              };
            start = i;
          }
          i += step;
        }
      }
      end = next;
    }
    if (!add(paragraph.slice(start), offset + start, offset + paragraph.length))
      return {
        lines,
        remaining: text.slice(offset + start),
        consumed: offset + start,
        overset: true,
      };
    offset += paragraph.length + 1;
  }
  return { lines, remaining: "", consumed: text.length, overset: false };
}
export function flowDocument(doc) {
  const overrides = new Map(),
    targets = new Set(doc.nodes.map((n) => n.nextFrame).filter(Boolean));
  for (const root of doc.nodes.filter(
    (n) => n.type === "text" && !targets.has(n.id),
  )) {
    let n = root,
      text = root.text || "",
      depth = 0;
    while (n && depth++ < 100) {
      const layout = layoutText(n, undefined, text);
      overrides.set(n.id, { ...n, text, textLayout: layout });
      text = layout.remaining;
      n = doc.nodes.find((v) => v.id === n.nextFrame);
    }
  }
  return overrides;
}
export function matchingFont(doc, n) {
  const fonts = (doc.fonts || [])
    .filter((f) => f.family === n.fontFamily && !!f.italic === !!n.italic)
    .sort(
      (a, b) =>
        Math.abs((a.weight || 400) - (n.fontWeight || 400)) -
        Math.abs((b.weight || 400) - (n.fontWeight || 400)),
    );
  const f = fonts[0];
  return f && (!(n.fontWeight >= 600) || (f.weight || 400) >= 600) ? f : null;
}
export async function restoreFonts(doc) {
  if (typeof document === "undefined") return;
  const keep = new Set();
  for (const f of doc.fonts || []) {
    const key =
      f.family + ":" + (f.weight || 400) + ":" + !!f.italic + ":" + f.src;
    keep.add(key);
    if (fontCache.has(key)) {
      await fontCache.get(key);
      continue;
    }
    const promise = (async () => {
      const bytes = Uint8Array.from(atob(f.src.split(",")[1]), (c) =>
        c.charCodeAt(0),
      );
      const face = new FontFace(f.family, bytes, {
        weight: String(f.weight || 400),
        style: f.italic ? "italic" : "normal",
      });
      await face.load();
      document.fonts.add(face);
      return face;
    })();
    fontCache.set(key, promise);
    await promise;
  }
  for (const [key, promise] of fontCache)
    if (!keep.has(key)) {
      fontCache.delete(key);
      promise.then((face) => document.fonts.delete(face)).catch(() => {});
    }
}

export function visualRuns(text, direction = "auto") {
  const embedding = bidi.getEmbeddingLevels(
      text,
      direction === "auto" ? undefined : direction,
    ),
    levels = embedding.levels,
    runs = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++)
    if (i === text.length || levels[i] !== levels[start]) {
      runs.push({
        text: text.slice(start, i),
        start,
        end: i - 1,
        rtl: levels[start] % 2 === 1,
      });
      start = i;
    }
  const order = Array.from({ length: text.length }, (_, i) => i);
  for (const [a, b] of bidi.getReorderSegments(text, embedding)) {
    const slice = order.slice(a, b + 1).reverse();
    order.splice(a, b - a + 1, ...slice);
  }
  const rank = new Map(order.map((v, i) => [v, i]));
  return runs.sort(
    (a, b) =>
      Math.min(
        ...order
          .filter((v) => v >= a.start && v <= a.end)
          .map((v) => rank.get(v)),
      ) -
      Math.min(
        ...order
          .filter((v) => v >= b.start && v <= b.end)
          .map((v) => rank.get(v)),
      ),
  );
}
export async function shapedOutlines(n, fontBytes) {
  const hb = await import("../vendor/hb/index.mjs");
  const blob = new hb.Blob(
      fontBytes instanceof Uint8Array
        ? fontBytes.buffer.slice(
            fontBytes.byteOffset,
            fontBytes.byteOffset + fontBytes.byteLength,
          )
        : fontBytes,
    ),
    face = new hb.Face(blob),
    font = new hb.Font(face),
    scale = (n.fontSize || 24) / face.upem;
  const shape = (text) => {
    let width = 0;
    const runs = [];
    for (const run of visualRuns(text, n.direction)) {
      const b = new hb.Buffer();
      b.addText(run.text);
      b.guessSegmentProperties();
      b.setDirection(run.rtl ? hb.Direction.RTL : hb.Direction.LTR);
      if (n.language) b.setLanguage(n.language);
      hb.shape(
        font,
        b,
        n.features
          ? n.features
              .split(",")
              .map((f) => hb.Feature.fromString(f.trim()))
              .filter(Boolean)
          : undefined,
      );
      const infos = b.getGlyphInfos(),
        positions = b.getGlyphPositions(),
        glyphs = infos.map((g, i) => ({ id: g.codepoint, ...positions[i] }));
      const advance = glyphs.reduce(
        (s, g) => s + g.xAdvance * scale + (n.letterSpacing || 0),
        0,
      );
      runs.push({ glyphs, advance });
      width += advance;
    }
    return { runs, width };
  };
  const layout = n.textLayout || layoutText(n, (t) => shape(t).width),
    paths = [];
  for (const line of layout.lines) {
    let x = line.x;
    for (const run of shape(line.text).runs) {
      for (const g of run.glyphs) {
        const d = font.glyphToPath(g.id);
        if (d)
          paths.push({
            d,
            x: x + g.xOffset * scale,
            y: line.y - g.yOffset * scale,
            scale,
          });
        x += g.xAdvance * scale + (n.letterSpacing || 0);
      }
    }
  }
  return {
    paths,
    layout,
    missingGlyphs: layout.lines.some((l) =>
      shape(l.text).runs.some((r) => r.glyphs.some((g) => g.id === 0)),
    ),
  };
}
