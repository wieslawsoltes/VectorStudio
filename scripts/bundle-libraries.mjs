import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const nested = createRequire(require.resolve("wrangler/package.json"));
const { build } = nested("esbuild");
await build({
  entryPoints: [
    "vendor-src/geometry.js",
    "vendor-src/pdf.js",
    "vendor-src/fonts.js",
    "vendor-src/crdt.js",
    "vendor-src/xml.js",
    "vendor-src/text.js",
  ],
  bundle: true,
  format: "esm",
  platform: "browser",
  outdir: "public/studio/vendor",
  minify: true,
  legalComments: "eof",
  define: { "process.env.NODE_ENV": '"production"' },
});

const { cp, mkdir } = await import("node:fs/promises");
await mkdir("public/studio/vendor/hb", { recursive: true });
await cp(
  new URL("../node_modules/harfbuzzjs/dist/", import.meta.url),
  "public/studio/vendor/hb",
  { recursive: true },
);
await cp(
  new URL("../node_modules/lcms-wasm/dist/lcms.js", import.meta.url),
  "public/studio/vendor/lcms.js",
);
await cp(
  new URL("../node_modules/lcms-wasm/dist/lcms.wasm", import.meta.url),
  "public/studio/vendor/lcms.wasm",
);
await mkdir("server/vendor", { recursive: true });
await build({
  entryPoints: ["node_modules/ws/index.js"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "server/vendor/ws.cjs",
  external: ["bufferutil", "utf-8-validate"],
  minify: true,
  legalComments: "eof",
});
