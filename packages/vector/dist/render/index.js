/** SVG retained renderer and WebGPU texture compositor. */
import { meshCells, brushOutline, envelopePoints } from "../advanced/index.js";
import { layoutText, flowDocument } from "../typography/index.js";
import { objectMatrix } from "../core/index.js";
export const escapeXML = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const esc = escapeXML;
export function pathData(n) {
  if (n.d) return n.d;
  if (n.brush) {
    const points = brushOutline(n.brush.samples, n.brush);
    return pathData({ ...n, brush: null, points, closed: true });
  }
  if (!n.points?.length) return "";
  if (n.envelope)
    n = {
      ...n,
      points: envelopePoints(n.points, n.envelope, n.width, n.height),
      envelope: null,
    };
  let d = `M${n.points[0].x} ${n.points[0].y}`;
  for (let i = 1; i < n.points.length; i++) {
    const a = n.points[i - 1],
      b = n.points[i];
    d +=
      a.out || b.in
        ? ` C${(a.out || a).x} ${(a.out || a).y} ${(b.in || b).x} ${(b.in || b).y} ${b.x} ${b.y}`
        : ` L${b.x} ${b.y}`;
  }
  if (n.closed) {
    const a = n.points.at(-1),
      b = n.points[0];
    if (a.out || b.in)
      d += ` C${(a.out || a).x} ${(a.out || a).y} ${(b.in || b).x} ${(b.in || b).y} ${b.x} ${b.y}`;
    d += " Z";
  }
  return d;
}
export function shapeMarkup(n) {
  switch (n.type) {
    case "svg":
      return n.svg
        .replace('width="100%"', `width="${n.width}"`)
        .replace('height="100%"', `height="${n.height}"`);
    case "rect":
      return `<rect width="${n.width}" height="${n.height}" rx="${Math.min(n.rx || 0, n.width / 2, n.height / 2)}"/>`;
    case "ellipse":
      return `<ellipse cx="${n.width / 2}" cy="${n.height / 2}" rx="${n.width / 2}" ry="${n.height / 2}"/>`;
    case "line":
      return `<path d="M0 0L${n.width} ${n.height}"/>`;
    case "polygon": {
      const points = [],
        sides = n.sides || 6,
        count = n.star ? sides * 2 : sides;
      for (let i = 0; i < count; i++) {
        const a = (i * Math.PI * 2) / count - Math.PI / 2,
          r = n.star && i % 2 ? n.innerRadius || 0.45 : 1;
        points.push(
          `${n.width / 2 + ((Math.cos(a) * n.width) / 2) * r},${n.height / 2 + ((Math.sin(a) * n.height) / 2) * r}`,
        );
      }
      return `<polygon points="${points.join(" ")}"/>`;
    }
    case "path":
      return `<path d="${esc(pathData(n))}" fill-rule="${n.fillRule === "nonzero" ? "nonzero" : "evenodd"}" ${n.nativeWidth ? `transform="scale(${n.width / n.nativeWidth} ${n.height / n.nativeHeight})"` : ""}/>`;
    case "text": {
      const layout = n.textLayout || layoutText(n);
      return `<text font-family="${esc(n.fontFamily || "Arial")}" font-size="${n.fontSize || 24}" font-weight="${n.fontWeight || 400}" font-style="${n.italic ? "italic" : "normal"}" letter-spacing="${n.letterSpacing || 0}" text-decoration="${n.underline ? "underline" : "none"}" direction="${n.direction === "rtl" ? "rtl" : "ltr"}" style="font-feature-settings:${esc(
        (n.features || "")
          .split(",")
          .filter(Boolean)
          .map((f) => {
            const [tag, value = "1"] = f.trim().split("=");
            return '"' + tag + '" ' + value;
          })
          .join(","),
      )}">${layout.lines.map((line) => `<tspan x="${line.x + (n.direction === "rtl" ? line.width : 0)}" y="${line.y}" unicode-bidi="plaintext">${esc(line.text)}</tspan>`).join("")}</text>`;
    }
    case "image":
      return /^data:image\/(png|jpeg|webp|gif);base64,/.test(n.src || "")
        ? `<image width="${n.width}" height="${n.height}" href="${esc(n.src)}" preserveAspectRatio="none"/>`
        : "";
    default:
      return "";
  }
}
export function nodeMarkup(n, outline = false) {
  if (n.visible === false) return "";
  const id = `v${n.id.replace(/[^a-zA-Z0-9]/g, "")}`,
    gradient = n.gradient,
    defs = [];
  if (gradient) {
    const tag =
      gradient.type === "radial" ? "radialGradient" : "linearGradient";
    defs.push(
      `<${tag} id="g${id}" ${tag === "linearGradient" ? `gradientTransform="rotate(${gradient.angle || 0} .5 .5)"` : ""}>${(
        gradient.stops || [
          { offset: 0, color: n.fill },
          { offset: 1, color: "#ffffff" },
        ]
      )
        .map((s) => `<stop offset="${s.offset}" stop-color="${esc(s.color)}"/>`)
        .join("")}</${tag}>`,
    );
  }
  if (n.shadow)
    defs.push(
      `<filter id="s${id}" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="${n.shadow.x ?? 0}" dy="${n.shadow.y ?? 4}" stdDeviation="${n.shadow.blur ?? 6}" flood-color="${esc(n.shadow.color || "#000000")}" flood-opacity="${n.shadow.opacity ?? 0.25}"/></filter>`,
    );
  if (n.clip)
    defs.push(
      `<clipPath id="c${id}">${n.clip === "ellipse" ? `<ellipse cx="${n.width / 2}" cy="${n.height / 2}" rx="${n.width / 2}" ry="${n.height / 2}"/>` : `<rect width="${n.width}" height="${n.height}" rx="${n.clipRadius ?? 24}"/>`}</clipPath>`,
    );
  let body = shapeMarkup(n);
  if (n.mesh && !outline) {
    defs.push(`<clipPath id="m${id}">${body}</clipPath>`);
    body = `<g clip-path="url(#m${id})" stroke="none">${meshCells(
      n.mesh,
      n.width,
      n.height,
    )
      .map(
        (c) =>
          `<polygon points="${c.points.map((p) => p.x + "," + p.y).join(" ")}" fill="${c.color}" stroke="${c.color}" stroke-width=".3"/>`,
      )
      .join("")}</g><g fill="none">${shapeMarkup(n)}</g>`;
  }
  const m = objectMatrix(n);
  return `${defs.length ? `<defs>${defs.join("")}</defs>` : ""}<g data-node="${esc(n.id)}" transform="matrix(${m.join(" ")})" fill="${outline ? "none" : gradient ? `url(#g${id})` : esc(n.fill)}" stroke="${outline ? "#43594f" : esc(n.stroke || "none")}" stroke-width="${outline ? 1 : n.strokeWidth || 0}" stroke-dasharray="${esc(n.dash || "none")}" stroke-linecap="${esc(n.lineCap || "round")}" stroke-linejoin="${esc(n.lineJoin || "round")}" opacity="${n.opacity ?? 1}" ${n.shadow && !outline ? `filter="url(#s${id})"` : ""} ${n.clip ? `clip-path="url(#c${id})"` : ""}>${body}</g>`;
}
export function fontDefs(doc) {
  return (doc.fonts || []).length
    ? `<defs><style>${doc.fonts.map((f) => `@font-face{font-family:'${esc(f.family.replace(/[\\'<>]/g, ""))}';font-weight:${f.weight || 400};font-style:${f.italic ? "italic" : "normal"};src:url('${f.src}')}`).join("")}</style></defs>`
    : "";
}
export function sceneTree(doc, pageId) {
  const overrides = flowDocument(doc),
    nodes = doc.nodes.filter((n) => n.pageId === pageId),
    groups = new Map(
      (doc.groups || [])
        .filter((g) => g.pageId === pageId)
        .map((g) => [g.id, g]),
    ),
    entries = new Map(),
    roots = [];
  for (const node of nodes) {
    let chain = [],
      id = node.groupId;
    while (groups.has(id) && chain.length < 32) {
      chain.unshift(groups.get(id));
      id = groups.get(id).parentId;
    }
    let children = roots;
    for (const group of chain) {
      let entry = entries.get(group.id);
      if (!entry) {
        entry = { kind: "group", value: group, children: [] };
        entries.set(group.id, entry);
        children.push(entry);
      }
      children = entry.children;
    }
    children.push({ kind: "node", value: overrides.get(node.id) || node });
  }
  return roots;
}
export function documentMarkup(doc, pageId, outline = false) {
  const render = (entries) =>
    entries
      .map((e) =>
        e.kind === "node"
          ? nodeMarkup(e.value, outline)
          : e.value.visible === false
            ? ""
            : `<g data-group="${esc(e.value.id)}" opacity="${e.value.opacity}">${render(e.children)}</g>`,
      )
      .join("");
  return render(sceneTree(doc, pageId));
}
export function toSVG(
  doc,
  pageId = doc.pages[0].id,
  { outline = false, transparent = false } = {},
) {
  const page = doc.pages.find((p) => p.id === pageId) || doc.pages[0];
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}"><title>${esc(doc.name)} — ${esc(page.name)}</title>${fontDefs(doc)}${transparent ? "" : `<rect width="100%" height="100%" fill="${esc(page.background)}"/>`}${documentMarkup(doc, page.id, outline)}</svg>`;
}
export class SVGRenderer {
  constructor(svg) {
    this.svg = svg;
    this.cache = new Map();
  }
  render(doc, pageId, outline = false) {
    const page = doc.pages.find((p) => p.id === pageId) || doc.pages[0];
    this.svg.setAttribute("viewBox", `0 0 ${page.width} ${page.height}`);
    this.svg.style.background = page.background;
    const keep = new Set(),
      walk = (entries, parent) => {
        let cursor = parent.firstElementChild;
        for (const entry of entries) {
          const n = entry.value,
            id = entry.kind + ":" + n.id;
          keep.add(id);
          let cached = this.cache.get(id);
          if (!cached) {
            cached = {
              el: document.createElementNS("http://www.w3.org/2000/svg", "g"),
              key: null,
            };
            this.cache.set(id, cached);
          }
          const el = cached.el;
          if (el !== cursor) parent.insertBefore(el, cursor);
          cursor = el.nextElementSibling;
          const key = JSON.stringify(n) + outline;
          if (entry.kind === "group") {
            el.setAttribute("data-group", n.id);
            el.setAttribute("opacity", n.opacity);
            el.style.display = n.visible === false ? "none" : "";
            walk(entry.children, el);
          } else if (cached.key !== key) el.innerHTML = nodeMarkup(n, outline);
          cached.key = key;
        }
      };
    walk(sceneTree(doc, page.id), this.svg);
    for (const [id, cached] of this.cache)
      if (!keep.has(id)) {
        cached.el.remove();
        this.cache.delete(id);
      }
  }
  destroy() {
    this.cache.clear();
    this.svg.replaceChildren();
  }
}
export class WebGPUCompositor {
  constructor(canvas, onStatus = () => {}) {
    this.canvas = canvas;
    this.onStatus = onStatus;
    this.ready = false;
    this.sequence = 0;
  }
  async initialize() {
    try {
      if (!navigator.gpu) return false;
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;
      this.device = await adapter.requestDevice();
      this.context = this.canvas.getContext("webgpu");
      const format = navigator.gpu.getPreferredCanvasFormat();
      this.context.configure({
        device: this.device,
        format,
        alphaMode: "premultiplied",
      });
      const shader = this.device.createShaderModule({
        code: `struct Out { @builtin(position) position: vec4f, @location(0) uv: vec2f }; @vertex fn vs(@builtin(vertex_index) i:u32)->Out { var p=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));var o:Out;o.position=vec4f(p[i],0,1);o.uv=vec2f((p[i].x+1)*.5,(1-p[i].y)*.5);return o;} @group(0) @binding(0) var smp:sampler; @group(0) @binding(1) var tex:texture_2d<f32>; @fragment fn fs(i:Out)->@location(0) vec4f {return textureSample(tex,smp,i.uv);}`,
      });
      this.pipeline = this.device.createRenderPipeline({
        layout: "auto",
        vertex: { module: shader, entryPoint: "vs" },
        fragment: { module: shader, entryPoint: "fs", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      });
      this.sampler = this.device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
      });
      this.device.lost.then(() => {
        this.ready = false;
        this.canvas.style.opacity = "0";
        this.onStatus("SVG · GPU unavailable");
      });
      this.ready = true;
      this.onStatus("WebGPU compositor");
      return true;
    } catch {
      this.onStatus("SVG renderer");
      return false;
    }
  }
  invalidate() {
    this.sequence++;
    this.canvas.style.opacity = "0";
  }
  async render(svg, width, height, scale = 1) {
    if (!this.ready) return false;
    const seq = ++this.sequence;
    let url, texture;
    try {
      const max = this.device.limits.maxTextureDimension2D;
      const ratio = Math.min(
        scale * (devicePixelRatio || 1),
        max / width,
        max / height,
        3,
      );
      const w = Math.max(1, Math.ceil(width * ratio)),
        h = Math.max(1, Math.ceil(height * ratio));
      url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const img = new Image();
      img.src = url;
      await img.decode();
      if (seq !== this.sequence) return false;
      const source = document.createElement("canvas");
      source.width = w;
      source.height = h;
      source.getContext("2d").drawImage(img, 0, 0, w, h);
      texture = this.device.createTexture({
        size: [w, h],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.device.queue.copyExternalImageToTexture(
        { source },
        { texture, premultipliedAlpha: true },
        [w, h],
      );
      this.canvas.width = w;
      this.canvas.height = h;
      const group = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: texture.createView() },
        ],
      });
      const encoder = this.device.createCommandEncoder(),
        pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: this.context.getCurrentTexture().createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, group);
      pass.draw(6);
      pass.end();
      this.device.queue.submit([encoder.finish()]);
      this.texture?.destroy();
      this.texture = texture;
      texture = null;
      this.canvas.style.opacity = "1";
      return true;
    } catch {
      this.canvas.style.opacity = "0";
      return false;
    } finally {
      texture?.destroy();
      if (url) URL.revokeObjectURL(url);
    }
  }
  destroy() {
    this.invalidate();
    this.texture?.destroy();
    this.device?.destroy();
  }
}
