/** Yjs provider with WebSocket transport, HTTP fallback, durable IndexedDB outbox and local undo. */
import { CollaborationClient } from "./index.js";
import {
  Y,
  LOCAL_ORIGIN,
  createReplica,
  applyDocumentChanges,
  materializeDocument,
  encode64,
  decode64,
} from "./crdt.js";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let database;
async function recoveryDB() {
  if (typeof indexedDB === "undefined") return null;
  database ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("vellum-realtime", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("replicas");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return database;
}
async function recovery(key, value) {
  const db = await recoveryDB();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
        "replicas",
        value === undefined ? "readonly" : "readwrite",
      ),
      s = tx.objectStore("replicas"),
      r = value === undefined ? s.get(key) : s.put(value, key);
    tx.oncomplete = () => resolve(r.result);
    tx.onerror = () => reject(tx.error);
  });
}
export class RealtimeClient extends CollaborationClient {
  constructor(store, options = {}) {
    super(store, options);
    store.removeEventListener("change", this.listener);
    this.listener = () => this.localChange();
    store.addEventListener("change", this.listener);
    this.outbox = [];
    this.deferred = [];
    this.originalUndo = store.undo.bind(store);
    this.originalRedo = store.redo.bind(store);
    store.undo = () => {
      if (!store.readOnly)
        this.replica ? this.undoManager?.undo() : this.originalUndo();
    };
    store.redo = () => {
      if (!store.readOnly)
        this.replica ? this.undoManager?.redo() : this.originalRedo();
    };
  }
  stop() {
    super.stop();
    this.store.readOnly = false;
    clearInterval(this.pulses);
    clearTimeout(this.reconnect);
    this.socket?.close();
    this.socket = null;
    this.replica?.destroy();
    this.replica = null;
    this.undoManager?.destroy();
    this.outbox = [];
    this.deferred = [];
    this.sending = false;
  }
  start() {
    this.stopped = false;
    const g = this.generation;
    this.connect(g).catch((e) => {
      if (this.valid(g)) {
        this.emit("offline", { error: e.message });
        this.reconnect = setTimeout(() => this.start(), 2500);
      }
    });
  }
  async connect(g) {
    const id = this.project?.id;
    if (!id) return;
    const state = await this.request(`/projects/${id}/sync`);
    if (!this.valid(g, id)) return;
    this.session = state.session;
    this.expires = state.expires;
    this.project.role = state.role;
    this.store.readOnly =
      !!state.archived || !["owner", "editor"].includes(state.role);
    this.serverVector = state.vector;
    const replica = createReplica();
    Y.applyUpdate(replica, decode64(state.update), "server");
    this.recoveryKey = `${this.user?.id || "local"}:${id}`;
    const saved = await recovery(this.recoveryKey).catch(() => null);
    if (!this.valid(g, id)) {
      replica.destroy();
      return;
    }
    this.replica = replica;
    if (saved?.documentId === this.store.doc.id && saved.pending?.length) {
      Y.applyUpdate(this.replica, saved.state, "recovery");
      this.outbox = saved.pending;
    }
    // Local edits made while handshake was in flight are applied against the fetched base.
    if (this.dirty && !same(this.base, this.store.doc)) {
      if (
        !same(materializeDocument(this.replica), {
          ...this.base,
          groups: this.base.groups || [],
        })
      ) {
        this.conflict = {
          error:
            "Artwork changed during connection. Your local draft is preserved.",
        };
        this.emit("conflict", { conflicts: [this.conflict.error] });
        this.replica.destroy();
        this.replica = null;
        return;
      }
      const updates = [];
      const capture = (u) => updates.push(u);
      this.replica.on("update", capture);
      applyDocumentChanges(
        this.replica,
        this.base,
        this.store.doc,
        LOCAL_ORIGIN,
      );
      this.replica.off("update", capture);
      if (updates.length)
        this.outbox.push({
          updateId: crypto.randomUUID(),
          update: encode64(Y.mergeUpdates(updates)),
        });
    }
    this.lastDocument = materializeDocument(this.replica);
    this.store.replace(this.lastDocument, true);
    this.undoManager = new Y.UndoManager(
      [
        "meta",
        "pages",
        "nodes",
        "groups",
        "pagesOrder",
        "nodesOrder",
        "groupsOrder",
      ].map((name) =>
        name.endsWith("Order")
          ? this.replica.getArray(name)
          : this.replica.getMap(name),
      ),
      { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 400 },
    );
    this.replica.on("update", (update, origin) => {
      if (origin === LOCAL_ORIGIN || origin === this.undoManager) {
        this.outbox.push({
          updateId: crypto.randomUUID(),
          update: encode64(update),
        });
        this.dirty = true;
        if (origin === this.undoManager) this.showReplica();
        this.persistReplica();
        this.emit("saving");
        this.schedule(80);
      }
    });
    // Queue a merged diff when a local JSON edit predates subscription.
    if (this.dirty && !this.outbox.length)
      this.outbox.push({
        updateId: crypto.randomUUID(),
        update: encode64(
          Y.encodeStateAsUpdate(this.replica, decode64(state.vector)),
        ),
      });
    this.dirty = this.outbox.length > 0;
    this.project.revision = state.revision;
    this.emit(this.dirty ? "saving" : "saved");
    this.openSocket(g, id);
    clearInterval(this.pulses);
    this.pulses = setInterval(() => this.pulse(g, id), 1000);
    clearInterval(this.poller);
    this.poller = setInterval(() => this.sync(), 3000);
    if (this.dirty) this.schedule(100);
  }
  openSocket(g, id) {
    try {
      const url = new URL(
        `${this.baseURL}/projects/${id}/socket`,
        location.href,
      );
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const socket = (this.socket = new WebSocket(url));
      socket.onopen = () => {
        if (!this.valid(g, id)) return socket.close();
        this.send({ type: "hello", session: this.session });
      };
      socket.onmessage = (e) => {
        if (!this.valid(g, id)) return;
        try {
          const m = JSON.parse(e.data);
          if (m.type === "dirty") this.send({ type: "pulse" });
          else if (m.type === "ack") this.ack(m.updateId, m.revision);
          else if (m.type === "sync") this.receive(m);
          else if (m.type === "error") {
            this.sending = false;
            if ([401, 403].includes(m.status)) {
              this.emit("offline", { error: m.error });
              socket.close();
            } else {
              this.conflict = m;
              this.emit("conflict", { conflicts: [m.error] });
            }
          }
        } catch (e) {
          this.emit("offline", { error: e.message });
        }
      };
      socket.onclose = () => {
        if (this.valid(g, id)) {
          this.socket = null;
          this.sending = false;
          this.schedule(100);
        }
      };
      socket.onerror = () => {};
    } catch {
      this.socket = null;
    }
  }
  send(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(
      JSON.stringify({
        protocol: 1,
        vector: encode64(Y.encodeStateVector(this.replica)),
        ...message,
      }),
    );
    return true;
  }
  async pulse(g, id) {
    if (!this.valid(g, id) || !this.replica) return;
    if (Date.now() > this.expires - 30000 && !this.renewing) {
      this.renewing = true;
      try {
        const s = await this.request(`/projects/${id}/sync`);
        if (!this.valid(g, id)) return;
        this.session = s.session;
        this.expires = s.expires;
        this.receive(s);
        this.send({ type: "hello", session: this.session });
      } catch (e) {
        this.emit("offline", { error: e.message });
      } finally {
        this.renewing = false;
      }
    }
    if (!this.store.pending) this.flushDeferred();
    this.send({ type: "pulse" });
    if (this.dirty && !this.sending) this.save();
  }
  localChange() {
    this.dirty = true;
    this.persistDraft();
    if (!this.replica) {
      if (this.project) this.schedule(500);
      return;
    }
    if (!["owner", "editor"].includes(this.project.role)) {
      this.emit("offline", {
        error: "This project is read-only. Save a local copy of your edits.",
      });
      return;
    }
    applyDocumentChanges(
      this.replica,
      this.lastDocument,
      this.store.doc,
      LOCAL_ORIGIN,
    );
    this.lastDocument = structuredClone(this.store.doc);
    this.flushDeferred();
    this.schedule(80);
  }
  showReplica() {
    this.lastDocument = materializeDocument(this.replica);
    const history = this.store.history,
      future = this.store.future;
    this.store.replace(this.lastDocument, true);
    this.store.history = history;
    this.store.future = future;
    this.base = structuredClone(this.lastDocument);
  }
  receive(message) {
    this.project.role = message.role || this.project.role;
    this.store.readOnly =
      !!message.archived || !["owner", "editor"].includes(this.project.role);
    this.project.revision = Math.max(
      this.project.revision,
      message.revision || 0,
    );
    this.serverVector = message.vector || this.serverVector;
    if (message.update) {
      if (this.store.pending) {
        this.deferred.push(decode64(message.update));
        if (this.deferred.length > 10)
          this.deferred = [Y.mergeUpdates(this.deferred)];
        return;
      }
      Y.applyUpdate(this.replica, decode64(message.update), "server");
      this.showReplica();
      this.persistReplica();
    }
  }
  flushDeferred() {
    if (this.store.pending || !this.deferred.length) return;
    Y.applyUpdate(this.replica, Y.mergeUpdates(this.deferred), "server");
    this.deferred = [];
    this.showReplica();
    this.persistReplica();
  }
  async persistReplica() {
    if (!this.replica) return;
    try {
      await recovery(this.recoveryKey, {
        documentId: this.store.doc.id,
        state: Y.encodeStateAsUpdate(this.replica),
        pending: structuredClone(this.outbox),
        updated: Date.now(),
      });
    } catch (e) {
      this.emit("draft-full", { error: e.message });
    }
  }
  ack(id, revision) {
    this.outbox = this.outbox.filter((p) => p.updateId !== id);
    this.project.revision = Math.max(this.project.revision, revision);
    this.sending = false;
    this.dirty = this.outbox.length > 0;
    this.persistReplica();
    this.emit(this.dirty ? "saving" : "saved");
    if (this.dirty) this.schedule(40);
  }
  async save() {
    if (!this.project) {
      this.emit("local");
      return;
    }
    if (
      !this.replica ||
      this.sending ||
      this.conflict ||
      this.store.pending ||
      !this.outbox.length
    )
      return;
    const batch = this.outbox[0],
      g = this.generation,
      id = this.project.id;
    this.sending = true;
    this.sentAt = Date.now();
    if (this.send({ type: "update", ...batch })) return;
    try {
      const r = await this.request(`/projects/${id}/sync`, {
        method: "POST",
        body: JSON.stringify({
          ...batch,
          session: this.session,
          vector: encode64(Y.encodeStateVector(this.replica)),
        }),
      });
      if (!this.valid(g, id)) return;
      this.ack(batch.updateId, r.revision);
      this.receive(r);
    } catch (e) {
      if (this.valid(g, id)) {
        this.sending = false;
        if ([400, 409, 413].includes(e.status)) {
          this.conflict = e;
          this.emit("conflict", { conflicts: [e.message] });
        } else this.emit("offline", { error: e.message });
      }
    }
  }
  async acceptRemote() {
    if (this.recoveryKey) {
      const current = await recovery(this.recoveryKey);
      if (current)
        await recovery(this.recoveryKey + ":recovered:" + Date.now(), current);
      await recovery(this.recoveryKey, null);
    }
    return super.acceptRemote();
  }
  async sync() {
    if (!this.project || this.stopped) return;
    const g = this.generation,
      id = this.project.id;
    try {
      const r = await this.request(
        `/projects/${id}?since=${this.project.revision}`,
      );
      if (!this.valid(g, id)) return;
      this.emit("presence", {
        people: r.presence || [],
        comments: r.comments || [],
      });
      if (!this.socket && this.replica) {
        const state = await this.request(`/projects/${id}/sync`, {
          method: "POST",
          body: JSON.stringify({
            action: "pull",
            session: this.session,
            vector: encode64(Y.encodeStateVector(this.replica)),
          }),
        });
        if (!this.valid(g, id)) return;
        this.receive(state);
      }
      if (this.sending && Date.now() - this.sentAt > 8000) {
        this.sending = false;
        this.socket?.close();
      }
      if (this.dirty) this.save();
    } catch (e) {
      if (this.valid(g, id)) this.emit("offline", { error: e.message });
    }
  }
}
