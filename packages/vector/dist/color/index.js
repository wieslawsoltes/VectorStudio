import { flowDocument, matchingFont } from "../typography/index.js";
/** LittleCMS ICC transforms. Profiles are embedded in documents, never guessed. */
let engine;
export const toBase64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768)
    s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
};
export const fromBase64 = (s) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function colorEngine(options = {}) {
  if (!engine) {
    const { instantiate } = await import("../vendor/lcms.js");
    engine = instantiate({
      locateFile: () => new URL("../vendor/lcms.wasm", import.meta.url).href,
      ...options,
    });
  }
  return engine;
}
export async function createColorTransform(
  bytes,
  { intent = "relative" } = {},
) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < 128 ||
    bytes.length > 2_000_000
  )
    throw new Error("ICC profile must contain 128 bytes to 2 MB");
  const l = await colorEngine(),
    p = l.cmsOpenProfileFromMem(bytes, bytes.length);
  if (!p) throw new Error("ICC profile could not be parsed");
  const rgb = l.cmsCreate_sRGBProfile();
  let forward, reverse;
  try {
    if (l.cmsGetColorSpaceASCII(p) !== "CMYK")
      throw new Error("Choose a CMYK output profile");
    const input = l.cmsFormatterForColorspaceOfProfile(rgb, 1, false),
      output = l.cmsFormatterForColorspaceOfProfile(p, 1, false),
      i =
        { perceptual: 0, relative: 1, saturation: 2, absolute: 3 }[intent] ?? 1;
    forward = l.cmsCreateTransform(rgb, input, p, output, i, 0x2000);
    reverse = l.cmsCreateTransform(p, output, rgb, input, i, 0x2000);
    if (!forward || !reverse) throw new Error("ICC transform creation failed");
    return {
      description: l.cmsGetProfileInfoASCII(p, 0, "en", "US"),
      rgbToCmyk(values) {
        if (values.length % 3) throw new Error("Expected RGB triples");
        return l.cmsDoTransform(
          forward,
          new Uint8Array(values),
          values.length / 3,
        );
      },
      cmykToRgb(values) {
        if (values.length % 4) throw new Error("Expected CMYK quads");
        return l.cmsDoTransform(
          reverse,
          new Uint8Array(values),
          values.length / 4,
        );
      },
      dispose() {
        if (forward) l.cmsDeleteTransform(forward);
        if (reverse) l.cmsDeleteTransform(reverse);
        forward = reverse = 0;
      },
    };
  } catch (e) {
    if (forward) l.cmsDeleteTransform(forward);
    if (reverse) l.cmsDeleteTransform(reverse);
    throw e;
  } finally {
    l.cmsCloseProfile(p);
    l.cmsCloseProfile(rgb);
  }
}
export function preflight(doc, { minimumDPI = 250 } = {}) {
  const flows = flowDocument(doc),
    issues = [],
    add = (severity, code, message, node) =>
      issues.push({
        severity,
        code,
        message,
        nodeId: node?.id,
        pageId: node?.pageId,
      });
  if (!doc.print?.profile)
    add(
      "error",
      "output-profile",
      "Select an embedded CMYK ICC output profile.",
    );
  if (!(doc.print?.bleed > 0))
    add("warning", "bleed", "No bleed is configured.");
  for (const n of doc.nodes) {
    if (n.type === "text" && !matchingFont(doc, n))
      add(
        "error",
        "font-not-embedded",
        `${n.name}: matching font face/style is not embedded; import it or convert text to outlines.`,
        n,
      );
    if (
      n.type === "text" &&
      n.textFrame &&
      !n.nextFrame &&
      flows.get(n.id)?.textLayout?.overset
    )
      add(
        "error",
        "overset-text",
        `${n.name}: text overflows the final frame.`,
        n,
      );
    if (n.opacity < 1 || n.shadow || n.mesh || n.type === "svg")
      add(
        "warning",
        "flatten-review",
        `${n.name}: inspect transparency, effects and preserved SVG after print conversion.`,
        n,
      );
    if (n.imagePixels) {
      const dpi =
        Math.min(
          n.imagePixels.width / n.width,
          n.imagePixels.height / n.height,
        ) * 96;
      if (dpi < minimumDPI)
        add(
          "warning",
          "image-resolution",
          `${n.name}: ${Math.round(dpi)} effective DPI.`,
          n,
        );
    }
    if (
      n.cmyk &&
      n.cmyk.reduce((a, b) => a + b, 0) > (doc.print?.inkLimit || 300)
    )
      add(
        "warning",
        "ink-coverage",
        `${n.name}: total ink exceeds the configured limit.`,
        n,
      );
    if (
      n.cmyk &&
      (n.mesh ||
        n.gradient ||
        n.shadow ||
        n.clip ||
        n.type === "svg" ||
        n.type === "image")
    )
      add(
        "error",
        "process-fill-effects",
        `${n.name}: exact process-color export requires a solid vector fill.`,
        n,
      );
    if (n.spot)
      add(
        "warning",
        "spot-conversion",
        `${n.name}: named spot ${n.spot} uses its process-color alternate in this export path.`,
        n,
      );
  }
  return {
    created: new Date().toISOString(),
    issues,
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    externalCertification: false,
  };
}
