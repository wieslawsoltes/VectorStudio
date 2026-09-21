# Validation record — Vellum 2.0 / GitHub publication

## September 21, 2026 publication qualification

The complete suite passed with **75 tests, zero failures and zero skipped tests** in GitHub Actions on Ubuntu 24.04 with Node.js 24. Public declarations compiled with TypeScript 5.9.3 against ES2022/DOM without skipping declaration checks. [Source restoration and qualification run](https://github.com/wieslawsoltes/VectorStudio/actions/runs/35566297248).

| Suite | Tests | Coverage |
|---|---:|---|
| Core | 17 | Document validation, geometry helpers, spatial indexing, transforms, history, merging, styles, pages and save races |
| Geometry | 5 | Paper.js Boolean operations, ellipse conversion, intersections, rotated nodes and compound paths |
| Server | 10 | Real SQLite migrations, authentication, durable documents, access restrictions, revisions, comments and presence |
| Advanced | 15 | Nested groups, page duplication, cycles, mesh interpolation, envelopes, pressure outlines, SVG sanitization, CRDT convergence and real HarfBuzz shaping |
| Sync | 7 | Atomic commits, acknowledgements, session revocation, policy checks, large snapshots, entity identity and Unicode chunk boundaries |
| Realtime client | 2 | Offline outbox persistence/restoration and divergent initial documents |
| UI integration | 4 | Application commands and advanced controls in Happy DOM |
| WebSocket | 1 | Actual TCP WebSockets with two editing replicas, text convergence, acknowledgements, session revocation and hostile-origin rejection |
| Native | 4 | A real CDR fixture, LittleCMS transforms, PDF output intents/page boxes and process-black preservation |
| Pages | 10 | Static deployment paths, browser storage, revisions, notes, conflicts, failure propagation and namespacing |

Run `node --test tests/*.test.mjs` after installing the locked development dependencies and native tools. CI fetches the attributed CC0 CDR fixture with an exact SHA-256 check and sets `VELLUM_TEST_FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`. Environment-installed font files are not redistributed. CDR coverage includes one source document, not every native version or a complete document corpus.

## Real browser checks

`scripts/test-pages-browser.mjs` runs Playwright/Chromium against a static server mounted at `/VectorStudio/`, not the domain root. The qualification run passed checks for application boot and rendering, an edit saved to real IndexedDB, reload persistence, local revision history, native/server capability disclosures, zero backend API requests, JSON and SVG downloads, page duplication, and the isolated reusable-component example. No page errors or failed asset requests were recorded. Desktop (1440 × 1000), narrower-workspace (980 × 800) and standalone-component screenshots are saved as workflow artifacts.

These are functional smoke tests and screenshot captures, not a screenshot-diff baseline or a complete usability/accessibility review. They do not establish mobile/touch or cross-browser parity.

## Reproducible publication

The recovered baseline was verified across all 164 first-party source paths, with the original dependency lock restored byte-for-byte before the Pages test fixes. Browser vendor adapters, WASM, server dependencies, notices, reusable package outputs and a packed npm tarball are included in the repository. The source packager writes a commit-labelled `RELEASE.json` containing hashes for every packaged file and refuses environment secrets, databases and environment font files.

The permanent [validation workflow](../.github/workflows/ci.yml) runs the full suite and declaration checks, builds the hosted application, packages source/modules, and starts the cleanly extracted local server without `node_modules`. Consult each Actions run for its result; this document does not assert that an unrun future commit passed.

The [Pages workflow](../.github/workflows/pages.yml) reruns the dependency-free subset and real-browser checks before deployment. Its final job verifies the live source commit and every deployed asset against `build-info.json`. Only `dist/pages` is published. Pages stores artwork locally; it does not host collaborative databases or native conversion services.

## Performance and qualification boundaries

The original 2.0 spatial-index benchmark used 10,000 objects and 10,000 point queries: 181.28 ms construction and 570.20 ms total query time (0.0570 ms/query). These are historical measurements, not rerun for this publication and not browser/GPU latency measurements. Reproduce with `node tests/benchmark.mjs`.

Physical-GPU performance, a cross-browser/device matrix, production-scale collaboration, long-running network soak, independent PDF/X certification, press qualification and a full accessibility audit remain unqualified. SVG/PDF/PNG/font fidelity has not been established across all effects, scripts and documents. The renderer rasterizes SVG in the browser and optionally composites textures with WebGPU; it is not a native GPU vector tessellator. See [COMPATIBILITY.md](COMPATIBILITY.md) for the remaining feature boundaries.
