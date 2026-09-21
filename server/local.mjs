import { handleNative } from "./native.js";
import ws from "./vendor/ws.cjs";
import { access, attachSocket } from "./sync.js";
/** Standalone development/local deployment. Node >=22.13. No framework dependency. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { shell } from "../public/studio/shell.js";
import { handleApi } from "./api.js";
import { openDatabase } from "./sqlite.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  DB = openDatabase(
    process.env.VELLUM_DATABASE_PATH || resolve(root, "data/vellum.sqlite"),
    resolve(root, "drizzle"),
  );
const port = Number(process.env.PORT || 3000),
  host = process.env.HOST || "127.0.0.1";
if (
  host !== "127.0.0.1" &&
  host !== "localhost" &&
  process.env.VELLUM_TRUST_PROXY !== "1"
)
  throw new Error(
    "Network binding requires an authenticated reverse proxy and VELLUM_TRUST_PROXY=1. See docs/DEPLOYMENT.md.",
  );
const requestOrigin = (req) => {
  if (process.env.VELLUM_PUBLIC_ORIGIN) {
    const u = new URL(process.env.VELLUM_PUBLIC_ORIGIN);
    if (!["http:", "https:"].includes(u.protocol))
      throw new Error("Invalid public origin");
    return u.origin;
  }
  const forwarded =
    process.env.VELLUM_TRUST_PROXY === "1"
      ? String(req.headers["x-forwarded-proto"] || "")
          .split(",")[0]
          .trim()
      : "";
  return `${forwarded === "https" ? "https" : "http"}://${req.headers.host}`;
};
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".tgz": "application/gzip",
  ".wasm": "application/wasm",
  ".mjs": "text/javascript",
};
const server = createServer(async (req, res) => {
  try {
    const origin = requestOrigin(req),
      url = new URL(req.url, origin),
      headers = new Headers();
    for (const [k, v] of Object.entries(req.headers))
      if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(",") : v);
    if (process.env.VELLUM_TRUST_PROXY !== "1") {
      headers.set("oai-authenticated-user-id", "local-designer");
      headers.set("oai-authenticated-user-email", "designer@localhost.test");
    }
    if (url.pathname.startsWith("/api/")) {
      let size = 0,
        chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 18_000_000) {
          res.writeHead(413);
          res.end("Payload too large");
          return;
        }
        chunks.push(chunk);
      }
      const request = new Request(url, {
        method: req.method,
        headers,
        ...(["GET", "HEAD"].includes(req.method)
          ? {}
          : { body: Buffer.concat(chunks) }),
      });
      if (
        url.pathname.startsWith("/api/native/") &&
        !headers.get("oai-authenticated-user-id")
      ) {
        res.writeHead(401);
        res.end("Authentication required");
        return;
      }
      const response = url.pathname.startsWith("/api/native/")
        ? await handleNative(request)
        : await handleApi(request, { DB });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (url.pathname === "/") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(shell);
      return;
    }
    const path = resolve(
      root,
      "public",
      "." + decodeURIComponent(url.pathname),
    );
    if (!path.startsWith(resolve(root, "public") + "/")) {
      res.writeHead(403);
      res.end();
      return;
    }
    const bytes = await readFile(path);
    res.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    });
    res.end(bytes);
  } catch (e) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});
const wss = new ws.WebSocketServer({
  noServer: true,
  perMessageDeflate: false,
  maxPayload: 18000000,
});
server.on("upgrade", async (req, socket, head) => {
  try {
    const url = new URL(req.url, requestOrigin(req)),
      match = url.pathname.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)\/socket$/);
    if (!match || req.headers.origin !== url.origin)
      throw new Error("Invalid socket origin");
    const user =
      process.env.VELLUM_TRUST_PROXY === "1"
        ? {
            id: req.headers["oai-authenticated-user-id"],
            email: (
              req.headers["oai-authenticated-user-email"] || ""
            ).toLowerCase(),
          }
        : { id: "local-designer", email: "designer@localhost.test" };
    if (!user.id) throw new Error("Authentication required");
    await access(DB, match[1], user);
    wss.handleUpgrade(req, socket, head, (peer) =>
      attachSocket(peer, DB, match[1], user),
    );
  } catch {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
  }
});
server.listen(port, host, () =>
  console.log(
    `Vellum Vector Studio: http://${host}:${server.address().port}\nData: data/vellum.sqlite\n${process.env.VELLUM_TRUST_PROXY === "1" ? "Authenticated proxy mode" : "Local single-user mode"}`,
  ),
);
process.on("SIGINT", () =>
  server.close(() => {
    DB.close();
    process.exit(0);
  }),
);
