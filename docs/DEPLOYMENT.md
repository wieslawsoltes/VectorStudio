# Running and deploying

## Immediate local app

```sh
node server/local.mjs
```

Open `http://127.0.0.1:3000`. Node 22.13+ is required for the built-in SQLite adapter; Node 24 was used during validation. Browser modules and geometry/font/PDF bundles are included, so no package installation is required for this local runtime.

The database lives at `data/vellum.sqlite`. Schema migrations are read from `drizzle/` and applied once into `_vellum_migrations`. Back up the SQLite database together with its WAL/SHM files using SQLite's backup facilities or while the server is stopped. The repository excludes local database files from Git.

`VELLUM_DATABASE_PATH` chooses an explicit SQLite path. `PORT` changes the listening port. The default `HOST` is loopback. The server assigns a local development identity and is single-user by design.

## Self-hosted multi-user mode

An authenticated reverse proxy must verify users, strip any incoming `oai-authenticated-user-*` headers and inject the stable verified user ID and verified email. It must be the only network path to the Vellum backend. Then run, for example:

```sh
HOST=0.0.0.0 VELLUM_TRUST_PROXY=1 VELLUM_PUBLIC_ORIGIN=https://design.example.com PORT=3000 node server/local.mjs
```

Do not set proxy-trust mode without a correctly configured authenticator and firewall. The application does not provide password registration, OAuth or user provisioning. Use HTTPS for deployed clients and WebGPU availability. Set `VELLUM_PUBLIC_ORIGIN` to the exact public HTTPS origin. When that setting is absent, trusted-proxy mode accepts `X-Forwarded-Proto: https`; the proxy must overwrite this header. Forward WebSocket Upgrade/Connection headers and keep idle connections alive. API, native endpoints and sockets compare against the same effective origin.

Node SQLite operations are synchronous. This server suits local use and modest deployments; clustered high-concurrency hosting and operational backups require further qualification. Its D1-compatible API boundary permits an alternative persistence host.

## Managed hosted distribution

The included hosting adapter exposes `/` and `/api/:path+` as Worker routes. `/` serves the same plain HTML shell and static JavaScript modules as the local app. `app/api/[...path]/route.ts` delegates directly to `server/api.js` with the platform database binding.

In the managed Site checkout, `.openai/hosting.json` records the site's opaque identity and a logical `DB` binding. The platform owns the physical D1 resource, runtime identity gateway, source repository and publication process. The portable source ZIP omits this site-specific identity file. Drizzle migrations are included in the deployment archive. Once applied, migration history must be treated as immutable; future schema updates append new migrations.

The hosted site is initially private. Project membership does not independently make the site accessible. A teammate requires both the site's access policy and a project role.

## Library distribution

The root repository is an application workspace. `packages/vector/package.json` is the independently publishable library manifest. Preparing and packing it copies only reusable modules, browser adapter bundles, declarations and license material.

```sh
node scripts/package-libraries.mjs
cd packages/vector
npm pack
```

Use the resulting `.tgz` with `npm install /path/to/package.tgz` in another project. The included manual npm workflow is a starting point for an npm account/scope you control. It has not been executed against an npm registry for this delivery.

## Source archive

The full source archive contains the application, standalone server, browser bundles, reusable package source and packed tarball, example, tests, migrations, documentation and CI definitions. It excludes credentials, databases, node_modules, platform caches and temporary deployment archives. Install locked dependencies only when rebuilding vendor bundles, running DOM integration tests or building the Worker distribution.

## Native conversion

See `native/README.md` for libcdr, Inkscape, Ghostscript and Python prerequisites. CDR/print capabilities are probed by the standalone server. Native endpoints are unavailable on the managed Worker because it cannot execute those system programs. The hosted browser still supports ICC transforms, vector editing, standard exports and preflight.

## Storage and collaboration limits

Apply migration `0001_short_the_call.sql` after the existing initial migration. It adds chunked snapshots, exact update receipts, collaboration sessions, audit records and project policy fields. Do not rewrite applied migrations.

Snapshot payloads are split below D1 row limits and inserts are grouped below the bound-parameter limit. The hosted WebSocket protocol uses D1-backed pulse synchronization across isolates. Same-isolate notifications are an optimization. Operations and quotas have been tested locally with SQLite; no hosted load/soak qualification or production SLA is implied.

Five-minute application sessions must be renewed through authenticated HTTP. Project role revocation is checked on subsequent socket messages/pulses and again at SQL commit. An identity gateway's logout propagation requires host-specific integration for a shorter bound.

## GitHub Pages

See [GITHUB_PAGES.md](GITHUB_PAGES.md) for the static build, browser-local persistence and the explicit separation from server-only services.
