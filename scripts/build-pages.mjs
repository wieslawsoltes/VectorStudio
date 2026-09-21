/** Assemble a static editor without publishing server code, credentials or project data. */
import { cp, mkdir, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, sep, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function buildPages(destination = resolve(root, 'dist/pages')) {
  destination = resolve(destination);
  const publicRoot = resolve(root, 'public');
  if (destination === root || root.startsWith(destination + sep) || destination === publicRoot || destination.startsWith(publicRoot + sep)) throw new Error('Unsafe Pages output directory');
  for (const file of ['studio/app.js', 'studio/static.js', 'studio/vendor/crdt.js', 'studio/vendor/geometry.js', 'studio/vendor/pdf.js', 'studio/vendor/lcms.wasm', 'studio/vendor/hb/harfbuzz.wasm']) await stat(resolve(publicRoot, file));
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(publicRoot, destination, { recursive: true });
  const { shell } = await import(pathToFileURL(resolve(publicRoot, 'studio/shell.js')).href);
  const html = shell.replaceAll('href="/', 'href="./').replaceAll('src="/', 'src="./').replace('<script type="module"', '<script src="./studio/pages-config.js"></script><script type="module"');
  await writeFile(resolve(destination, 'index.html'), html);
  await writeFile(resolve(destination, 'studio/pages-config.js'), 'globalThis.VELLUM_STATIC = true;\n');
  const examplePath = resolve(destination, 'examples/standalone.html');
  let example = await readFile(examplePath, 'utf8');
  example = example.replaceAll('href="/', 'href="../').replaceAll("from '/studio/", "from '../studio/");
  await writeFile(examplePath, example);
  await writeFile(resolve(destination, '.nojekyll'), '');
  let commit = process.env.GITHUB_SHA || null;
  if (!commit) { try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); } catch {} }
  const files = {};
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlinks are not supported in Pages artifacts');
      if (entry.isDirectory()) await walk(path);
      else files[relative(destination, path).split(sep).join('/')] = createHash('sha256').update(await readFile(path)).digest('hex');
    }
  }
  await walk(destination);
  const info = { name: 'Vellum Vector Studio', edition: 'browser-local', sourceCommit: commit, capabilities: { browserStorage: true, remoteCollaboration: false, nativeConverters: false }, files };
  await writeFile(resolve(destination, 'build-info.json'), JSON.stringify(info, null, 2));
  console.log(`Pages build: ${Object.keys(files).length} assets in ${destination}`);
  return { destination, ...info };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildPages();
