# Vellum Vector Studio

A working vector illustration and page-layout application with a desktop-style workspace, editable sample artwork, reusable JavaScript libraries, an SVG/WebGPU renderer, a persistent collaboration backend, and a standalone web-component example.

**Release 2.0.0 adds real CDR import, ICC/CMYK processing, native print preflight, editable meshes/envelopes/pressure brushes, richer typography and nested groups, a multipage canvas, and Yjs/WebSocket collaboration with project administration.** It remains short of full CorelDRAW parity. Native CDR writing, independent print certification, advanced desktop feature completeness and organization/SSO/SCIM administration are not implemented. [COMPATIBILITY.md](docs/COMPATIBILITY.md) states exactly what is supported.

## Public browser edition

[Open VectorStudio on GitHub Pages](https://wieslawsoltes.github.io/VectorStudio/) · [Standalone component demo](https://wieslawsoltes.github.io/VectorStudio/examples/standalone.html)

The Pages edition saves projects and up to twenty revisions **only in this browser**, with IndexedDB. It does not host the collaboration database or native converters. Download `.vellum` backups. The complete server edition is included below. See [GitHub Pages deployment and storage](docs/GITHUB_PAGES.md).

## Run immediately

Requires **Node.js 22.13 or later**; Node 24 is recommended. The browser bundles are included, so the local app needs no installation step.

```sh
node server/local.mjs
```

Open **http://127.0.0.1:3000**. This starts the complete editor, API and SQLite database in local single-user mode. The database is created in `data/vellum.sqlite`; the schema migrations apply automatically. Set `PORT=3100` to use another port.

The standalone component example is at **http://127.0.0.1:3000/examples/standalone.html**. It uses only the reusable modules and four web components; it does not load the studio application.

## What works

- Editable multipage vector documents with deterministic SVG output and validated, human-readable `.vellum` JSON.
- Pick, multiselect, marquee, move, numeric properties, eight resize handles, rotation, flips, duplication, clipboard, nudge, group selection/isolation, stacking, visibility, locks, undo and redo.
- Rectangles, rounded rectangles, ellipses, polygons, stars, lines, freehand paths, Bézier paths and editable nodes/handles.
- Weld/union, trim/subtract, intersect, exclude, conversion to curves, compound-path break-apart and curve smoothing, backed by Paper.js.
- Text editing, families, weight, size, spacing, leading, alignment, italic/underline, embedded font faces, paragraph columns/threads, Unicode line breaks, OpenType settings, and HarfBuzz-shaped outlines.
- Solid and two-stop linear/radial gradient editing, strokes, dash/cap controls, opacity, shadows, ellipse clipping, contour outlines, shape blends and mirror duplicates.
- Rulers, grid, object/page/guide snapping, outline view, page overview, zoom, pan, light/dark workspace and keyboard command search.
- Preserved static SVG import with masks/patterns/filters/text paths, raster import, SVG/PNG/vector-PDF export, printing and complete-project JSON export.
- Editable mesh lattices, bilinear curve envelopes, pressure ribbons and calligraphy nibs.
- Real native CDR import through libcdr, LittleCMS ICC transforms and a native PDF/X candidate pipeline with structural reports. The native features require the optional setup in [native/README.md](native/README.md).
- Durable Yjs projects, character-level shared text, stable entity ordering, WebSocket/HTTP transport, offline IndexedDB outbox, local undo, comments, presence and configurable revision history.
- Project roles, editing locks, active-session revocation, audit records and audit export.

## Repository map

| Location | Purpose |
|---|---|
| `public/studio/core/` | Document model, validation, geometry helpers, spatial index, history and plugin registry |
| `public/studio/render/` | Retained SVG renderer, SVG serialization and WebGPU compositor |
| `public/studio/controls/` | DOM control helpers and command registry |
| `public/studio/elements/` | Standalone canvas, property grid, object tree and palette web components |
| `public/studio/io/` | Imports, exports, curve adapter, font import and outlines |
| `public/studio/collab/` | Yjs replica, real-time provider, durable recovery and legacy merge API |
| `public/studio/app.js`, `style.css` | The plain-JavaScript studio application |
| `public/studio/advanced/`, `typography/`, `color/`, `svg/` | Reusable effects, text shaping, ICC and SVG preservation modules |
| `native/` | C++ CDR adapter, print pipeline and resource-bounded process wrapper |
| `server/` | Framework-independent API, Node SQLite adapter and local HTTP server |
| `app/` | Thin hosting routes; the UI does not depend on React |
| `db/`, `drizzle/` | Hosted database schema and versioned migrations |
| `packages/vector/` | Publishable npm package manifest |
| `public/examples/standalone.html` | Runnable reusable-components example |
| `tests/` | Geometry, model, collaboration and database integration tests |
| `docs/` | Architecture, API, deployment, collaboration, validation and boundaries |

## Develop and package

The hosting build uses the checked-in pnpm lockfile and the package manager version pinned in `package.json`.

```sh
corepack enable
corepack pnpm install --frozen-lockfile
node --test tests/*.test.mjs
node scripts/bundle-libraries.mjs
node scripts/package-libraries.mjs
cd packages/vector
npm pack
```

The distributable package exports `@vellum-studio/vector/core`, `/render`, `/controls`, `/elements`, `/io`, `/collaboration`, `/crdt`, `/realtime`, `/advanced`, `/typography`, `/color`, and `/svg`, with TypeScript declarations. Its browser adapters and notices are included. The UI framework dependencies belong to the hosting scaffold; the vector library and local app do not require them at runtime.

The included manual publishing workflow can publish the package to an npm scope you control after configuring `NPM_TOKEN`. No npm publication has been performed as part of this source delivery.

## Collaboration and hosting

The hosted API uses authenticated identity headers supplied by its hosting gateway and a D1 SQLite database. The local server defaults to a loopback-only, single-user identity. A network deployment requires an authenticated reverse proxy; never expose the identity-header trust boundary directly. See [DEPLOYMENT.md](docs/DEPLOYMENT.md).

Project membership is independent of access to the hosted site itself. A user must pass both gates. Granting a project role does not send an email or change the site's audience.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Standalone libraries and examples](docs/LIBRARIES.md)
- [Collaboration protocol and database](docs/COLLABORATION.md)
- [Compatibility and limitations](docs/COMPATIBILITY.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Validation and performance](docs/VALIDATION.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

Original Vellum code is MIT licensed. Curve geometry uses Paper.js; PDF output uses jsPDF and svg2pdf.js; font parsing uses OpenType.js; shaping uses HarfBuzz; ICC transforms use LittleCMS; CRDT state uses Yjs. Native CDR import links libcdr/librevenge and print conversion invokes Inkscape/Ghostscript. Notices for bundled code and WASM are included. Native system libraries/tools are separately installed and retain their upstream licenses.
