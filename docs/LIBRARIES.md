# Reusable Vellum libraries

The package is `@vellum-studio/vector`. A prepared npm tarball is included in the source delivery. It is independent of the full studio app and its hosting framework. Original modules are native ES modules and include hand-authored TypeScript declarations.

## Exports

| Export | Runtime | Main API |
|---|---|---|
| `/core` or package root | Browser / modern Node | `DocumentStore`, `createDocument`, `createNode`, `Matrix`, `SpatialIndex`, `PluginRegistry` |
| `/render` | SVG serialization in Node; DOM/GPU renderer in browser | `toSVG`, `SVGRenderer`, `WebGPUCompositor` |
| `/controls` | Browser when rendering controls | `CommandRegistry`, `icon`, `button`, `dialog`, `toast` |
| `/elements` | Browser with custom elements / Shadow DOM | `registerElements`, canvas, property grid, object tree, palette |
| `/io` | Browser; geometry can accept an injected Paper backend | SVG/raster import, PDF/PNG export, Boolean paths, font import |
| `/collaboration` | Pure merge functions in Node; HTTP client in browser | `diffDocument`, `mergeChanges`, `CollaborationClient` |
| `/advanced` | Browser / Node | `createMesh`, `meshCells`, `bilinear`, `envelopePoints`, `brushOutline` |
| `/typography` | Browser; HarfBuzz in Node | `layoutText`, `flowDocument`, `shapedOutlines`, `restoreFonts`, `matchingFont` |
| `/color` | Browser / Node with WASM bytes | `createColorTransform`, `colorEngine`, `preflight` |
| `/svg` | Browser / Node | `sanitizeSVG`, `validateSVG` |
| `/crdt` | Browser / Node | `createReplica`, `applyDocumentChanges`, `materializeDocument`, `encodeState`, `applyUpdate` |
| `/realtime` | Browser with authenticated API | `RealtimeClient` (WebSocket/HTTP, IndexedDB recovery and selective undo) |
| `/sample` | Browser / modern Node | `sampleDocument` |

## Document without an application

```js
import {createDocument, createNode, DocumentStore} from '@vellum-studio/vector/core';
import {toSVG} from '@vellum-studio/vector/render';

const document = createDocument('Poster');
document.nodes.push(createNode('rect', {
  pageId: document.pages[0].id,
  name: 'Accent panel',
  x: 60, y: 80, width: 320, height: 200,
  fill: '#087f68'
}));
const store = new DocumentStore(document);
store.select([store.nodes[0].id]);
store.update([...store.selection], {rotation: 15}, 'Rotate panel');
store.undo();
const svg = toSVG(store.doc);
```

## Compose an editor with independent controls

```html
<vellum-object-tree></vellum-object-tree>
<vellum-canvas style="height:600px"></vellum-canvas>
<vellum-property-grid></vellum-property-grid>
<vellum-color-palette></vellum-color-palette>
```

```js
import {registerElements} from '@vellum-studio/vector/elements';
import {DocumentStore} from '@vellum-studio/vector/core';
import {sampleDocument} from '@vellum-studio/vector/sample';

registerElements();
const store = new DocumentStore(sampleDocument());
for (const element of document.querySelectorAll(
  'vellum-canvas,vellum-object-tree,vellum-property-grid,vellum-color-palette'
)) element.store = store;
const canvas = document.querySelector('vellum-canvas');
canvas.setTool('ellipse');
canvas.fill = '#c6ec74';
canvas.fit();
```

No React/Vue/Angular adapter is required: these are standard web components. Framework wrappers can bind the `.store` property after mount. Server-rendered apps should import the elements module only in the client because it extends `HTMLElement`.

The runnable `public/examples/standalone.html` demonstrates this arrangement. Its relative module layout is included in the archive and served by the local server.

## Retained SVG and GPU compositing

```js
import {SVGRenderer, WebGPUCompositor, toSVG} from '@vellum-studio/vector/render';
const svg = document.querySelector('svg');
const renderer = new SVGRenderer(svg);
renderer.render(store.doc, store.page.id);

const gpu = new WebGPUCompositor(document.querySelector('canvas'), console.log);
if (await gpu.initialize()) {
  await gpu.render(toSVG(store.doc), store.page.width, store.page.height, 1);
}
// Keep the SVG beneath the GPU canvas as the fallback.
// Call gpu.invalidate() before transient edits, then render the new snapshot.
```

The GPU module composites a browser-rasterized page texture; it does not tessellate paths in WGSL. SVG filters and typography therefore use the browser's SVG implementation. `destroy()` releases GPU resources.

## Geometry

```js
import {booleanOperation} from '@vellum-studio/vector/io';
const curve = await booleanOperation([rectangle, ellipse], 'subtract');
// curve is an editable path with SVG d, native dimensions and world position.
```

Geometry operations support shape/path nodes. Convert text to outlines using the matching imported font before using it in Boolean operations. Browser geometry is bundled. Node geometry hosts can install Paper.js and call `configureGeometry(paper)` before using the I/O geometry functions.

## Plugins and event integration

```js
const unregister = plugins.register({
  id: 'example.offset',
  commands: {
    moveRight: ({store}) => store.update([...store.selection], n => ({x:n.x+10}), 'Move right')
  }
});
plugins.execute('moveRight', {store});
store.addEventListener('change', event => console.log(event.detail.label));
```

The registry does not sandbox plugin code or infer new shape renderers. It is a small host extension API.

## Build and distribution

From the repository root, run `node scripts/package-libraries.mjs`, then `npm pack` inside `packages/vector`. The resulting package contains the module directories, browser vendor adapters, declarations, README and third-party licenses. Package publication requires an npm scope you control; change the package name if needed. The included workflow only publishes when explicitly launched with its publish input enabled.

## Shared document without the studio

```js
import {createReplica, applyDocumentChanges, encodeState, applyUpdate,
  materializeDocument} from '@vellum-studio/vector/crdt';
const authoritative = createReplica(document);
const peer = createReplica();
applyUpdate(peer, encodeState(authoritative));
const edited = structuredClone(document);
edited.nodes[0].x += 20;
applyDocumentChanges(peer, document, edited);
applyUpdate(authoritative, encodeState(peer));
console.log(materializeDocument(authoritative).nodes[0].x);
```

Seed a project once and distribute that seed; independently seeding identical JSON creates distinct CRDT identities. The transport server validates updates and authorizes every commit. A Yjs merge is not an authorization mechanism.

## ICC conversion

```js
import {createColorTransform} from '@vellum-studio/vector/color';
const transform = await createColorTransform(new Uint8Array(iccBytes), {
  intent: 'relative'
});
const cmykBytes = transform.rgbToCmyk([255, 0, 0]);
const previewRGB = transform.cmykToRgb(cmykBytes);
transform.dispose();
```

RGB and CMYK transform channels are integer bytes from 0–255. The editor stores CMYK percentages from 0–100. Use your printer's profile. In Node hosts, `colorEngine({wasmBinary: bytes})` supplies the packaged WASM directly when URL loading is unavailable. HarfBuzz assets remain adjacent to its module; copy the complete package asset tree when hosting without a bundler.

Mesh fills tessellate into SVG polygons. Envelopes and brushes retain editable source parameters. See COMPATIBILITY.md in the source repository for exact geometry, typography, renderer and production limitations. The optional native server adapters are distributed in the full source ZIP, not the browser npm package.
