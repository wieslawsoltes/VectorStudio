# Validation record — 2.0.0

Validated with Node.js v24.19.0 on Linux x64. This record describes executable checks and their limits; it is not a certification of desktop-product parity.

## Automated checks

The release suite contains 65 tests across nine files. Run it with:

```sh
node --test tests/*.test.mjs
```

Install development dependencies for the DOM tests and the native tools described in `native/README.md` for native conversion and print tests. The standalone application itself runs without installing npm dependencies because its browser adapters and WebSocket server dependency are included.

| Suite | Tests | Coverage |
|---|---:|---|
| Core | 17 | Document validation, spatial indexing, transforms, transactions, undo/redo, merging, styles, pages, save races and pointer deferral |
| Geometry | 5 | Real Paper.js Boolean curves, ellipse conversion, intersections, rotated nodes and compound paths |
| Server | 10 | Real SQLite migrations, authentication, durable documents, access restrictions, revisions, comments, presence and member revocation |
| Advanced | 15 | Nested groups, page duplication and text links, cycles, mesh interpolation, envelopes, pressure outlines, sanitized SVG dimensions, CRDT convergence/order/undo/identity, Unicode wrapping and actual HarfBuzz Latin/Arabic shaping |
| Sync | 7 | Atomic concurrent commits, exact acknowledgements, session revocation, policy checks, large snapshots, entity identity and Unicode-safe database chunk boundaries |
| Realtime client | 2 | Offline outbox persistence/restoration and safe handling of divergent initial documents |
| UI integration | 4 | Actual app boot, mesh controls, typography controls and page duplication/reordering under Happy DOM |
| WebSocket | 1 | Actual local TCP WebSockets with two editing replicas, text convergence, update acknowledgements, session revocation and hostile-origin rejection |
| Native | 4 | Real CDR fixture parsing, LittleCMS ICC transforms, generated PDF output intents/page boxes and pure process-black preservation through print production |

The UI checks use an emulated DOM and canvas stubs. They exercise application commands and state, but do not establish pixel fidelity or browser rendering performance. Native tests use the included, attributed CC0 CDR fixture and the licensed DejaVu font fixture. CDR test coverage currently includes one source document; it does not establish compatibility with all CDR versions or a corpus of multipage CDR files.

The final suite passed with 65 tests, zero failures and zero skipped tests. The public TypeScript declarations compile with TypeScript 5.9.3 against ES2022 and DOM types without skipping declaration checks. JavaScript syntax was checked for the application modules. The Worker production build completed successfully. The reusable library package is packed independently with declarations, vendor adapters, WASM binaries and notices.

## Spatial-index benchmark

The benchmark creates 10,000 rectangles on a 100 × 100 grid and executes 10,000 point-region queries. A release run in this environment measured:

| Measurement | Result |
|---|---:|
| Objects | 10,000 |
| Index construction | 181.28 ms |
| Point-region queries | 10,000 |
| Total query time | 570.20 ms |
| Average query time | 0.0570 ms |
| Expected / actual total matches | 10,000 / 10,000 |

Run `node tests/benchmark.mjs` to reproduce. These measurements include JavaScript broad-phase index queries and bounds checks. They do not measure browser pointer latency, retained DOM rendering, SVG rasterization, texture upload, WebGPU compositing, companion-page rendering or document-history cost. Results vary by hardware, runtime, scene distribution and warm-up.

## Qualification boundaries

No browser-driven end-to-end or visual test, physical-GPU test, cross-browser matrix, print-device test, independent PDF/X certification, long-running network soak, full accessibility audit or production load test was performed. Native print checks verify the generated structure, selected process-color operators, profiles and page boxes; they do not substitute for an external print-production validator or press proof.

SVG/PDF/PNG/font fidelity has not been qualified across all effects, fonts, scripts and documents. The renderer uses browser SVG rasterization with optional WebGPU texture compositing; this release does not contain a native WebGPU path tessellator. The collaboration suite tests actual concurrent clients and durable commits, but is not an enterprise scalability or availability qualification. See `COMPATIBILITY.md` for detailed functional boundaries.
