import {
  hydrate,
  splitSnapshot,
  issueSession,
  syncState,
  commitUpdate,
  administration,
  attachSocket,
} from "./sync.js";
import { validateDocument, uid } from "../public/studio/core/index.js";
import { mergeChanges } from "../public/studio/collab/index.js";
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const error = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
async function body(req) {
  if (Number(req.headers.get("content-length")) > 18_000_000)
    error("Request exceeds 18 MB", 413);
  const text = await req.text();
  if (text.length > 18_000_000) error("Request exceeds 18 MB", 413);
  try {
    return JSON.parse(text);
  } catch {
    error("Invalid JSON");
  }
}
export async function handleApi(req, env) {
  try {
    const url = new URL(req.url),
      segments = url.pathname.split("/").filter(Boolean),
      method = req.method;
    const userId = req.headers.get("oai-authenticated-user-id"),
      email = (
        req.headers.get("oai-authenticated-user-email") || ""
      ).toLowerCase();
    if (!userId) return json({ error: "Sign in to use cloud projects" }, 401);
    if (method !== "GET" && method !== "HEAD") {
      const origin = req.headers.get("origin");
      if (origin && origin !== url.origin)
        error("Cross-origin write rejected", 403);
    }
    const db = env.DB?.withSession
      ? env.DB.withSession("first-primary")
      : env.DB;
    if (!db) error("Project storage is unavailable", 503);
    const user = { id: userId, email, name: email.split("@")[0] || "Designer" };
    if (segments[1] === "session") return json(user);
    if (segments[1] === "native")
      return json(
        {
          error:
            "Native CDR and print conversion run in the standalone server. Download the source and run the native setup.",
          cdrImport: false,
          cdrExport: false,
          print: false,
          externalCertification: false,
        },
        segments[2] === "capabilities" ? 200 : 503,
      );
    if (segments[1] !== "projects") return json({ error: "Not found" }, 404);
    const id = segments[2];
    if (!id) {
      if (method === "GET") {
        const rows = await db
          .prepare(
            "SELECT DISTINCT p.id,p.name,p.revision,p.updated,p.owner FROM projects p LEFT JOIN members m ON m.project_id=p.id WHERE p.owner=? OR m.email=? ORDER BY p.updated DESC LIMIT 100",
          )
          .bind(userId, email)
          .all();
        return json({ projects: rows.results });
      }
      if (method === "POST") {
        const b = await body(req);
        validateDocument(b.document);
        if (
          new TextEncoder().encode(JSON.stringify(b.document)).length >
          8_000_000
        )
          error("Document exceeds 8 MB", 413);
        const document = b.document,
          id = uid(),
          now = Date.now();
        document.name = String(document.name || "Untitled artwork").slice(
          0,
          180,
        );
        await db.batch([
          db
            .prepare(
              "INSERT INTO projects(id,owner,name,document,revision,updated) VALUES(?,?,?,?,1,?)",
            )
            .bind(
              id,
              userId,
              document.name,
              JSON.stringify(document).length > 350000
                ? "@snapshot:" + id
                : JSON.stringify(document),
              now,
            ),
          db
            .prepare(
              "INSERT INTO revisions(project_id,revision,document,author,created) VALUES(?,1,?,?,?)",
            )
            .bind(
              id,
              JSON.stringify(document).length > 350000
                ? "@snapshot:" + id
                : JSON.stringify(document),
              email,
              now,
            ),
          ...(JSON.stringify(document).length > 350000
            ? splitSnapshot(JSON.stringify(document)).map((chunk, i) =>
                db
                  .prepare(
                    "INSERT INTO snapshot_chunks(project_id,commit_id,kind,part,payload) VALUES(?,?,'document',?,?)",
                  )
                  .bind(id, id, i, chunk),
              )
            : []),
        ]);
        return json({ id, document, revision: 1, role: "owner" }, 201);
      }
      error("Method not allowed", 405);
    }
    const row = await db
      .prepare("SELECT * FROM projects WHERE id=?")
      .bind(id)
      .first();
    if (!row) error("Project not found", 404);
    let role = row.owner === userId ? "owner" : null;
    if (!role) {
      const m = await db
        .prepare("SELECT role FROM members WHERE project_id=? AND email=?")
        .bind(id, email)
        .first();
      role = m?.role;
    }
    if (!role) error("Project access denied", 403);
    if (
      segments[3] === "socket" &&
      req.headers.get("upgrade")?.toLowerCase() === "websocket"
    ) {
      if (req.headers.get("origin") !== url.origin)
        error("Cross-origin socket rejected", 403);
      if (typeof WebSocketPair === "undefined")
        error("Use the local WebSocket upgrade handler", 400);
      const pair = new WebSocketPair(),
        client = pair[0],
        server = pair[1];
      server.binaryType = "arraybuffer";
      server.accept();
      attachSocket(server, env.DB, id, user);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (segments[3] === "sync") {
      if (method === "GET") {
        const session = await issueSession(db, id, user);
        return json({ ...(await syncState(db, id, user)), ...session });
      }
      if (method === "POST") {
        const b = await body(req);
        if (typeof b.session !== "string" || !b.session)
          error("A collaboration session is required", 401);
        if (b.action === "pull")
          return json(await syncState(db, id, user, b.vector, b.session));
        const result = await commitUpdate(db, id, user, b);
        return json({
          ...result,
          ...(await syncState(db, id, user, b.vector, b.session)),
        });
      }
      error("Method not allowed", 405);
    }
    if (method === "GET") {
      const [p, c] = await Promise.all([
        db
          .prepare(
            "SELECT client_id,name,cursor,page_id,updated FROM presence WHERE project_id=? AND updated>?",
          )
          .bind(id, Date.now() - 15000)
          .all(),
        db
          .prepare(
            "SELECT * FROM comments WHERE project_id=? ORDER BY created DESC LIMIT 300",
          )
          .bind(id)
          .all(),
      ]);
      return json({
        id,
        role,
        name: row.name,
        revision: row.revision,
        ...(Number(url.searchParams.get("since")) === row.revision
          ? {}
          : { document: await hydrate(db, id, row.document) }),
        presence: p.results.map((v) => ({
          ...v,
          cursor: (() => {
            try {
              return JSON.parse(v.cursor);
            } catch {
              return {};
            }
          })(),
        })),
        comments: c.results,
      });
    }
    if (method === "PATCH") {
      if (!["owner", "editor"].includes(role))
        error("Editing requires editor access", 403);
      const b = await body(req);
      if (!Array.isArray(b.changes) || b.changes.length > 25000)
        error("Invalid change batch");
      const result = await commitUpdate(db, id, user, {
        updateId: uid(),
        documentChanges: (current) => {
          const merged = mergeChanges(current, b.changes);
          if (merged.conflicts.length)
            throw Object.assign(new Error("Concurrent edits need review"), {
              status: 409,
              conflicts: merged.conflicts,
            });
          return merged.document;
        },
      });
      return json(result);
    }
    if (method === "POST") {
      const b = await body(req);
      if (["admin", "admin-settings", "revoke-session"].includes(b.action))
        return json(await administration(db, id, user, b.action, b));
      if (b.action === "presence") {
        if (typeof b.clientId !== "string" || b.clientId.length > 100)
          error("Invalid session");
        if (
          !b.cursor ||
          ![b.cursor.x, b.cursor.y].every(
            (v) =>
              typeof v === "number" &&
              Number.isFinite(v) &&
              Math.abs(v) <= 1000000,
          )
        )
          error("Invalid cursor");
        await db
          .prepare(
            "INSERT INTO presence(project_id,client_id,user_id,name,cursor,page_id,updated) VALUES(?,?,?,?,?,?,?) ON CONFLICT(project_id,client_id) DO UPDATE SET cursor=excluded.cursor,page_id=excluded.page_id,updated=excluded.updated WHERE presence.user_id=excluded.user_id",
          )
          .bind(
            id,
            b.clientId,
            userId,
            user.name,
            JSON.stringify({ x: b.cursor.x, y: b.cursor.y }),
            String(b.pageId || ""),
            Date.now(),
          )
          .run();
        return json({ ok: true });
      }
      if (b.action === "comment") {
        if (role === "viewer") error("Commenting requires comment access", 403);
        const text = String(b.body || "").trim();
        if (!text || text.length > 4000)
          error("Comment must contain 1–4000 characters");
        await db
          .prepare(
            "INSERT INTO comments(id,project_id,author,body,page_id,x,y,resolved,created) VALUES(?,?,?,?,?,?,?,0,?)",
          )
          .bind(
            uid(),
            id,
            email,
            text,
            String(b.pageId || ""),
            Math.round(Number(b.x) || 0),
            Math.round(Number(b.y) || 0),
            Date.now(),
          )
          .run();
        return json({ ok: true });
      }
      if (b.action === "resolve") {
        if (role === "viewer") error("Comment access required", 403);
        await db
          .prepare("UPDATE comments SET resolved=? WHERE id=? AND project_id=?")
          .bind(b.resolved ? 1 : 0, String(b.commentId), id)
          .run();
        return json({ ok: true });
      }
      if (b.action === "members") {
        if (role !== "owner")
          error("Only the project owner can manage access", 403);
        return json({
          members: (
            await db
              .prepare("SELECT email,role FROM members WHERE project_id=?")
              .bind(id)
              .all()
          ).results,
        });
      }
      if (b.action === "share") {
        if (role !== "owner")
          error("Only the project owner can manage access", 403);
        const address = String(b.email || "")
          .trim()
          .toLowerCase();
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ||
          address.length > 250 ||
          !["editor", "commenter", "viewer"].includes(b.role)
        )
          error("Valid email and role required");
        await db
          .prepare(
            "INSERT INTO members(project_id,email,role) VALUES(?,?,?) ON CONFLICT(project_id,email) DO UPDATE SET role=excluded.role",
          )
          .bind(id, address, b.role)
          .run();
        return json({ ok: true });
      }
      if (b.action === "unshare") {
        if (role !== "owner") error("Only the owner can revoke access", 403);
        await db.batch([
          db
            .prepare("DELETE FROM members WHERE project_id=? AND email=?")
            .bind(id, String(b.email).toLowerCase()),
          db
            .prepare(
              "UPDATE sync_sessions SET revoked=1 WHERE project_id=? AND email=?",
            )
            .bind(id, String(b.email).toLowerCase()),
          db
            .prepare(
              "INSERT INTO project_audit(id,project_id,actor,action,details,created) VALUES(?,?,?,?,?,?)",
            )
            .bind(
              uid(),
              id,
              email,
              "member.revoked",
              String(b.email).toLowerCase(),
              Date.now(),
            ),
        ]);
        return json({ ok: true });
      }
      if (b.action === "revisions")
        return json({
          revisions: (
            await db
              .prepare(
                "SELECT revision,author,created FROM revisions WHERE project_id=? ORDER BY revision DESC LIMIT 40",
              )
              .bind(id)
              .all()
          ).results,
        });
      if (b.action === "revision") {
        const rev = await db
          .prepare(
            "SELECT document,revision FROM revisions WHERE project_id=? AND revision=?",
          )
          .bind(id, Number(b.revision))
          .first();
        if (!rev) error("Revision not found", 404);
        return json({
          document: await hydrate(db, id, rev.document),
          revision: rev.revision,
        });
      }
      error("Unknown action");
    }
    error("Method not allowed", 405);
  } catch (e) {
    if (!e.status) console.error("Project API:", e.message);
    return json(
      {
        error: e.status
          ? e.message
          : e.message?.startsWith("Invalid")
            ? e.message
            : "Project operation failed",
        ...(e.conflicts ? { conflicts: e.conflicts } : {}),
      },
      e.status || 400,
    );
  }
}
