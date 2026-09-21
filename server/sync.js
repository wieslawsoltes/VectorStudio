/** One durable authorization/CAS path for HTTP and WebSocket collaboration. */
import {
  Y,
  createReplica,
  applyDocumentChanges,
  materializeDocument,
  validateReplica,
  encodeState,
  encode64,
  decode64,
} from "../public/studio/collab/crdt.js";
import { uid, validateDocument } from "../public/studio/core/index.js";
export const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export async function access(db, id, user) {
  const row = await db
    .prepare("SELECT * FROM projects WHERE id=?")
    .bind(id)
    .first();
  if (!row) fail("Project not found", 404);
  const role =
    row.owner === user.id
      ? "owner"
      : (
          await db
            .prepare("SELECT role FROM members WHERE project_id=? AND email=?")
            .bind(id, user.email)
            .first()
        )?.role;
  if (!role) fail("Project access denied", 403);
  return { row, role };
}
export const splitSnapshot = (s) => {
  const out = [];
  for (let i = 0; i < s.length;) {
    let end = Math.min(i + 350000, s.length);
    if (end < s.length && /[\uD800-\uDBFF]/.test(s[end - 1])) end--;
    out.push(s.slice(i, end));
    i = end;
  }
  return out;
};
export async function hydrate(db, id, value, kind = "document") {
  if (!value?.startsWith("@snapshot:"))
    return kind === "document" ? JSON.parse(value) : null;
  const commit = value.slice(10),
    r = await db
      .prepare(
        "SELECT part,payload FROM snapshot_chunks WHERE project_id=? AND commit_id=? AND kind=? ORDER BY part",
      )
      .bind(id, commit, kind)
      .all();
  if (!r.results.length || r.results.some((v, i) => v.part !== i))
    fail("Incomplete document snapshot", 500);
  const s = r.results.map((v) => v.payload).join("");
  return kind === "document" ? JSON.parse(s) : decode64(s);
}
function chunkStatements(db, id, commit, kind, text) {
  const parts = splitSnapshot(text),
    statements = [];
  for (let start = 0; start < parts.length; start += 10) {
    const batch = parts.slice(start, start + 10),
      sql =
        "INSERT INTO snapshot_chunks(project_id,commit_id,kind,part,payload) " +
        batch
          .map(
            () =>
              "SELECT id,?,?,?,? FROM projects WHERE id=? AND sync_commit=?",
          )
          .join(" UNION ALL "),
      args = batch.flatMap((part, i) => [
        commit,
        kind,
        start + i,
        part,
        id,
        commit,
      ]);
    statements.push(db.prepare(sql).bind(...args));
  }
  return statements;
}
export async function loadReplica(db, id, user) {
  for (let i = 0; i < 5; i++) {
    const { row, role } = await access(db, id, user);
    if (row.sync_commit) {
      const bytes = await hydrate(
          db,
          id,
          "@snapshot:" + row.sync_commit,
          "yjs",
        ),
        replica = createReplica();
      Y.applyUpdate(replica, bytes);
      return { row, role, replica };
    }
    const document = await hydrate(db, id, row.document),
      replica = createReplica(document),
      commit = uid();
    const r = await db.batch([
      db
        .prepare(
          "UPDATE projects SET sync_commit=?,document=? WHERE id=? AND revision=? AND sync_commit IS NULL",
        )
        .bind(commit, "@snapshot:" + commit, id, row.revision),
      ...chunkStatements(db, id, commit, "document", JSON.stringify(document)),
      ...chunkStatements(db, id, commit, "yjs", encode64(encodeState(replica))),
      db
        .prepare(
          "UPDATE revisions SET document=? WHERE project_id=? AND revision=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND sync_commit=?)",
        )
        .bind("@snapshot:" + commit, id, row.revision, id, commit),
    ]);
    replica.destroy();
    if (r[0].meta.changes) continue;
  }
  fail("Project is busy; reconnect", 503);
}
export async function issueSession(db, id, user) {
  await access(db, id, user);
  const session = uid(),
    expires = Date.now() + 300000;
  await db
    .prepare(
      "INSERT INTO sync_sessions(id,project_id,user_id,email,expires) VALUES(?,?,?,?,?)",
    )
    .bind(session, id, user.id, user.email, expires)
    .run();
  await db
    .prepare("DELETE FROM sync_sessions WHERE expires<?")
    .bind(Date.now() - 3600000)
    .run();
  return { session, expires };
}
export async function checkSession(db, id, user, session) {
  const s = await db
    .prepare(
      "SELECT id FROM sync_sessions WHERE id=? AND project_id=? AND user_id=? AND revoked=0 AND expires>?",
    )
    .bind(session, id, user.id, Date.now())
    .first();
  if (!s) fail("Collaboration session expired or revoked", 401);
  return access(db, id, user);
}
export async function syncState(db, id, user, vector, session) {
  if (session) await checkSession(db, id, user, session);
  const { row, role, replica } = await loadReplica(db, id, user);
  try {
    return {
      revision: row.revision,
      role,
      archived: !!row.archived,
      update: encode64(
        Y.encodeStateAsUpdate(replica, vector ? decode64(vector) : undefined),
      ),
      vector: encode64(Y.encodeStateVector(replica)),
    };
  } finally {
    replica.destroy();
  }
}
export async function commitUpdate(
  db,
  id,
  user,
  { update, updateId, session, documentChanges },
) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(updateId || ""))
    fail("Invalid update identifier");
  if (session) await checkSession(db, id, user, session);
  const bytes = update ? decode64(update) : null;
  if (bytes?.length > 12_000_000) fail("Update exceeds 12 MB", 413);
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        bytes || new TextEncoder().encode(JSON.stringify(documentChanges)),
      ),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  for (let retry = 0; retry < 6; retry++) {
    const { row, role, replica } = await loadReplica(db, id, user);
    try {
      if (!["owner", "editor"].includes(role) || row.archived)
        fail("Editing is locked or editor access was revoked", 403);
      const receipt = await db
        .prepare(
          "SELECT hash,revision FROM update_receipts WHERE project_id=? AND actor=? AND update_id=?",
        )
        .bind(id, user.id, updateId)
        .first();
      if (receipt) {
        if (receipt.hash !== hash)
          fail("Update identifier reused with different content", 409);
        return { updateId, revision: receipt.revision, duplicate: true };
      }
      const before = materializeDocument(replica);
      if (bytes) Y.applyUpdate(replica, bytes);
      else {
        const after = await documentChanges(structuredClone(before));
        applyDocumentChanges(replica, before, after);
      }
      const document = validateReplica(replica);
      if (
        document.id !== before.id ||
        document.format !== before.format ||
        document.version !== before.version
      )
        fail("Document identity cannot change");
      const text = JSON.stringify(document),
        state = encode64(encodeState(replica));
      if (new TextEncoder().encode(text).length > 8_000_000)
        fail("Document exceeds 8 MB", 413);
      const commit = uid(),
        revision = row.revision + 1,
        now = Date.now(),
        ref = "@snapshot:" + commit;
      const sql = `UPDATE projects SET name=?,document=?,sync_commit=?,revision=?,updated=? WHERE id=? AND revision=? AND archived=0 AND (owner=? OR EXISTS(SELECT 1 FROM members WHERE project_id=projects.id AND email=? AND role='editor')) ${session ? "AND EXISTS(SELECT 1 FROM sync_sessions WHERE id=? AND project_id=projects.id AND user_id=? AND expires>? AND revoked=0)" : ""}`;
      const args = [
        document.name,
        ref,
        commit,
        revision,
        now,
        id,
        row.revision,
        user.id,
        user.email,
        ...(session ? [session, user.id, now] : []),
      ];
      const statements = [
        db.prepare(sql).bind(...args),
        ...chunkStatements(db, id, commit, "document", text),
        ...chunkStatements(db, id, commit, "yjs", state),
        db
          .prepare(
            "INSERT INTO revisions(project_id,revision,document,author,created) SELECT id,revision,document,?,updated FROM projects WHERE id=? AND sync_commit=?",
          )
          .bind(user.email, id, commit),
        db
          .prepare(
            "INSERT INTO update_receipts(project_id,actor,update_id,hash,revision,created) SELECT id,?,?,?,revision,? FROM projects WHERE id=? AND sync_commit=?",
          )
          .bind(user.id, updateId, hash, now, id, commit),
        db
          .prepare(
            "INSERT INTO project_audit(id,project_id,actor,action,details,created) SELECT ?,id,?,'document.update',?,? FROM projects WHERE id=? AND sync_commit=?",
          )
          .bind(
            uid(),
            user.email,
            JSON.stringify({ revision, updateId }),
            now,
            id,
            commit,
          ),
      ];
      const result = await db.batch(statements);
      if (result[0].meta.changes) {
        await db
          .prepare("DELETE FROM revisions WHERE project_id=? AND revision<?")
          .bind(id, revision - row.retention + 1)
          .run();
        await db
          .prepare(
            "DELETE FROM snapshot_chunks WHERE project_id=? AND commit_id NOT IN (SELECT sync_commit FROM projects WHERE id=?) AND '@snapshot:'||commit_id NOT IN (SELECT document FROM revisions WHERE project_id=?)",
          )
          .bind(id, id, id)
          .run();
        return { updateId, revision, document };
      }
    } finally {
      replica.destroy();
    }
  }
  fail("Project is busy; retry update", 503);
}
export async function administration(db, id, user, action, data = {}) {
  const { row, role } = await access(db, id, user);
  if (role !== "owner")
    fail("Only the project owner can administer this project", 403);
  if (action === "admin")
    return {
      archived: !!row.archived,
      retention: row.retention,
      sessions: (
        await db
          .prepare(
            "SELECT id,email,expires,revoked FROM sync_sessions WHERE project_id=? AND expires>? ORDER BY expires DESC LIMIT 200",
          )
          .bind(id, Date.now())
          .all()
      ).results,
      audit: (
        await db
          .prepare(
            "SELECT actor,action,details,created FROM project_audit WHERE project_id=? ORDER BY created DESC LIMIT 500",
          )
          .bind(id)
          .all()
      ).results,
    };
  let statement;
  if (action === "admin-settings") {
    const retention = Number(data.retention);
    if (!Number.isInteger(retention) || retention < 5 || retention > 100)
      fail("Retain 5–100 revisions");
    statement = db
      .prepare(
        "UPDATE projects SET archived=?,retention=? WHERE id=? AND owner=?",
      )
      .bind(data.archived ? 1 : 0, retention, id, user.id);
  } else if (action === "revoke-session")
    statement = db
      .prepare("UPDATE sync_sessions SET revoked=1 WHERE project_id=? AND id=?")
      .bind(id, String(data.sessionId));
  else fail("Unknown administration action");
  await db.batch([
    statement,
    db
      .prepare(
        "INSERT INTO project_audit(id,project_id,actor,action,details,created) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        uid(),
        id,
        user.email,
        action,
        JSON.stringify({
          sessionId: data.sessionId,
          archived: !!data.archived,
          retention: data.retention,
        }),
        Date.now(),
      ),
  ]);
  return { ok: true };
}
const rooms = new Map();
export function attachSocket(socket, db, id, user) {
  let chain = Promise.resolve(),
    session,
    closed = false,
    queuedBytes = 0,
    queuedMessages = 0;
  const room = rooms.get(id) || new Set();
  rooms.set(id, room);
  room.add(socket);
  const cleanup = () => {
    closed = true;
    room.delete(socket);
    if (!room.size) rooms.delete(id);
  };
  const send = (value) => {
    if (closed) return;
    if ((socket.bufferedAmount || 0) > 24_000_000) {
      socket.close(1013, "Backpressure");
      closed = true;
      return;
    }
    socket.send(JSON.stringify(value));
  };
  const onMessage = (raw) => {
    const size = typeof raw === "string" ? raw.length : raw.byteLength;
    if (
      size > 18000000 ||
      queuedBytes + size > 24000000 ||
      queuedMessages >= 8
    ) {
      socket.close(1013, "Incoming queue limit");
      closed = true;
      return;
    }
    queuedBytes += size;
    queuedMessages++;
    chain = chain
      .then(async () => {
        if (closed) return;
        const database = db.withSession ? db.withSession("first-primary") : db;
        const data =
          typeof raw === "string"
            ? raw
            : new TextDecoder().decode(
                raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw,
              );
        if (data.length > 18_000_000) fail("Frame too large", 413);
        const message = JSON.parse(data);
        if (message.protocol !== 1) fail("Unsupported collaboration protocol");
        if (message.type === "hello") {
          session = message.session;
          await checkSession(database, id, user, session);
        } else if (!session) fail("Send hello first", 401);
        if (message.type === "update") {
          const result = await commitUpdate(database, id, user, {
            ...message,
            session,
          });
          send({
            type: "ack",
            updateId: result.updateId,
            revision: result.revision,
          });
          for (const peer of room)
            if (peer !== socket && peer.readyState === 1)
              try {
                peer.send(JSON.stringify({ type: "dirty" }));
              } catch {}
        }
        if (!["hello", "pulse", "update"].includes(message.type))
          fail("Unknown socket message");
        const result = await syncState(
          database,
          id,
          user,
          message.vector,
          session,
        );
        send({ type: "sync", ...result });
      })
      .catch((e) => {
        send({ type: "error", error: e.message, status: e.status || 400 });
        if ([401, 403].includes(e.status)) {
          socket.close(1008, "Access expired");
          closed = true;
        }
      })
      .finally(() => {
        queuedBytes -= size;
        queuedMessages--;
      });
  };
  if (socket.addEventListener) {
    socket.addEventListener("message", (e) => onMessage(e.data));
    socket.addEventListener("close", cleanup);
    socket.addEventListener("error", cleanup);
  } else {
    socket.on("message", onMessage);
    socket.on("close", cleanup);
    socket.on("error", cleanup);
  }
  return socket;
}
