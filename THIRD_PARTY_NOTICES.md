# Third-party notices

The Vellum application and original modules are MIT licensed. Third-party code retains its own notices. Browser geometry, font, PDF, color and collaboration bundles and the local WebSocket adapter include the following packages; full available notices are in `licenses/` and legal comments are retained in the bundles. The hosting scaffold has additional dependencies recorded in the lockfile.

| Package | Bundled version | License |
|---|---|---|
| @babel/runtime | 7.29.7 | MIT |
| @xmldom/xmldom | 0.9.12 | MIT |
| acorn | 8.16.0 | MIT |
| base64-js | 0.0.8 | MIT |
| bidi-js | 1.1.0 | MIT |
| canvg | 3.0.11 | MIT |
| core-js | 3.50.0 | MIT |
| cssesc | 3.0.0 | MIT |
| dompurify | 3.4.15 | (MPL-2.0 OR Apache-2.0) |
| fast-png | 6.4.0 | MIT |
| fflate | 0.8.3 | MIT |
| font-family-papandreou | 0.2.0-patch2 | MIT |
| harfbuzzjs | 1.6.1 | MIT |
| html2canvas | 1.4.1 | MIT |
| iobuffer | 5.4.0 | MIT |
| jspdf | 4.2.1 | MIT |
| lcms-wasm | 1.0.5 | MIT |
| lib0 | 0.2.117 | MIT |
| linebreak | 1.1.0 | MIT |
| opentype.js | 2.0.0 | MIT |
| pako | 2.2.0 | (MIT AND Zlib) |
| paper | 0.12.18 | MIT |
| performance-now | 2.1.0 | MIT |
| raf | 3.4.1 | MIT |
| rgbcolor | 1.0.1 | MIT OR SEE LICENSE IN FEEL-FREE.md |
| specificity | 0.4.1 | MIT |
| stackblur-canvas | 2.7.0 | MIT |
| svg-pathdata | 6.0.3 | MIT |
| svg2pdf.js | 2.8.1 | MIT |
| svgpath | 2.6.0 | MIT |
| tiny-inflate | 1.0.3 | MIT |
| unicode-trie | 2.0.0 | MIT |
| ws | 8.21.3 | MIT |
| yjs | 13.6.32 | MIT |

The copied WASM modules also include the following underlying libraries and data; their separate license texts are included in `licenses/`.

| Component | Bundled revision | License file |
|---|---|---|
| HarfBuzz 14.4.0 | 36cb489cb02ce4b92099669ba9f9bea348eff93f | harfbuzz-COPYING.txt (Old MIT) |
| LittleCMS 2.16 | c2a54017d73080f97c5cd34a78ff2fb51564aade | littlecms-LICENSE.txt (MIT) |
| Microsoft USE shaping data | HarfBuzz revision above | harfbuzz-ms-use-COPYING.txt (MIT) |
| Unicode character data | Unicode 17 shaping tables | unicode-LICENSE.txt (Unicode License V3) |

The wrapper licenses for harfbuzzjs and lcms-wasm apply separately. These upstream notices are retained as release source files; the collector does not overwrite them.

Paper.js provides curve Boolean geometry. jsPDF and svg2pdf.js provide PDF serialization. OpenType.js provides font parsing and outlines. Vellum does not claim authorship of these engines.
