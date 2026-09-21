import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { handleNative, nativeCapabilities } from "../server/native.js";
import {
  colorEngine,
  createColorTransform,
} from "../public/studio/color/index.js";
import { validateDocument } from "../public/studio/core/index.js";
test("libcdr imports a real CC0 CDR fixture into validated SVG pages", async () => {
  const bytes = await readFile("tests/fixtures/cc0-graveyard-tile.cdr");
  const response = await handleNative(
    new Request("http://local/api/native/cdr", { method: "POST", body: bytes }),
  );
  const result = await response.json();
  assert.equal(response.status, 200, result.error);
  assert.equal(result.document.pages.length, 1);
  validateDocument(result.document);
  assert.match(result.document.nodes[0].svg, /<path/);
});
test("LittleCMS produces actual CMYK and RGB transforms with supplied ICC", async () => {
  await colorEngine({
    wasmBinary: new Uint8Array(
      await readFile("public/studio/vendor/lcms.wasm"),
    ),
  });
  const bytes = new Uint8Array(
      await readFile("/usr/share/color/icc/ghostscript/default_cmyk.icc"),
    ),
    t = await createColorTransform(bytes);
  const cmyk = t.rgbToCmyk([255, 0, 0]);
  assert.equal(cmyk.length, 4);
  assert.ok(cmyk[1] > 150 && cmyk[2] > 150);
  const rgb = t.cmykToRgb(cmyk);
  assert.equal(rgb.length, 3);
  assert.ok(rgb[0] > rgb[1]);
  t.dispose();
});
test("native print creates a CMYK PDF with matching output intent and valid boxes", async () => {
  const profile = (
    await readFile("/usr/share/color/icc/ghostscript/default_cmyk.icc")
  ).toString("base64");
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="224" height="124" viewBox="-12 -12 224 124"><rect x="-12" y="-12" width="224" height="124" fill="#ff0000"/><path d="M10 10L100 10L100 90Z" fill="#00ff00"/></svg>';
  const response = await handleNative(
    new Request("http://local/api/native/print", {
      method: "POST",
      body: JSON.stringify({ pages: [svg], bleed: 12, profile }),
    }),
  );
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.report.structuralChecksPassed, true);
  assert.equal(result.report.externalCertification, false);
  assert.ok(
    Buffer.from(result.pdf, "base64").subarray(0, 5).toString() === "%PDF-",
  );
});

test("solid process black survives direct PDF output and native ICC production", async () => {
  const { createDocument, createNode } =
    await import("../public/studio/core/index.js");
  const { configureGeometry, exportProcessPDF } =
    await import("../public/studio/io/index.js");
  const paper = (await import("paper")).default;
  configureGeometry(paper);
  const doc = createDocument("Pure K");
  doc.pages[0].width = 200;
  doc.pages[0].height = 100;
  doc.print = { bleed: 12, inkLimit: 300, intent: "relative" };
  doc.nodes = [
    createNode("rect", {
      pageId: doc.pages[0].id,
      x: 10,
      y: 10,
      width: 100,
      height: 60,
      fill: "#231f20",
      cmyk: [0, 0, 0, 100],
    }),
  ];
  const pdf = await exportProcessPDF(doc),
    profile = (
      await readFile("/usr/share/color/icc/ghostscript/default_cmyk.icc")
    ).toString("base64");
  const response = await handleNative(
    new Request("http://local/api/native/print", {
      method: "POST",
      body: JSON.stringify({
        pdf: Buffer.from(await pdf.arrayBuffer()).toString("base64"),
        pageCount: 1,
        bleed: 12,
        profile,
      }),
    }),
  );
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  const { spawnSync } = await import("node:child_process");
  const inspected = spawnSync(
    "python3",
    [
      "-c",
      'import sys,io,base64;from pypdf import PdfReader;r=PdfReader(io.BytesIO(base64.b64decode(sys.stdin.read())));print(r.pages[0].get_contents().get_data().decode("latin1"))',
    ],
    { input: result.pdf, encoding: "utf8" },
  );
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.match(inspected.stdout, /0 0 0 1 k/);
});
