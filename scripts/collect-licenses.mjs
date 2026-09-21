import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve, basename } from "node:path";
const require = createRequire(import.meta.url),
  { build } = createRequire(require.resolve("wrangler/package.json"))(
    "esbuild",
  );
const result = await build({
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
  metafile: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
const packages = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.includes("node_modules")) continue;
  let dir = dirname(resolve(input));
  for (let i = 0; i < 12; i++) {
    try {
      const p = JSON.parse(await readFile(dir + "/package.json", "utf8"));
      if (p.name === "vellum-vector-studio") break;
      if (p.name) {
        packages.set(p.name, { ...p, dir });
        break;
      }
    } catch {}
    const next = dirname(dir);
    if (next === dir) break;
    dir = next;
  }
}
for (const name of ["harfbuzzjs", "lcms-wasm", "ws"]) {
  const dir = dirname(require.resolve(name));
  let root = dir;
  for (let i = 0; i < 3; i++) {
    try {
      const p = JSON.parse(await readFile(root + "/package.json", "utf8"));
      if (p.name === name) {
        packages.set(name, { ...p, dir: root });
        break;
      }
    } catch {}
    root = dirname(root);
  }
}
await mkdir("licenses", { recursive: true });
const rows = [];
for (const p of [...packages.values()].sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  const files = (await readdir(p.dir)).filter((n) =>
    /^licen[sc]e|^copying|^notice/i.test(n),
  );
  for (const file of files) {
    try {
      const text = await readFile(p.dir + "/" + file, "utf8");
      await writeFile(
        "licenses/" + p.name.replaceAll("/", "__") + "-" + file + ".txt",
        text,
      );
    } catch {}
  }
  rows.push(
    `| ${p.name} | ${p.version} | ${typeof p.license === "string" ? p.license : "See license file"} |`,
  );
}
await writeFile(
  "THIRD_PARTY_NOTICES.md",
  "# Third-party notices\n\nThe Vellum application and original modules are MIT licensed. Third-party code retains its own notices. Browser geometry, font, PDF, color and collaboration bundles and the local WebSocket adapter include the following packages; full available notices are in `licenses/` and legal comments are retained in the bundles. The hosting scaffold has additional dependencies recorded in the lockfile.\n\n| Package | Bundled version | License |\n|---|---|---|\n" +
    rows.join("\n") +
    "\n\nThe copied WASM modules also include the following underlying libraries and data; their separate license texts are included in `licenses/`.\n\n| Component | Bundled revision | License file |\n|---|---|---|\n| HarfBuzz 14.4.0 | 36cb489cb02ce4b92099669ba9f9bea348eff93f | harfbuzz-COPYING.txt (Old MIT) |\n| LittleCMS 2.16 | c2a54017d73080f97c5cd34a78ff2fb51564aade | littlecms-LICENSE.txt (MIT) |\n| Microsoft USE shaping data | HarfBuzz revision above | harfbuzz-ms-use-COPYING.txt (MIT) |\n| Unicode character data | Unicode 17 shaping tables | unicode-LICENSE.txt (Unicode License V3) |\n\nThe wrapper licenses for harfbuzzjs and lcms-wasm apply separately. These upstream notices are retained as release source files; the collector does not overwrite them.\n\nPaper.js provides curve Boolean geometry. jsPDF and svg2pdf.js provide PDF serialization. OpenType.js provides font parsing and outlines. Vellum does not claim authorship of these engines.\n",
);
console.log({ bundledPackages: packages.size });
