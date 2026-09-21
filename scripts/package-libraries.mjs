import { cp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
const root = process.cwd(),
  pkg = resolve(root, "packages/vector");
await mkdir(pkg + "/dist", { recursive: true });
for (const part of [
  "core",
  "render",
  "controls",
  "elements",
  "io",
  "collab",
  "vendor",
  "advanced",
  "typography",
  "color",
  "svg",
])
  await cp(resolve(root, "public/studio", part), pkg + "/dist/" + part, {
    recursive: true,
  });
for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
  await cp(resolve(root, file), pkg + "/" + file);
await cp(resolve(root, "docs/LIBRARIES.md"), pkg + "/README.md");
await cp(resolve(root, "licenses"), pkg + "/licenses", { recursive: true });
console.log(
  "Prepared @vellum-studio/vector with independent modules and TypeScript declarations.",
);
