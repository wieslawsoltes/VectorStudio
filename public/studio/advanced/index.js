/** Editable mesh, envelope and pressure brush primitives. No DOM dependencies. */
const lerp = (a, b, t) => a + (b - a) * t;
export function bilinear(c, u, v) {
  return {
    x: lerp(lerp(c[0].x, c[1].x, u), lerp(c[3].x, c[2].x, u), v),
    y: lerp(lerp(c[0].y, c[1].y, u), lerp(c[3].y, c[2].y, u), v),
  };
}
export function createMesh(
  rows = 2,
  cols = 2,
  colors = ["#164d49", "#b6ed72", "#f6d887", "#218c83"],
) {
  return {
    rows,
    cols,
    subdivisions: 12,
    points: Array.from({ length: rows * cols }, (_, i) => ({
      x: (i % cols) / (cols - 1),
      y: Math.floor(i / cols) / (rows - 1),
      color:
        colors[
          (i % cols === cols - 1 ? 1 : 0) +
            (Math.floor(i / cols) === rows - 1 ? 2 : 0)
        ],
    })),
  };
}
const rgb = (s) => {
  const h = s.slice(1);
  return h.length === 3
    ? [...h].map((c) => parseInt(c + c, 16))
    : [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
export function meshCells(mesh, width, height) {
  const result = [],
    steps = mesh.subdivisions || 12;
  for (let r = 0; r < mesh.rows - 1; r++)
    for (let c = 0; c < mesh.cols - 1; c++) {
      const pts = [
          mesh.points[r * mesh.cols + c],
          mesh.points[r * mesh.cols + c + 1],
          mesh.points[(r + 1) * mesh.cols + c + 1],
          mesh.points[(r + 1) * mesh.cols + c],
        ],
        colors = pts.map((p) => rgb(p.color));
      for (let y = 0; y < steps; y++)
        for (let x = 0; x < steps; x++) {
          const u = (x + 0.5) / steps,
            v = (y + 0.5) / steps,
            color = [0, 1, 2].map((k) =>
              Math.round(
                lerp(
                  lerp(colors[0][k], colors[1][k], u),
                  lerp(colors[3][k], colors[2][k], u),
                  v,
                ),
              ),
            ),
            points = [
              [x, y],
              [x + 1, y],
              [x + 1, y + 1],
              [x, y + 1],
            ].map(([i, j]) => {
              const p = bilinear(pts, i / steps, j / steps);
              return { x: p.x * width, y: p.y * height };
            });
          result.push({
            points,
            color:
              "#" + color.map((c) => c.toString(16).padStart(2, "0")).join(""),
          });
        }
    }
  return result;
}
export function envelopePoints(points, corners, width, height) {
  return points.map((p) => {
    const q = bilinear(corners, p.x / width, p.y / height);
    return {
      ...p,
      x: q.x * width,
      y: q.y * height,
      ...(p.in
        ? { in: envelopePoints([p.in], corners, width, height)[0] }
        : {}),
      ...(p.out
        ? { out: envelopePoints([p.out], corners, width, height)[0] }
        : {}),
    };
  });
}
export function brushOutline(
  samples,
  {
    size = 12,
    angle = 45,
    aspect = 0.25,
    pressure = true,
    kind = "round",
  } = {},
) {
  if (samples.length < 2) return [];
  const left = [],
    right = [];
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i],
      a = samples[Math.max(0, i - 1)],
      b = samples[Math.min(samples.length - 1, i + 1)],
      dx = b.x - a.x,
      dy = b.y - a.y,
      l = Math.hypot(dx, dy) || 1,
      n = { x: -dy / l, y: dx / l },
      theta = (angle * Math.PI) / 180,
      co = Math.cos(theta),
      si = Math.sin(theta),
      nx = n.x * co + n.y * si,
      ny = -n.x * si + n.y * co,
      r = (size / 2) * (pressure ? Math.max(0.05, p.pressure ?? 0.5) : 1);
    let ox = n.x * r,
      oy = n.y * r;
    if (kind === "calligraphy") {
      const den = Math.hypot(nx, aspect * ny) || 1;
      const ex = (r * nx) / den,
        ey = (r * aspect * aspect * ny) / den;
      ox = ex * co - ey * si;
      oy = ex * si + ey * co;
    }
    left.push({ x: p.x + ox, y: p.y + oy });
    right.push({ x: p.x - ox, y: p.y - oy });
  }
  return [...left, ...right.reverse()];
}
export function validateAdvanced(doc, fail) {
  const num = (v, a = -100000, b = 100000) =>
    Number.isFinite(v) && v >= a && v <= b;
  for (const n of doc.nodes) {
    if (n.mesh) {
      const m = n.mesh;
      if (
        !Number.isInteger(m.rows) ||
        !Number.isInteger(m.cols) ||
        m.rows < 2 ||
        m.cols < 2 ||
        m.rows > 8 ||
        m.cols > 8 ||
        !Array.isArray(m.points) ||
        m.points.length !== m.rows * m.cols ||
        !Number.isInteger(m.subdivisions) ||
        m.subdivisions < 2 ||
        m.subdivisions > 24
      )
        fail("mesh");
      for (const p of m.points)
        if (
          !num(p.x, -2, 3) ||
          !num(p.y, -2, 3) ||
          !/^#[0-9a-f]{6}$/i.test(p.color)
        )
          fail("mesh point");
    }
    if (n.brush) {
      const b = n.brush;
      if (
        !["round", "calligraphy"].includes(b.kind) ||
        !num(b.size, 0.1, 1000) ||
        !num(b.angle, -360, 360) ||
        !num(b.aspect, 0.01, 1) ||
        typeof b.pressure !== "boolean" ||
        !Array.isArray(b.samples) ||
        b.samples.length > 20000
      )
        fail("brush");
      for (const p of b.samples)
        if (!num(p.x) || !num(p.y) || !num(p.pressure, 0, 1))
          fail("pressure sample");
    }
    if (n.envelope) {
      if (
        !Array.isArray(n.envelope) ||
        n.envelope.length !== 4 ||
        n.envelope.some((p) => !num(p.x, -2, 3) || !num(p.y, -2, 3))
      )
        fail("envelope");
    }
    if (n.cmyk) {
      if (
        !Array.isArray(n.cmyk) ||
        n.cmyk.length !== 4 ||
        n.cmyk.some((v) => !num(v, 0, 100))
      )
        fail("CMYK");
    }
    if (n.spot != null && (typeof n.spot !== "string" || n.spot.length > 100))
      fail("spot ink");
    if (n.textFrame) {
      const f = n.textFrame;
      if (
        !Number.isInteger(f.columns) ||
        !num(f.columns, 1, 12) ||
        !num(f.gap, 0, 1000) ||
        !num(f.inset, 0, 1000)
      )
        fail("text frame");
    }
    if (n.direction != null && !["auto", "ltr", "rtl"].includes(n.direction))
      fail("text direction");
    if (
      n.features != null &&
      (typeof n.features !== "string" ||
        !/^[a-zA-Z0-9=, -]{0,200}$/.test(n.features))
    )
      fail("OpenType features");
    if (n.nextFrame != null && typeof n.nextFrame !== "string")
      fail("text thread");
  }
  if (doc.fonts) {
    if (!Array.isArray(doc.fonts) || doc.fonts.length > 32) fail("fonts");
    for (const f of doc.fonts)
      if (
        typeof f.family !== "string" ||
        f.family.length > 200 ||
        !/^data:font\/(ttf|otf|woff);base64,[A-Za-z0-9+/=]+$/.test(f.src) ||
        f.src.length > 6_000_000 ||
        (f.weight != null && !num(f.weight, 1, 1000)) ||
        (f.italic != null && typeof f.italic !== "boolean")
      )
        fail("embedded font");
  }
  if (doc.print) {
    if (
      !num(doc.print.bleed, 0, 200) ||
      !num(doc.print.inkLimit, 100, 400) ||
      !["perceptual", "relative", "absolute", "saturation"].includes(
        doc.print.intent,
      )
    )
      fail("print settings");
    if (
      doc.print.profile &&
      !/^data:application\/vnd.iccprofile;base64,[A-Za-z0-9+/=]{128,3000000}$/.test(
        doc.print.profile,
      )
    )
      fail("ICC profile");
  }
}
