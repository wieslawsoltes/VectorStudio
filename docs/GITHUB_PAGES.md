# GitHub Pages edition

The public editor is published at https://wieslawsoltes.github.io/VectorStudio/ . The reusable control demo is under `examples/standalone.html`.

`node scripts/build-pages.mjs` copies the browser modules into `dist/pages`, creates the HTML entry point, makes application/example asset links relative, and explicitly selects the browser storage provider. It does not require a framework, npm installation, database, environment secret or server. GitHub Actions uploads **only** this directory, never the database or server source.

## Storage and capability boundary

In the Pages edition, Save and Open use IndexedDB in the current browser profile. The database is namespaced by the application's URL path so unrelated projects on the same `github.io` origin do not share a project list. Projects, local notes and the latest twenty saved document revisions survive a reload. Revision checks and three-way field merging prevent silent same-field overwrites from concurrent tabs; this is not internet collaboration.

These projects are not uploaded. A Pages URL does not share artwork. Clearing browser site data, private browsing, quota restrictions or browser eviction can remove local work. Keep important work by downloading editable `.vellum` files. Browser-local storage is not a substitute for a backup or authenticated server.

Remote Yjs/WebSocket collaboration, cloud account roles, audit administration, native CDR conversion and native print processing remain in the standalone distribution. Run `node server/local.mjs`; follow `docs/DEPLOYMENT.md` and `native/README.md` for authenticated multi-user hosting and optional native tools. Pages does not proxy to the earlier private hosted site and contains no credentials for it.

The Pages interface labels browser saves explicitly and explains the server-only capabilities rather than claiming that local projects are shared. Browser ICC transforms, SVG editing, file import/export and preflight remain available.

## Validation and publishing

`node --test tests/pages.test.mjs` validates static paths, storage protocol behavior, revision retention, note persistence, conflict protection and failure propagation. The Pages workflow also executes `scripts/test-pages-browser.mjs` in Chromium, exercising real IndexedDB, reload persistence, document commands, native capability disclosure, component isolation and absence of API calls.

The full CI workflow separately installs native dependencies, retrieves the attributed CDR regression fixture, uses a system-provided test font, builds the adapter and runs the complete test suite. Fonts installed in the build environment are not redistributed as repository assets.

The publication workflow uses `contents: read`, `pages: write` and `id-token: write`. It serializes deployment and publishes only after its checks succeed. No npm release is made by publishing Pages. `build-info.json` identifies the built source commit and the edition's capabilities.
