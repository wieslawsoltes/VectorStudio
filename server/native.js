/** Optional local native adapters. Kept outside browser/Worker bundles. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeSVG } from "../public/studio/svg/index.js";
import {
  createDocument,
  createNode,
  uid,
} from "../public/studio/core/index.js";
const exec = promisify(execFile),
  root = fileURLToPath(new URL("../", import.meta.url));
let busy = 0;
const runNative = (file, args, options) =>
  exec(
    "python3",
    [resolve(root, "native/limit_exec.py"), file, ...args],
    options,
  );
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
async function helper() {
  for (const p of [
    process.env.VELLUM_CDR_CONVERTER,
    resolve(root, "native/vellum-cdr-pages"),
    process.platform === "linux" && process.arch === "x64"
      ? resolve(root, "native/vellum-cdr-pages-linux-x64")
      : null,
  ].filter(Boolean))
    try {
      await access(p);
      return p;
    } catch {}
  return null;
}
export async function nativeCapabilities() {
  const cdr = await helper(),
    probe = async (c) => {
      try {
        return (
          await exec(c, ["--version"], { timeout: 4000, maxBuffer: 10000 })
        ).stdout
          .trim()
          .split("\n")[0];
      } catch {
        return null;
      }
    };
  const [inkscape, ghostscript] = await Promise.all([
    probe("inkscape"),
    probe("gs"),
  ]);
  let python = false;
  try {
    await exec("python3", ["-c", "import pypdf"], { timeout: 4000 });
    python = true;
  } catch {}
  let cdrReady = false;
  if (cdr)
    try {
      await exec(cdr, ["--version"], { timeout: 4000 });
      cdrReady = true;
    } catch {}
  return {
    cdrImport: cdrReady,
    cdrExport: false,
    print: !!inkscape && !!ghostscript && python,
    inkscape,
    ghostscript,
    externalCertification: false,
  };
}
export async function handleNative(req) {
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/capabilities"))
    return response(await nativeCapabilities());
  if (req.method !== "POST") return response({ error: "Not found" }, 404);
  if (req.headers.get("origin") && req.headers.get("origin") !== url.origin)
    return response({ error: "Cross-origin native request rejected" }, 403);
  if (busy >= 2) return response({ error: "Native engine is busy" }, 503);
  busy++;
  let directory;
  try {
    directory = await mkdtemp(resolve(tmpdir(), "vellum-native-"));
    if (url.pathname.endsWith("/cdr")) {
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.length > 8_000_000 || bytes.length < 16)
        throw new Error("CDR file must contain 16 bytes to 8 MB");
      const signature = new TextDecoder().decode(bytes.slice(0, 12));
      if (!signature.startsWith("RIFF") && !signature.startsWith("PK"))
        throw new Error("Not a native CDR container");
      const converter = await helper();
      if (!converter)
        throw new Error("Build the libcdr helper using native/build.sh");
      await writeFile(resolve(directory, "input.cdr"), bytes);
      const r = await runNative(converter, [resolve(directory, "input.cdr")], {
          timeout: 30000,
          maxBuffer: 24_000_000,
          killSignal: "SIGKILL",
        }),
        result = JSON.parse(r.stdout),
        document = createDocument("Imported CorelDRAW document");
      document.pages = [];
      let omitted = 0;
      for (const [i, source] of result.pages.entries()) {
        const id = uid(),
          safe = sanitizeSVG(source, { prefix: "cdr" + i + "-" });
        omitted += safe.omitted;
        document.pages.push({
          id,
          name: "Page " + (i + 1),
          width: safe.width,
          height: safe.height,
          background: "#ffffff",
        });
        document.nodes.push(
          createNode("svg", {
            pageId: id,
            name: "CDR page " + (i + 1),
            x: 0,
            y: 0,
            width: safe.width,
            height: safe.height,
            svg: safe.svg,
            fill: "none",
          }),
        );
      }
      if (!document.pages.length || document.pages.length > 100)
        throw new Error("Unsupported CDR page count");
      return response({
        document,
        omitted,
        engine: "libcdr",
        warnings: [
          "CDR objects are preserved as SVG page fragments. Use Explode SVG for editable curves; unsupported native features may differ. Native CDR writing is unavailable.",
        ],
      });
    }
    if (url.pathname.endsWith("/print")) {
      const body = await req.json();
      if (
        (!body.pdf &&
          (!Array.isArray(body.pages) ||
            !body.pages.length ||
            body.pages.length > 20)) ||
        !Number.isFinite(body.bleed) ||
        body.bleed < 0 ||
        body.bleed > 200
      )
        throw new Error("Invalid print job");
      if (
        body.pdf &&
        (!Number.isInteger(body.pageCount) ||
          body.pageCount < 1 ||
          body.pageCount > 20)
      )
        throw new Error("Prepared print jobs support 1–20 pages");
      const icc = Buffer.from(body.profile || "", "base64");
      if (
        icc.length < 128 ||
        icc.length > 2_000_000 ||
        icc.toString("ascii", 36, 40) !== "acsp" ||
        icc.toString("ascii", 16, 20) !== "CMYK" ||
        icc.toString("ascii", 12, 16) !== "prtr"
      )
        throw new Error("Valid CMYK ICC profile required");
      await writeFile(resolve(directory, "output.icc"), icc);
      if (body.pdf) {
        const pdf = Buffer.from(body.pdf, "base64");
        if (pdf.length > 16000000 || pdf.subarray(0, 5).toString() !== "%PDF-")
          throw new Error("Invalid input PDF");
        await writeFile(resolve(directory, "prepared.pdf"), pdf);
      }
      for (const [i, source] of (body.pages || []).entries()) {
        const safe = sanitizeSVG(source),
          svg = safe.svg
            .replace('width="100%"', `width="${safe.width}"`)
            .replace('height="100%"', `height="${safe.height}"`);
        const input = resolve(directory, `page-${i}.svg`),
          output = resolve(directory, `page-${i}.pdf`);
        await writeFile(input, svg);
        await runNative(
          "inkscape",
          [
            input,
            "--export-type=pdf",
            "--export-text-to-path",
            `--export-filename=${output}`,
          ],
          { timeout: 30000, maxBuffer: 1000000, killSignal: "SIGKILL" },
        );
      }
      await writeFile(
        resolve(directory, "job.json"),
        JSON.stringify({
          pages: body.pages?.length || body.pageCount,
          prepared: !!body.pdf,
          bleed: body.bleed,
          intent: body.intent || "relative",
        }),
      );
      await runNative(
        "python3",
        [resolve(root, "native/print_pipeline.py"), directory],
        { timeout: 60000, maxBuffer: 1000000, killSignal: "SIGKILL" },
      );
      return response({
        pdf: (await readFile(resolve(directory, "output.pdf"))).toString(
          "base64",
        ),
        report: JSON.parse(
          await readFile(resolve(directory, "report.json"), "utf8"),
        ),
      });
    }
    return response({ error: "Not found" }, 404);
  } catch (e) {
    return response(
      {
        error: e.message,
        details:
          typeof e.stderr === "string" ? e.stderr.slice(-1500) : undefined,
      },
      400,
    );
  } finally {
    busy--;
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
