/** Sanitized static SVG preservation. Scripts, navigation and external resources are excluded. */
import { DOMParser, XMLSerializer } from "../vendor/xml.js";
const elements = new Set(
  "svg g path rect circle ellipse line polygon polyline text tspan textPath defs linearGradient radialGradient stop title desc clipPath mask pattern use image symbol marker filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence".split(
    " ",
  ),
);
const attributes = new Set(
  "id xmlns xmlns:xlink version viewBox preserveAspectRatio x y x1 x2 y1 y2 dx dy width height rx ry r cx cy d points transform gradientTransform patternTransform gradientUnits patternUnits patternContentUnits clipPathUnits maskUnits maskContentUnits offset stop-color stop-opacity fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color display visibility font-family font-size font-weight font-style font-stretch font-variant font-feature-settings letter-spacing word-spacing text-anchor text-decoration direction unicode-bidi dominant-baseline alignment-baseline baseline-shift textLength lengthAdjust startOffset method spacing href xlink:href clip-path mask filter marker-start marker-mid marker-end markerWidth markerHeight refX refY orient markerUnits spreadMethod fx fy fr color-interpolation-filters in in2 result mode type values operator k1 k2 k3 k4 order kernelMatrix divisor bias targetX targetY edgeMode kernelUnitLength preserveAlpha surfaceScale diffuseConstant scale xChannelSelector yChannelSelector azimuth elevation flood-color flood-opacity slope intercept amplitude exponent stdDeviation radius specularConstant specularExponent limitingConeAngle pointsAtX pointsAtY pointsAtZ z baseFrequency numOctaves seed stitchTiles".split(
    " ",
  ),
);
const styleKeys = new Set(
  "fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color display visibility font-family font-size font-weight font-style font-stretch font-variant font-feature-settings letter-spacing word-spacing text-anchor text-decoration direction unicode-bidi dominant-baseline baseline-shift clip-path mask filter stop-color stop-opacity".split(
    " ",
  ),
);
const safeValue = (v) =>
  v.length <= 1_000_000 &&
  !/[<>\\]/.test(v) &&
  !/(?:javascript|vbscript|expression|@import|behavior|binding)\s*[:(]/i.test(
    v,
  ) &&
  [...v.matchAll(/url\s*\(([^)]*)\)/gi)].every((m) =>
    /^['"]?#[\w.:-]+['"]?$/.test(m[1].trim()),
  );
export function sanitizeSVG(source, { prefix = "" } = {}) {
  if (
    typeof source !== "string" ||
    source.length > 4_000_000 ||
    /<!DOCTYPE|<!ENTITY|<\?/i.test(source.replace(/^\s*<\?xml[^?]*\?>/, ""))
  )
    throw new Error("Invalid or oversized SVG");
  let invalid = false;
  const xml = new DOMParser({
    onError: () => {
      invalid = true;
    },
  }).parseFromString(source, "image/svg+xml");
  if (invalid || xml.documentElement?.localName !== "svg")
    throw new Error("Invalid SVG");
  let omitted = 0;
  const walk = (el) => {
    for (const child of [...Array.from(el.childNodes)]) {
      if (child.nodeType === 1) {
        if (
          !elements.has(child.localName) ||
          (child.prefix && child.prefix !== "svg")
        ) {
          el.removeChild(child);
          omitted++;
        } else walk(child);
      } else if (![3, 4].includes(child.nodeType)) el.removeChild(child);
    }
    for (const a of Array.from(el.attributes)) {
      const key = a.name,
        v = a.value;
      if (key === "style") {
        for (const declaration of v.split(";")) {
          const i = declaration.indexOf(":");
          if (i < 0) continue;
          const k = declaration.slice(0, i).trim(),
            value = declaration.slice(i + 1).trim();
          if (styleKeys.has(k) && safeValue(value)) el.setAttribute(k, value);
          else omitted++;
        }
        el.removeAttribute(key);
        continue;
      }
      if (
        !attributes.has(key) ||
        !safeValue(v) ||
        ((key === "href" || key === "xlink:href") &&
          !/^#[\w.:-]+$/.test(v) &&
          !(
            el.localName === "image" &&
            /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)
          ))
      ) {
        el.removeAttribute(key);
        omitted++;
      }
    }
    if (prefix) {
      if (el.hasAttribute("id"))
        el.setAttribute("id", prefix + el.getAttribute("id"));
      for (const a of Array.from(el.attributes)) {
        let v = a.value.replace(
          /url\(['"]?#([\w.:-]+)['"]?\)/g,
          (_, id) => `url(#${prefix}${id})`,
        );
        if ((a.name === "href" || a.name === "xlink:href") && v.startsWith("#"))
          v = "#" + prefix + v.slice(1);
        el.setAttribute(a.name, v);
      }
    }
  };
  walk(xml.documentElement);
  xml.documentElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  xml.documentElement.setAttribute(
    "xmlns:xlink",
    "http://www.w3.org/1999/xlink",
  );
  const box = (xml.documentElement.getAttribute("viewBox") || "")
      .split(/[ ,]+/)
      .map(Number),
    w = Number.parseFloat(xml.documentElement.getAttribute("width")),
    hh = Number.parseFloat(xml.documentElement.getAttribute("height"));
  const length = (v, fallback) => {
    const m = String(v || "").match(/^([0-9.]+)(px|pt|pc|mm|cm|in)?$/);
    return m
      ? Number(m[1]) *
          { px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 }[
            m[2] || "px"
          ]
      : fallback;
  };
  const width = Math.min(
      20000,
      Math.max(
        1,
        length(xml.documentElement.getAttribute("width"), box[2] || 800),
      ),
    ),
    height = Math.min(
      20000,
      Math.max(
        1,
        length(xml.documentElement.getAttribute("height"), box[3] || 600),
      ),
    );
  if (!box.length || box.length !== 4)
    xml.documentElement.setAttribute("viewBox", `0 0 ${width} ${height}`);
  if (!xml.documentElement.hasAttribute("fill"))
    xml.documentElement.setAttribute("fill", "#000000");
  xml.documentElement.setAttribute("width", "100%");
  xml.documentElement.setAttribute("height", "100%");
  return {
    svg: new XMLSerializer().serializeToString(xml.documentElement),
    width,
    height,
    omitted,
  };
}
const cache = new Map();
export function validateSVG(source) {
  if (cache.has(source)) return;
  if (sanitizeSVG(source).svg !== source)
    throw new Error("Invalid unsanitized SVG fragment");
  cache.set(source, true);
  if (cache.size > 20) cache.delete(cache.keys().next().value);
}
