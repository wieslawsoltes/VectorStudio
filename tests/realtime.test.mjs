import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/sqlite.js";
import { handleApi } from "../server/api.js";
import {
  DocumentStore,
  createDocument,
  createNode,
} from "../public/studio/core/index.js";
import { RealtimeClient } from "../public/studio/collab/realtime.js";
import { commitUpdate } from "../server/sync.js";
const saved = new Map();
globalThis.indexedDB = {
  open() {
    const req = {};
    queueMicrotask(() => {
      req.result = {
        createObjectStore() {},
        transaction() {
          const tx = {
            objectStore() {
              return {
                get(key) {
                  const r = { result: structuredClone(saved.get(key)) };
                  queueMicrotask(() => tx.oncomplete?.());
                  return r;
                },
                put(value, key) {
                  saved.set(key, structuredClone(value));
                  const r = { result: key };
                  queueMicrotask(() => tx.oncomplete?.());
                  return r;
                },
              };
            },
          };
          return tx;
        },
      };
      req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  },
};
globalThis.history = { replaceState() {} };
globalThis.location = { href: "https://local/" };
globalThis.WebSocket = class {
  static OPEN = 1;
  constructor() {
    throw new Error("HTTP fallback test");
  }
};
const db = openDatabase(":memory:", "drizzle"),
  user = { id: "u", email: "u@example.com" };
const wait = async (fn) => {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("Client did not initialize");
};
function client() {
  const d = createDocument();
  d.nodes.push(createNode("text", { pageId: d.pages[0].id, text: "ABC" }));
  const store = new DocumentStore(d),
    c = new RealtimeClient(store);
  c.user = user;
  c.request = async (path, options = {}) => {
    const r = await handleApi(
      new Request("https://local/api" + path, {
        ...options,
        headers: {
          "oai-authenticated-user-id": user.id,
          "oai-authenticated-user-email": user.email,
          "content-type": "application/json",
        },
      }),
      { DB: db },
    );
    const b = await r.json();
    if (!r.ok) throw Object.assign(new Error(b.error), b, { status: r.status });
    return b;
  };
  return c;
}
test("offline outbox survives reload and clears only after durable acknowledgment", async () => {
  const a = client();
  let b;
  try {
    const p = await a.create();
    await wait(() => a.replica);
    const request = a.request;
    a.request = async (path, options) => {
      if (options?.method === "POST" && path.endsWith("/sync"))
        throw Object.assign(new Error("Offline"), { status: 503 });
      return request(path, options);
    };
    a.store.update([a.store.doc.nodes[0].id], { text: "offline ABC" });
    await a.persistReplica();
    await a.save();
    assert.equal(a.outbox.length, 1);
    a.destroy();
    b = client();
    await b.open(p.id);
    await wait(() => b.replica);
    assert.equal(b.store.doc.nodes[0].text, "offline ABC");
    assert.equal(b.outbox.length, 1);
    await b.save();
    assert.equal(b.outbox.length, 0);
    assert.equal(b.dirty, false);
    await b.persistReplica();
    assert.equal(saved.get(b.recoveryKey).pending.length, 0);
  } finally {
    a.destroy();
    b?.destroy();
  }
});
test("divergent text during handshake preserves local draft as explicit conflict", async () => {
  const owner = client(),
    joining = client();
  try {
    const p = await owner.create();
    await wait(() => owner.replica);
    let release;
    const gate = new Promise((r) => (release = r)),
      request = joining.request;
    joining.request = async (path, options) => {
      if (path.endsWith("/sync") && !options?.method) await gate;
      return request(path, options);
    };
    await joining.open(p.id);
    joining.store.update([joining.store.doc.nodes[0].id], { text: "AQC" });
    await commitUpdate(db, p.id, user, {
      updateId: crypto.randomUUID(),
      documentChanges: (d) => {
        d.nodes[0].text = "XABC";
        return d;
      },
    });
    release();
    await wait(() => joining.conflict);
    assert.equal(joining.store.doc.nodes[0].text, "AQC");
    assert.equal(joining.replica, null);
    const remote = await request(`/projects/${p.id}`);
    assert.equal(remote.document.nodes[0].text, "XABC");
  } finally {
    owner.destroy();
    joining.destroy();
  }
});
test.after(() => db.close());
