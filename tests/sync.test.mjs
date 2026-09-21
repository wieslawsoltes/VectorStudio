import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/sqlite.js";
import { handleApi } from "../server/api.js";
import {
  issueSession,
  syncState,
  commitUpdate,
  access,
  administration,
  hydrate,
} from "../server/sync.js";
import { createDocument, createNode } from "../public/studio/core/index.js";
import {
  Y,
  createReplica,
  applyDocumentChanges,
  materializeDocument,
  encode64,
  decode64,
} from "../public/studio/collab/crdt.js";
const db = openDatabase(":memory:", "drizzle"),
  owner = { id: "owner", email: "owner@example.com" },
  editor = { id: "editor", email: "editor@example.com" };
async function setup() {
  const d = createDocument();
  d.nodes.push(createNode("text", { pageId: d.pages[0].id, text: "abc" }));
  const r = await handleApi(
    new Request("https://test/api/projects", {
      method: "POST",
      headers: {
        "oai-authenticated-user-id": owner.id,
        "oai-authenticated-user-email": owner.email,
        "content-type": "application/json",
      },
      body: JSON.stringify({ document: d }),
    }),
    { DB: db },
  );
  const p = await r.json();
  await db
    .prepare("INSERT INTO members(project_id,email,role) VALUES(?,?,?)")
    .bind(p.id, editor.email, "editor")
    .run();
  return { ...p };
}
async function client(id, user) {
  const state = await syncState(db, id, user),
    session = await issueSession(db, id, user),
    replica = createReplica();
  Y.applyUpdate(replica, decode64(state.update));
  return {
    replica,
    session: session.session,
    base: materializeDocument(replica),
  };
}
function update(c, change) {
  const after = structuredClone(c.base);
  change(after);
  const vector = Y.encodeStateVector(c.replica);
  applyDocumentChanges(c.replica, c.base, after);
  return {
    updateId: crypto.randomUUID(),
    session: c.session,
    update: encode64(Y.encodeStateAsUpdate(c.replica, vector)),
  };
}
test("concurrent server commits preserve different fields after CAS retry", async () => {
  const p = await setup(),
    a = await client(p.id, owner),
    b = await client(p.id, editor),
    ua = update(a, (d) => (d.nodes[0].x = 123)),
    ub = update(b, (d) => (d.nodes[0].y = 456));
  await Promise.all([
    commitUpdate(db, p.id, owner, ua),
    commitUpdate(db, p.id, editor, ub),
  ]);
  const r = await client(p.id, owner);
  assert.equal(r.base.nodes[0].x, 123);
  assert.equal(r.base.nodes[0].y, 456);
});
test("acknowledgment receipt makes retries durable and rejects changed bytes", async () => {
  const p = await setup(),
    c = await client(p.id, owner),
    u = update(c, (d) => (d.nodes[0].text = "abcd")),
    a = await commitUpdate(db, p.id, owner, u),
    b = await commitUpdate(db, p.id, owner, u);
  assert.equal(a.revision, b.revision);
  assert.equal(b.duplicate, true);
  await assert.rejects(
    commitUpdate(db, p.id, owner, {
      ...u,
      update: encode64(Y.encodeStateAsUpdate(createReplica(c.base))),
    }),
    /reused/,
  );
});
test("revoked role and session block existing clients", async () => {
  const p = await setup(),
    c = await client(p.id, editor),
    u = update(c, (d) => (d.nodes[0].x = 99));
  for (const body of [{ action: "pull" }, { ...u, session: undefined }]) {
    const response = await handleApi(
      new Request(`https://test/api/projects/${p.id}/sync`, {
        method: "POST",
        headers: {
          "oai-authenticated-user-id": editor.id,
          "oai-authenticated-user-email": editor.email,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      { DB: db },
    );
    assert.equal(
      response.status,
      401,
      "HTTP synchronization must not bypass application sessions",
    );
  }

  await db
    .prepare("UPDATE members SET role=? WHERE project_id=? AND email=?")
    .bind("viewer", p.id, editor.email)
    .run();
  await assert.rejects(commitUpdate(db, p.id, editor, u), /revoked/);
  await administration(db, p.id, owner, "revoke-session", {
    sessionId: c.session,
  });
  await assert.rejects(
    syncState(db, p.id, editor, null, c.session),
    /expired or revoked/,
  );
});
test("archived project rejects edits and owner can resume editing", async () => {
  const p = await setup(),
    c = await client(p.id, owner),
    u = update(c, (d) => (d.name = "New name"));
  await administration(db, p.id, owner, "admin-settings", {
    archived: true,
    retention: 10,
  });
  await assert.rejects(commitUpdate(db, p.id, owner, u), /locked/);
  await administration(db, p.id, owner, "admin-settings", {
    archived: false,
    retention: 10,
  });
  await commitUpdate(db, p.id, owner, u);
  assert.equal((await client(p.id, owner)).base.name, "New name");
});
test("large snapshots are chunked below D1 row limits and revisions hydrate", async () => {
  const p = await setup(),
    c = await client(p.id, owner),
    u = update(c, (d) => {
      for (let i = 0; i < 30; i++)
        d.nodes.push(
          createNode("text", {
            pageId: d.pages[0].id,
            text: "z".repeat(80000),
          }),
        );
    });
  await commitUpdate(db, p.id, owner, u);
  const row = (await access(db, p.id, owner)).row;
  assert.ok(row.document.startsWith("@snapshot:"));
  const chunks = (
    await db
      .prepare("SELECT payload FROM snapshot_chunks WHERE project_id=?")
      .bind(p.id)
      .all()
  ).results;
  assert.ok(chunks.length > 6);
  assert.ok(
    chunks.every((v) => new TextEncoder().encode(v.payload).length < 1500000),
  );
  const document = await hydrate(db, p.id, row.document);
  assert.equal(document.nodes.length, 31);
});
test("malformed or identity-changing updates cannot poison accepted state", async () => {
  const p = await setup(),
    c = await client(p.id, owner),
    before = await syncState(db, p.id, owner);
  c.replica.getMap("identity").set("value", { ...c.base, id: "forged" });
  await assert.rejects(
    commitUpdate(db, p.id, owner, {
      updateId: crypto.randomUUID(),
      session: c.session,
      update: encode64(Y.encodeStateAsUpdate(c.replica)),
    }),
    /identity/,
  );
  const after = await syncState(db, p.id, owner);
  assert.equal(before.revision, after.revision);
});
test.after(() => db.close());
test("Unicode snapshot chunk boundaries preserve supplementary characters", async () => {
  const { splitSnapshot } = await import("../server/sync.js"),
    text = "a".repeat(349999) + "😀" + "tail";
  const chunks = splitSnapshot(text);
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every((c) => !/[\uD800-\uDBFF]$/.test(c)));
});
