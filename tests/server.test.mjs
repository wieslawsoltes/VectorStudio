import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { handleApi } from "../server/api.js";
import { openDatabase } from "../server/sqlite.js";
import { createDocument, createNode } from "../public/studio/core/index.js";
import { diffDocument } from "../public/studio/collab/index.js";
const DB = openDatabase(":memory:", resolve("drizzle"));
const call = async (
  path,
  method = "GET",
  payload,
  user = "owner",
  origin = "http://localhost",
) => {
  const headers = { "content-type": "application/json", origin };
  if (user) {
    headers["oai-authenticated-user-id"] = user;
    headers["oai-authenticated-user-email"] = user + "@example.com";
  }
  const r = await handleApi(
    new Request("http://localhost/api" + path, {
      method,
      headers,
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    }),
    { DB },
  );
  return { status: r.status, body: await r.json() };
};
let id, base;
test("API requires authentication", async () =>
  assert.equal((await call("/projects", "GET", null, null)).status, 401));
test("create durable project", async () => {
  base = createDocument("API test");
  base.nodes.push(createNode("rect", { pageId: base.pages[0].id }));
  const r = await call("/projects", "POST", { document: base });
  assert.equal(r.status, 201);
  id = r.body.id;
  assert.equal((await call("/projects/" + id)).body.document.name, "API test");
});
test("other accounts cannot read project", async () =>
  assert.equal(
    (await call("/projects/" + id, "GET", null, "stranger")).status,
    403,
  ));
test("reject cross-origin writes", async () =>
  assert.equal(
    (
      await call(
        "/projects/" + id,
        "POST",
        { action: "presence" },
        "owner",
        "https://evil.example",
      )
    ).status,
    403,
  ));
test("share grants viewer read but denies edit", async () => {
  assert.equal(
    (
      await call("/projects/" + id, "POST", {
        action: "share",
        email: "viewer@example.com",
        role: "viewer",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/projects/" + id, "GET", null, "viewer")).status,
    200,
  );
  assert.equal(
    (await call("/projects/" + id, "PATCH", { changes: [] }, "viewer")).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/projects/" + id,
        "POST",
        { action: "comment", body: "x" },
        "viewer",
      )
    ).status,
    403,
  );
});
test("field-level collaboration, conflict response, revisions", async () => {
  const a = structuredClone(base),
    b = structuredClone(base);
  a.nodes[0].x = 80;
  b.nodes[0].fill = "#ff0000";
  const first = await call("/projects/" + id, "PATCH", {
    changes: diffDocument(base, a),
  });
  assert.equal(first.status, 200);
  const second = await call("/projects/" + id, "PATCH", {
    changes: diffDocument(base, b),
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.document.nodes[0].x, 80);
  assert.equal(second.body.document.nodes[0].fill, "#ff0000");
  const conflict = structuredClone(base);
  conflict.nodes[0].x = 120;
  const result = await call("/projects/" + id, "PATCH", {
    changes: diffDocument(base, conflict),
  });
  assert.equal(result.status, 409);
  const r = await call("/projects/" + id, "POST", { action: "revisions" });
  assert.equal(r.body.revisions.length, 3);
  assert.equal(
    (await call("/projects/" + id, "POST", { action: "revision", revision: 1 }))
      .body.document.nodes[0].x,
    0,
  );
});
test("comments persist and can be resolved", async () => {
  await call("/projects/" + id, "POST", {
    action: "comment",
    body: "Please move the title.",
    pageId: base.pages[0].id,
    x: 42,
    y: 60,
  });
  const read = await call("/projects/" + id);
  assert.equal(read.body.comments[0].body, "Please move the title.");
  await call("/projects/" + id, "POST", {
    action: "resolve",
    commentId: read.body.comments[0].id,
    resolved: true,
  });
  assert.equal((await call("/projects/" + id)).body.comments[0].resolved, 1);
});
test("invalid presence rejected without breaking project read", async () => {
  const r = await call("/projects/" + id, "POST", {
    action: "presence",
    clientId: "s",
    cursor: { x: "a".repeat(4000), y: 0 },
  });
  assert.equal(r.status, 400);
  assert.equal((await call("/projects/" + id)).status, 200);
  const ok = await call("/projects/" + id, "POST", {
    action: "presence",
    clientId: "s",
    cursor: { x: 5, y: 6 },
    pageId: base.pages[0].id,
  });
  assert.equal(ok.status, 200);
  assert.equal((await call("/projects/" + id)).body.presence[0].cursor.x, 5);
});
test("member can be revoked", async () => {
  await call("/projects/" + id, "POST", {
    action: "unshare",
    email: "viewer@example.com",
  });
  assert.equal(
    (await call("/projects/" + id, "GET", null, "viewer")).status,
    403,
  );
});
test("untrusted document numeric fields are rejected by API", async () => {
  const d = structuredClone(base);
  d.nodes[0].opacity = '1" onload="alert(1)';
  assert.equal((await call("/projects", "POST", { document: d })).status, 400);
});
