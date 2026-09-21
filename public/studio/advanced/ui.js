import { createMesh, brushOutline } from "./index.js";
import {
  createNode,
  uid,
  clone,
  ancestors,
  inGroup,
  effectiveLocked,
  objectMatrix,
} from "../core/index.js";
import { dialog, toast, htmlEscape as h } from "../controls/index.js";
import { toSVG, nodeMarkup } from "../render/index.js";
import {
  editableNodes,
  flattenSVG,
  download,
  safeName,
  rasterize,
  outlineDocument,
  exportProcessPDF,
} from "../io/index.js";
import {
  createColorTransform,
  toBase64,
  fromBase64,
  preflight,
} from "../color/index.js";
import { layoutText } from "../typography/index.js";
const $ = (s, p = document) => p.querySelector(s),
  $$ = (s, p = document) => [...p.querySelectorAll(s)];
const option = (v, label, current) =>
  `<option value="${h(v)}" ${v === current ? "selected" : ""}>${h(label)}</option>`;
export function installAdvancedUI(ctx) {
  const {
      store,
      commands,
      menuData,
      draw,
      inspect,
      stage,
      pagePoint,
      setTool,
      collab,
    } = ctx,
    reg = (id, title, fn) => commands.register(id, title, fn);
  let brushSettings = {
      kind: "round",
      size: 18,
      angle: 45,
      aspect: 0.25,
      pressure: true,
    },
    painting = null;
  const selected = () => {
    const n = store.selected[0];
    if (!n) throw new Error("Select an object first");
    if (effectiveLocked(store.doc, n))
      throw new Error("Unlock the object first");
    return n;
  };
  const action = (button, fn) =>
    (button.onclick = async () => {
      try {
        button.disabled = true;
        await fn();
      } catch (e) {
        toast(e.message, true);
      } finally {
        button.disabled = false;
      }
    });
  menuData.Effects.push(
    ["mesh-fill", "Mesh fill…", ""],
    ["envelope", "Envelope…", ""],
    ["brush-settings", "Pressure & calligraphy brush…", ""],
  );
  menuData.Text.push(["typography", "Paragraph & OpenType…", ""]);
  menuData.Object.push(
    ["structure", "Nested groups…", ""],
    ["explode-svg", "Explode SVG to curves", ""],
  );
  menuData.View.push(
    ["fit-spread", "Fit all pages", ""],
    ["page-manager", "Manage pages…", ""],
  );
  menuData.File.push(
    ["color-management", "ICC color & preflight…", ""],
    ["print-production", "Print production…", ""],
  );
  menuData.Window.push(["administration", "Project administration…", ""]);
  function launcher() {
    const host = $("#docker-content");
    if (!host || host.querySelector(".feature-launcher")) return;
    const el = document.createElement("div");
    el.className = "feature-launcher";
    el.innerHTML = [
      ["mesh-fill", "Mesh fill"],
      ["envelope", "Envelope"],
      ["brush-settings", "Pressure brush"],
      ["typography", "Typography"],
      ["color-management", "ICC & CMYK"],
      ["page-manager", "Pages & layers"],
    ]
      .map(([id, label]) => `<button data-action="${id}">${label}</button>`)
      .join("");
    host.prepend(el);
  }
  new MutationObserver(launcher).observe($("#docker-content"), {
    childList: true,
  });
  launcher();
  reg("fit-spread", "Fit all pages", ctx.fitSpread);
  reg("mesh-fill", "Edit mesh fill", () => {
    const n = selected();
    if (n.type === "svg" || n.type === "image" || n.type === "text")
      throw new Error("Choose a vector shape or convert text to curves");
    let mesh = clone(n.mesh || createMesh()),
      index = 0;
    const d = dialog(
        "Mesh fill",
        `<div class="pro-badge">Editable color lattice</div><svg class="mesh-preview" viewBox="-30 -30 360 260"></svg><div class="advanced-grid"><label>Grid<select id="mesh-grid">${[2, 3, 4, 5].map((v) => option(String(v), v + " × " + v, String(mesh.rows))).join("")}</select></label><label>Point color<input type="color" id="mesh-color" value="${mesh.points[0].color}"></label><label>Point X<input type="number" id="mesh-x" min="-2" max="3" step=".01"></label><label>Point Y<input type="number" id="mesh-y" min="-2" max="3" step=".01"></label></div><p class="muted">Drag lattice points. Each patch interpolates four corner colors. The mesh remains editable in Vellum.</p>`,
        `<button class="secondary-button" id="mesh-remove">Remove mesh</button><button class="primary-button" id="mesh-apply">Apply mesh</button>`,
      ),
      svg = $("svg.mesh-preview", d);
    function render() {
      svg.innerHTML =
        nodeMarkup({
          ...n,
          x: 0,
          y: 0,
          width: 300,
          height: 200,
          rotation: 0,
          mesh,
        }) +
        mesh.points
          .map(
            (p, i) =>
              `<circle data-mesh-point="${i}" cx="${p.x * 300}" cy="${p.y * 200}" r="${i === index ? 5 : 3.5}" fill="${p.color}" stroke="#fff" stroke-width="2"/>`,
          )
          .join("");
      $("#mesh-x", d).value = mesh.points[index].x;
      $("#mesh-y", d).value = mesh.points[index].y;
      $("#mesh-color", d).value = mesh.points[index].color;
    }
    let dragging = false;
    svg.onpointerdown = (e) => {
      if (e.target.dataset.meshPoint === undefined) return;
      index = Number(e.target.dataset.meshPoint);
      dragging = true;
      svg.setPointerCapture(e.pointerId);
      render();
    };
    svg.onpointermove = (e) => {
      if (!dragging) return;
      const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(
        svg.getScreenCTM().inverse(),
      );
      mesh.points[index].x = Math.max(-2, Math.min(3, point.x / 300));
      mesh.points[index].y = Math.max(-2, Math.min(3, point.y / 200));
      render();
    };
    svg.onpointerup = () => (dragging = false);
    $("#mesh-grid", d).onchange = (e) => {
      mesh = createMesh(Number(e.target.value), Number(e.target.value));
      index = 0;
      render();
    };
    $("#mesh-color", d).oninput = (e) => {
      mesh.points[index].color = e.target.value;
      render();
    };
    for (const axis of ["x", "y"])
      $("#mesh-" + axis, d).onchange = (e) => {
        mesh.points[index][axis] = Number(e.target.value);
        render();
      };
    action($("#mesh-apply", d), () => {
      store.update([n.id], { mesh, gradient: null }, "Edit mesh fill");
      d.close();
    });
    action($("#mesh-remove", d), () => {
      store.update([n.id], { mesh: null }, "Remove mesh fill");
      d.close();
    });
    render();
  });
  reg("envelope", "Edit envelope", async () => {
    const original = selected(),
      n = original.points ? clone(original) : await editableNodes(original);
    let corners = clone(
      n.envelope || [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    );
    const d = dialog(
        "Envelope",
        `<svg class="mesh-preview" viewBox="-70 -60 440 340"></svg><p class="muted">Drag the four corners to warp this curve. Curves retain their original nodes and an editable bilinear envelope.</p>`,
        `<button class="secondary-button" id="envelope-reset">Reset corners</button><button class="primary-button" id="envelope-apply">Apply envelope</button>`,
      ),
      svg = $("svg", d);
    function render() {
      const scaleX = 300 / n.width,
        scaleY = 200 / n.height;
      svg.innerHTML =
        `<g transform="scale(${scaleX} ${scaleY})">${nodeMarkup({ ...n, x: 0, y: 0, rotation: 0, envelope: corners })}</g><polygon points="${corners.map((p) => p.x * 300 + "," + p.y * 200).join(" ")}" fill="none" stroke="#0a9b82" stroke-dasharray="4 3"/>` +
        corners
          .map(
            (p, i) =>
              `<circle data-corner="${i}" cx="${p.x * 300}" cy="${p.y * 200}" r="6" fill="#fff" stroke="#087f68" stroke-width="2"/>`,
          )
          .join("");
    }
    let dragging = null;
    svg.onpointerdown = (e) => {
      if (e.target.dataset.corner !== undefined) {
        dragging = Number(e.target.dataset.corner);
        svg.setPointerCapture(e.pointerId);
      }
    };
    svg.onpointermove = (e) => {
      if (dragging === null) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
        svg.getScreenCTM().inverse(),
      );
      corners[dragging] = {
        x: Math.max(-2, Math.min(3, p.x / 300)),
        y: Math.max(-2, Math.min(3, p.y / 200)),
      };
      render();
    };
    svg.onpointerup = () => (dragging = null);
    $("#envelope-reset", d).onclick = () => {
      corners = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
      render();
    };
    action($("#envelope-apply", d), () => {
      store.update(
        [original.id],
        { ...n, id: original.id, envelope: corners },
        "Edit envelope",
      );
      d.close();
    });
    render();
  });
  reg("brush-settings", "Pressure and calligraphy brush", () => {
    const d = dialog(
      "Brush studio",
      `<div class="advanced-grid"><label>Brush<select id="brush-kind">${option("round", "Pressure ribbon", brushSettings.kind)}${option("calligraphy", "Elliptical calligraphy nib", brushSettings.kind)}</select></label><label>Width (px)<input id="brush-size" type="number" min="1" max="500" value="${brushSettings.size}"></label><label>Nib angle<input id="brush-angle" type="number" min="-180" max="180" value="${brushSettings.angle}"></label><label>Nib aspect<input id="brush-aspect" type="number" min=".01" max="1" step=".01" value="${brushSettings.aspect}"></label></div><label class="form-label"><input id="brush-pressure" type="checkbox" ${brushSettings.pressure ? "checked" : ""}> Use stylus pressure</label><p class="muted">Paint on any page. Mouse strokes use uniform pressure. Stroke samples and brush settings are saved with the artwork.</p>`,
      `<button class="primary-button" id="brush-use">Use brush</button>`,
    );
    action($("#brush-use", d), () => {
      brushSettings = {
        kind: $("#brush-kind", d).value,
        size: Number($("#brush-size", d).value),
        angle: Number($("#brush-angle", d).value),
        aspect: Number($("#brush-aspect", d).value),
        pressure: $("#brush-pressure", d).checked,
      };
      if (
        brushSettings.size < 1 ||
        brushSettings.size > 500 ||
        brushSettings.aspect < 0.01 ||
        brushSettings.aspect > 1
      )
        throw new Error("Brush parameters are out of range");
      setTool("brush");
      d.close();
    });
  });
  stage.addEventListener(
    "pointerdown",
    (e) => {
      if (ctx.getTool() !== "brush" || e.button !== 0) return;
      if (store.readOnly) {
        e.stopImmediatePropagation();
        return toast("This project is read-only");
      }
      e.stopImmediatePropagation();
      const p = pagePoint(e);
      painting = {
        samples: [{ ...p, pressure: e.pointerType === "pen" ? e.pressure : 1 }],
        pageId: store.pageId,
      };
      stage.setPointerCapture(e.pointerId);
    },
    true,
  );
  stage.addEventListener(
    "pointermove",
    (e) => {
      if (!painting) return;
      e.stopImmediatePropagation();
      for (const sample of e.getCoalescedEvents?.() || [e]) {
        const p = pagePoint(sample);
        if (painting.samples.length < 20000)
          painting.samples.push({
            ...p,
            pressure: sample.pointerType === "pen" ? sample.pressure : 1,
          });
      }
      const points = brushOutline(painting.samples, brushSettings),
        overlay = $("#overlay");
      overlay.innerHTML = `<polygon points="${points.map((p) => p.x + "," + p.y).join(" ")}" fill="${$("#tool-fill").value}"/>`;
    },
    true,
  );
  stage.addEventListener(
    "pointerup",
    (e) => {
      if (!painting) return;
      e.stopImmediatePropagation();
      const paint = painting;
      painting = null;
      stage.releasePointerCapture(e.pointerId);
      if (paint.samples.length < 2) return;
      const points = brushOutline(paint.samples, brushSettings),
        xs = points.map((p) => p.x),
        ys = points.map((p) => p.y),
        x = Math.min(...xs),
        y = Math.min(...ys),
        width = Math.max(...xs) - x,
        height = Math.max(...ys) - y;
      store.add("path", {
        name:
          brushSettings.kind === "calligraphy"
            ? "Calligraphy stroke"
            : "Pressure stroke",
        pageId: paint.pageId,
        x,
        y,
        width: Math.max(1, width),
        height: Math.max(1, height),
        nativeWidth: Math.max(1, width),
        nativeHeight: Math.max(1, height),
        fill: $("#tool-fill").value,
        stroke: "none",
        brush: {
          ...brushSettings,
          samples: paint.samples.map((p) => ({ ...p, x: p.x - x, y: p.y - y })),
        },
        closed: true,
      });
      draw();
    },
    true,
  );
  stage.addEventListener(
    "pointercancel",
    () => {
      painting = null;
      draw();
    },
    true,
  );
  reg("typography", "Paragraph and OpenType settings", () => {
    const n = selected();
    if (n.type !== "text") throw new Error("Select a text object");
    const f = n.textFrame || { columns: 1, gap: 20, inset: 0 },
      d = dialog(
        "Typography",
        `<div class="advanced-grid"><label>Layout<select id="text-layout">${option("artistic", "Artistic text", n.textFrame ? "frame" : "artistic")}${option("frame", "Paragraph frame", n.textFrame ? "frame" : "artistic")}</select></label><label>Direction<select id="text-direction">${["auto", "ltr", "rtl"].map((v) => option(v, v.toUpperCase(), n.direction || "auto")).join("")}</select></label><label>Columns<input id="text-columns" type="number" min="1" max="12" value="${f.columns}"></label><label>Column gap<input id="text-gap" type="number" min="0" max="1000" value="${f.gap}"></label><label>Inset<input id="text-inset" type="number" min="0" max="1000" value="${f.inset}"></label><label>Line height<input id="text-leading" type="number" min=".5" max="5" step=".05" value="${n.lineHeight || 1.2}"></label><label>OpenType features<input id="text-features" value="${h(n.features || "kern=1,liga=1")}" placeholder="kern=1,liga=1,ss01=1"></label><label>Language<input id="text-language" value="${h(n.language || "en")}" maxlength="30"></label></div><label class="form-label">Continue overflow in frame<select id="text-next">${option("", "No linked frame", n.nextFrame || "")}${store.doc.nodes
          .filter((v) => v.type === "text" && v.id !== n.id)
          .map((v) => option(v.id, v.name, n.nextFrame))
          .join(
            "",
          )}</select></label><p class="muted">HarfBuzz shapes imported fonts for outline export. Paragraph frames use Unicode line breaks; linked frames flow their source text across pages.</p><p id="text-overflow"></p>`,
        `<button class="primary-button" id="text-apply">Apply typography</button>`,
      );
    action($("#text-apply", d), () => {
      const patch = {
        textFrame:
          $("#text-layout", d).value === "frame"
            ? {
                columns: Number($("#text-columns", d).value),
                gap: Number($("#text-gap", d).value),
                inset: Number($("#text-inset", d).value),
              }
            : null,
        direction: $("#text-direction", d).value,
        lineHeight: Number($("#text-leading", d).value),
        features: $("#text-features", d).value,
        language: $("#text-language", d).value,
        nextFrame: $("#text-next", d).value || null,
      };
      store.update([n.id], patch, "Edit typography");
      const result = layoutText({ ...n, ...patch });
      d.close();
      toast(
        result.overset
          ? `${result.remaining.length} characters overflow this frame`
          : "Typography updated",
      );
    });
  });
  reg("structure", "Nested groups and layers", () => {
    const groups = (store.doc.groups || []).filter(
        (g) => g.pageId === store.pageId,
      ),
      d = dialog(
        "Document structure",
        `<p class="muted">Group selected objects, then group complete groups to nest them. Children use document coordinates; opacity composites at the group boundary.</p><div>${groups.length ? groups.map((g) => `<div class="group-tree-row" style="padding-left:${12 + ancestors(store.doc, { groupId: g.parentId }).length * 14}px"><button data-group-select="${g.id}">${h(g.name)} · ${store.nodes.filter((n) => inGroup(store.doc, n, g.id)).length}</button><input data-group-opacity="${g.id}" aria-label="Group opacity" type="number" min="0" max="1" step=".05" value="${g.opacity}" style="width:65px"><button data-group-visible="${g.id}">${g.visible ? "Hide" : "Show"}</button><button data-group-lock="${g.id}">${g.locked ? "Unlock" : "Lock"}</button></div>`).join("") : "No nested groups on this page."}</div>`,
        `<button class="secondary-button" id="structure-ungroup">Ungroup selection</button><button class="primary-button" id="structure-group">Group selection</button>`,
      );
    $$("[data-group-select]", d).forEach(
      (b) =>
        (b.onclick = () =>
          store.select(
            store.nodes
              .filter((n) => inGroup(store.doc, n, b.dataset.groupSelect))
              .map((n) => n.id),
          )),
    );
    for (const [key, prop] of [
      ["visible", "visible"],
      ["lock", "locked"],
    ])
      $$(`[data-group-${key}]`, d).forEach(
        (b) =>
          (b.onclick = () => {
            store.transact("Group " + prop, (doc) => {
              const g = doc.groups.find(
                (g) =>
                  g.id ===
                  b.dataset["group" + key[0].toUpperCase() + key.slice(1)],
              );
              g[prop] = !g[prop];
            });
            d.close();
            commands.execute("structure");
          }),
      );
    $$("[data-group-opacity]", d).forEach(
      (b) =>
        (b.onchange = () =>
          store.transact(
            "Group opacity",
            (doc) =>
              (doc.groups.find((g) => g.id === b.dataset.groupOpacity).opacity =
                Number(b.value)),
          )),
    );
    $("#structure-group", d).onclick = () => {
      store.group();
      d.close();
      commands.execute("structure");
    };
    $("#structure-ungroup", d).onclick = () => {
      store.ungroup();
      d.close();
      commands.execute("structure");
    };
  });
  reg("explode-svg", "Explode preserved SVG into curves", async () => {
    const n = selected();
    if (n.type !== "svg") throw new Error("Select an imported SVG fragment");
    if (n.rotation || n.flipX || n.flipY)
      throw new Error(
        "Reset fragment rotation and flips before exploding to curves",
      );
    const source = n.svg
      .replace('width="100%"', `width="${n.width}"`)
      .replace('height="100%"', `height="${n.height}"`);
    const result = await flattenSVG(source, n.pageId);
    if (!result.nodes.length)
      throw new Error("No convertible vector elements found");
    store.transact("Explode SVG", (doc) => {
      doc.nodes = doc.nodes.filter((v) => v.id !== n.id);
      for (const child of result.nodes) {
        child.x += n.x;
        child.y += n.y;
      }
      doc.nodes.push(...result.nodes);
    });
    store.select(result.nodes.map((n) => n.id));
    toast(
      "Converted to editable objects. Inspect clipping, effects and transformed text against the preserved original.",
    );
  });
  reg("page-manager", "Manage document pages", () => {
    const d = dialog(
      "Pages",
      `<div>${store.doc.pages.map((p, i) => `<div class="page-manager-row"><span>${i + 1}. ${h(p.name)}<small> · ${p.width} × ${p.height}</small></span><button data-page-open="${p.id}">Edit</button><button data-page-up="${p.id}" ${i === 0 ? "disabled" : ""}>↑</button><button data-page-down="${p.id}" ${i === store.doc.pages.length - 1 ? "disabled" : ""}>↓</button><button data-page-copy="${p.id}">Copy</button><button data-page-move="${p.id}">Move selection here</button></div>`).join("")}</div>`,
      `<button id="pages-fit" class="primary-button">Fit all pages</button>`,
    );
    const again = () => {
      d.close();
      commands.execute("page-manager");
    };
    for (const name of ["up", "down"])
      $$(`[data-page-${name}]`, d).forEach(
        (b) =>
          (b.onclick = () => {
            const id =
                b.dataset["page" + name[0].toUpperCase() + name.slice(1)],
              i = store.doc.pages.findIndex((p) => p.id === id);
            store.reorderPage(id, i + (name === "up" ? -1 : 1));
            again();
          }),
      );
    $$("[data-page-copy]", d).forEach(
      (b) =>
        (b.onclick = () => {
          store.duplicatePage(b.dataset.pageCopy);
          again();
        }),
    );
    $$("[data-page-move]", d).forEach(
      (b) =>
        (b.onclick = () => {
          store.moveToPage([...store.selection], b.dataset.pageMove);
          again();
        }),
    );
    $$("[data-page-open]", d).forEach(
      (b) =>
        (b.onclick = () => {
          store.pageId = b.dataset.pageOpen;
          store.reindex();
          store.select([]);
          d.close();
          ctx.fit();
        }),
    );
    $("#pages-fit", d).onclick = () => {
      d.close();
      ctx.fitSpread();
    };
  });
  reg("color-management", "ICC color and CMYK", () => {
    let settings = clone(
      store.doc.print || { bleed: 11.34, inkLimit: 300, intent: "relative" },
    );
    const n = store.selected[0],
      d = dialog(
        "Color management",
        `<div class="pro-badge">LittleCMS · ICC engine</div><label class="form-label">CMYK output profile<input id="icc-file" type="file" accept=".icc,.icm"></label><p id="icc-description" class="muted">${h(settings.profileName || "Choose your printer’s ICC profile")}</p><div class="advanced-grid"><label>Rendering intent<select id="icc-intent">${["relative", "perceptual", "absolute", "saturation"].map((v) => option(v, v, settings.intent)).join("")}</select></label><label>Total ink limit (%)<input id="icc-ink" type="number" min="100" max="400" value="${settings.inkLimit}"></label><label>Bleed (px at 96 dpi)<input id="icc-bleed" type="number" min="0" max="200" step=".01" value="${settings.bleed}"></label></div>${n ? `<p>Selected fill · CMYK percentages</p><div class="advanced-grid">${["C", "M", "Y", "K"].map((label, i) => `<label>${label}<input id="cmyk-${i}" type="number" min="0" max="100" value="${n.cmyk?.[i] || 0}" step=".1"></label>`).join("")}</div><button id="icc-read" class="secondary-button">Convert selected RGB to CMYK</button><button id="icc-apply" class="secondary-button">Apply CMYK fill</button>` : ""}<p class="muted">Color numbers are transformed through the embedded output profile. ICC settings and CMYK values travel with the document.</p>`,
        `<button class="secondary-button" id="icc-preflight">Run preflight</button><button class="primary-button" id="icc-save">Save color settings</button>`,
      );
    $("#icc-file", d).onchange = async (e) => {
      try {
        const file = e.target.files[0],
          bytes = new Uint8Array(await file.arrayBuffer()),
          engine = await createColorTransform(bytes);
        settings.profile =
          "data:application/vnd.iccprofile;base64," + toBase64(bytes);
        settings.profileName = engine.description || file.name;
        $("#icc-description", d).textContent = settings.profileName;
        engine.dispose();
      } catch (e) {
        toast(e.message, true);
      }
    };
    const transform = async (fn) => {
      if (!settings.profile) throw new Error("Choose a CMYK profile first");
      const t = await createColorTransform(
        fromBase64(settings.profile.split(",")[1]),
        { intent: $("#icc-intent", d).value },
      );
      try {
        return fn(t);
      } finally {
        t.dispose();
      }
    };
    if (n) {
      action($("#icc-read", d), () =>
        transform((t) => {
          if (!/^#[a-f0-9]{6}$/i.test(n.fill))
            throw new Error("Choose a solid RGB fill");
          const rgb = [0, 2, 4].map((i) =>
              parseInt(n.fill.slice(i + 1, i + 3), 16),
            ),
            cmyk = t.rgbToCmyk(rgb);
          cmyk.forEach(
            (v, i) => ($("#cmyk-" + i, d).value = ((v / 255) * 100).toFixed(1)),
          );
        }),
      );
      action($("#icc-apply", d), () =>
        transform((t) => {
          const cmyk = [0, 1, 2, 3].map((i) =>
            Number($("#cmyk-" + i, d).value),
          );
          if (cmyk.some((v) => v < 0 || v > 100))
            throw new Error("CMYK channels range from 0 to 100");
          const rgb = t.cmykToRgb(cmyk.map((v) => Math.round((v / 100) * 255))),
            fill =
              "#" +
              Array.from(rgb, (v) => v.toString(16).padStart(2, "0")).join("");
          store.update(
            [n.id],
            { cmyk, fill, gradient: null, mesh: null },
            "Apply ICC CMYK fill",
          );
        }),
      );
    }
    const save = () => {
      settings = {
        ...settings,
        intent: $("#icc-intent", d).value,
        inkLimit: Number($("#icc-ink", d).value),
        bleed: Number($("#icc-bleed", d).value),
      };
      store.transact("Color management", (doc) => (doc.print = settings));
    };
    action($("#icc-save", d), () => {
      save();
      d.close();
    });
    action($("#icc-preflight", d), () => {
      save();
      d.close();
      commands.execute("print-production");
    });
  });
  reg("print-production", "Print production and preflight", async () => {
    const report = preflight(store.doc),
      cap = globalThis.VELLUM_STATIC === true ? {} : await fetch("/api/native/capabilities")
        .then((r) => r.json())
        .catch(() => ({})),
      d = dialog(
        "Print production",
        `<div class="pro-badge">${report.errors} errors · ${report.warnings} review items</div><div style="max-height:330px;overflow:auto">${report.issues.map((i) => `<div class="preflight-item ${i.severity}"><strong>${h(i.code)}</strong><br>${h(i.message)}</div>`).join("") || "<p>Document preflight passed.</p>"}</div><p class="muted">${cap.print ? "Native Inkscape and Ghostscript are available. Output includes CMYK ICC, trim and bleed boxes, font outlines and a structural report." : "Native print production runs in the downloadable standalone server with Inkscape, Ghostscript and Python installed."}</p><p class="muted">This workflow generates a PDF/X-3 candidate. Independent certification and printer acceptance are separate checks.</p>`,
        `<button class="secondary-button" id="preflight-download">Download preflight</button><button class="primary-button" id="production-export" ${!cap.print || report.errors ? "disabled" : ""}>Generate print PDF + report</button>`,
      );
    $("#preflight-download", d).onclick = () =>
      download(
        JSON.stringify(report, null, 2),
        safeName(store.doc.name) + "-preflight.json",
      );
    action($("#production-export", d), async () => {
      const doc = await outlineDocument(store.doc),
        b = doc.print.bleed,
        pages = doc.pages.map((p) =>
          toSVG(doc, p.id).replace(
            `width="${p.width}" height="${p.height}" viewBox="0 0 ${p.width} ${p.height}"`,
            `width="${p.width + 2 * b}" height="${p.height + 2 * b}" viewBox="${-b} ${-b} ${p.width + 2 * b} ${p.height + 2 * b}"`,
          ),
        ),
        response = await fetch("/api/native/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(doc.nodes.some((n) => n.cmyk)
              ? {
                  pdf: toBase64(
                    new Uint8Array(
                      await (await exportProcessPDF(doc)).arrayBuffer(),
                    ),
                  ),
                  pageCount: doc.pages.length,
                }
              : { pages }),
            bleed: b,
            intent: doc.print.intent,
            profile: doc.print.profile.split(",")[1],
          }),
        }),
        result = await response.json();
      if (!response.ok) throw new Error(result.error);
      download(
        new Blob([fromBase64(result.pdf)], { type: "application/pdf" }),
        safeName(doc.name) + "-print.pdf",
      );
      download(
        JSON.stringify(result.report, null, 2),
        safeName(doc.name) + "-print-report.json",
      );
      toast("Print PDF generated; structural checks passed");
      d.close();
    });
  });
  reg("administration", "Project administration", async () => {
    if (!collab.project) throw new Error("Save or open a cloud project first");
    const data = await collab.action("admin"),
      d = dialog(
        "Project administration",
        `<div class="advanced-grid"><label>Editing<select id="admin-archived">${option("0", "Open for editing", data.archived ? "1" : "0")}${option("1", "Locked for all editors", data.archived ? "1" : "0")}</select></label><label>Revision retention<input id="admin-retention" type="number" min="5" max="100" value="${data.retention}"></label></div><h3>Active sessions</h3><div class="audit-list">${data.sessions.map((s) => `<div>${h(s.email)} · ${s.revoked ? "Revoked" : new Date(s.expires).toLocaleTimeString()} <button data-revoke-session="${s.id}">Revoke</button></div>`).join("") || "No active sessions"}</div><h3>Audit log</h3><div class="audit-list">${data.audit.map((a) => `<div><strong>${h(a.action)}</strong> · ${h(a.actor)}<br>${new Date(a.created).toLocaleString()} · ${h(a.details)}</div>`).join("") || "No recorded activity"}</div>`,
        `<button class="secondary-button" id="admin-export">Export audit log</button><button class="primary-button" id="admin-save">Save policy</button>`,
      );
    $$("[data-revoke-session]", d).forEach((b) =>
      action(b, async () => {
        await collab.action("revoke-session", {
          sessionId: b.dataset.revokeSession,
        });
        b.textContent = "Revoked";
      }),
    );
    $("#admin-export", d).onclick = () =>
      download(JSON.stringify(data.audit, null, 2), "vellum-audit.json");
    action($("#admin-save", d), async () => {
      await collab.action("admin-settings", {
        archived: $("#admin-archived", d).value === "1",
        retention: Number($("#admin-retention", d).value),
      });
      d.close();
      toast("Project policy updated");
    });
  });
}
