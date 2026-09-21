import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ws from "../server/vendor/ws.cjs";
import { createDocument, createNode } from "../public/studio/core/index.js";
import {
  Y,
  createReplica,
  applyDocumentChanges,
  materializeDocument,
  encode64,
  decode64,
} from "../public/studio/collab/crdt.js";
test("actual standalone WebSockets synchronize, acknowledge, revoke and reject origins", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vellum-ws-test-")),
    child = spawn(process.execPath, ["server/local.mjs"], {
      env: {
        ...process.env,
        PORT: "0",
        VELLUM_DATABASE_PATH: join(dir, "test.sqlite"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  const sockets = [];
  try {
    const origin = await new Promise((resolve, reject) => {
      let out = "";
      const timer = setTimeout(
        () => reject(new Error("Server startup timeout")),
        6000,
      );
      child.stdout.on("data", (d) => {
        out += d;
        const match = out.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error("Server exited " + code));
      });
    });
    const request = async (path, body) => {
      const r = await fetch(origin + "/api" + path, {
        ...(body
          ? {
              method: "POST",
              headers: { "content-type": "application/json", origin },
              body: JSON.stringify(body),
            }
          : {}),
      });
      const value = await r.json();
      assert.ok(r.ok, JSON.stringify(value));
      return value;
    };
    const d = createDocument();
    d.nodes.push(createNode("text", { pageId: d.pages[0].id, text: "abc" }));
    const project = await request("/projects", { document: d });
    const states = await Promise.all([
      request(`/projects/${project.id}/sync`),
      request(`/projects/${project.id}/sync`),
    ]);
    const clients = [];
    for (const state of states) {
      const replica = createReplica();
      Y.applyUpdate(replica, decode64(state.update));
      const socket = new ws.WebSocket(
        origin.replace("http:", "ws:") + `/api/projects/${project.id}/socket`,
        { origin },
      );
      sockets.push(socket);
      const inbox = [],
        listeners = [];
      socket.on("message", (bytes) => {
        const m = JSON.parse(bytes);
        inbox.push(m);
        for (const f of [...listeners]) f();
      });
      await new Promise((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
      });
      const wait = (type) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            listeners.splice(listeners.indexOf(check), 1);
            reject(new Error("No " + type));
          }, 6000);
          function check() {
            const i = inbox.findIndex((m) => m.type === type);
            if (i >= 0) {
              clearTimeout(timer);
              const [m] = inbox.splice(i, 1);
              const j = listeners.indexOf(check);
              if (j >= 0) listeners.splice(j, 1);
              resolve(m);
            }
          }
          listeners.push(check);
          check();
        });
      const send = (m) =>
        socket.send(
          JSON.stringify({
            protocol: 1,
            vector: encode64(Y.encodeStateVector(replica)),
            ...m,
          }),
        );
      send({ type: "hello", session: state.session });
      await wait("sync");
      clients.push({ replica, send, wait, state });
    }
    for (const [i, c] of clients.entries()) {
      const before = materializeDocument(c.replica),
        after = structuredClone(before);
      after.nodes[0].text = i ? "aYbc" : "aXbc";
      const v = Y.encodeStateVector(c.replica);
      applyDocumentChanges(c.replica, before, after);
      c.send({
        type: "update",
        updateId: crypto.randomUUID(),
        update: encode64(Y.encodeStateAsUpdate(c.replica, v)),
      });
    }
    await Promise.all(clients.map((c) => c.wait("ack")));
    for (const c of clients) {
      c.send({ type: "pulse" });
      let sync = await c.wait("sync");
      Y.applyUpdate(c.replica, decode64(sync.update));
      c.send({ type: "pulse" });
      sync = await c.wait("sync");
      Y.applyUpdate(c.replica, decode64(sync.update));
    }
    assert.equal(
      materializeDocument(clients[0].replica).nodes[0].text,
      materializeDocument(clients[1].replica).nodes[0].text,
    );
    assert.match(
      materializeDocument(clients[0].replica).nodes[0].text,
      /^a(XY|YX)bc$/,
    );
    await request(`/projects/${project.id}`, {
      action: "revoke-session",
      sessionId: states[1].session,
    });
    clients[1].send({ type: "pulse" });
    assert.equal((await clients[1].wait("error")).status, 401);
    const bad = new ws.WebSocket(
      origin.replace("http:", "ws:") + `/api/projects/${project.id}/socket`,
      { origin: "https://evil.example" },
    );
    sockets.push(bad);
    const code = await new Promise((resolve, reject) => {
      bad.on("unexpected-response", (_, r) => {
        r.resume();
        resolve(r.statusCode);
        bad.terminate();
      });
      bad.on("open", () => reject(new Error("Bad origin accepted")));
      bad.on("error", () => {});
    });
    assert.equal(code, 403);
  } finally {
    for (const s of sockets) s.terminate();
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
