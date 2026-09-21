/** Field-level three-way merge, durable queue, optimistic cloud client. */
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function diffDocument(before, after) {
  const changes = [];
  for (const key of [
    "name",
    "pages",
    "units",
    "guides",
    "colorSpace",
    "styles",
    "groups",
    "fonts",
    "print",
  ])
    if (!eq(before[key], after[key]))
      changes.push({
        kind: "document",
        key,
        before: before[key],
        after: after[key],
      });
  const a = new Map(before.nodes.map((n) => [n.id, n])),
    b = new Map(after.nodes.map((n) => [n.id, n]));
  for (const [id, n] of b) {
    const prev = a.get(id);
    if (!prev) {
      changes.push({ kind: "add", id, after: n });
      continue;
    }
    const fields = [];
    for (const key of new Set([...Object.keys(n), ...Object.keys(prev)]))
      if (!eq(prev[key], n[key]))
        fields.push({
          key,
          before: prev[key],
          after: n[key],
          remove: !(key in n),
        });
    if (fields.length) changes.push({ kind: "patch", id, fields });
  }
  for (const [id, n] of a)
    if (!b.has(id)) changes.push({ kind: "delete", id, before: n });
  const common = before.nodes.filter((n) => b.has(n.id)).map((n) => n.id),
    next = after.nodes.filter((n) => a.has(n.id)).map((n) => n.id);
  if (
    !eq(common, next) ||
    !eq(
      [
        ...before.nodes.filter((n) => b.has(n.id)).map((n) => n.id),
        ...after.nodes.filter((n) => !a.has(n.id)).map((n) => n.id),
      ],
      after.nodes.map((n) => n.id),
    )
  )
    changes.push({
      kind: "order",
      before: common,
      after: after.nodes.map((n) => n.id),
    });
  return changes;
}
export function mergeChanges(current, changes) {
  const result = structuredClone(current),
    conflicts = [];
  for (const op of changes) {
    if (op.kind === "document") {
      if (
        ![
          "name",
          "pages",
          "units",
          "guides",
          "colorSpace",
          "styles",
          "groups",
          "fonts",
          "print",
        ].includes(op.key)
      )
        throw new Error("Invalid document field");
      if (!eq(result[op.key], op.before) && !eq(result[op.key], op.after))
        conflicts.push(`Document ${op.key}`);
      else result[op.key] = structuredClone(op.after);
      continue;
    }
    if (op.kind === "order") {
      const shared = op.before.filter((id) =>
        result.nodes.some((n) => n.id === id),
      );
      const remote = result.nodes
        .filter((n) => shared.includes(n.id))
        .map((n) => n.id);
      if (!eq(shared, remote)) conflicts.push("Object stacking order");
      else {
        const rank = new Map(op.after.map((id, i) => [id, i]));
        result.nodes.sort(
          (a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9),
        );
      }
      continue;
    }
    const n = result.nodes.find((n) => n.id === op.id);
    if (op.kind === "add") {
      if (n && !eq(n, op.after)) conflicts.push(`New object ${op.id}`);
      else if (!n) result.nodes.push(structuredClone(op.after));
    } else if (op.kind === "delete") {
      if (n && !eq(n, op.before))
        conflicts.push(`${n.name}: delete versus edit`);
      else result.nodes = result.nodes.filter((n) => n.id !== op.id);
    } else if (op.kind === "patch") {
      if (!n) {
        conflicts.push(`Deleted object ${op.id}`);
        continue;
      }
      for (const field of op.fields) {
        if (
          ["__proto__", "constructor", "prototype", "id", "pageId"].includes(
            field.key,
          ) &&
          field.key !== "pageId"
        )
          throw new Error("Invalid field");
        if (!eq(n[field.key], field.before) && !eq(n[field.key], field.after))
          conflicts.push(`${n.name}: ${field.key}`);
        else if (field.remove) delete n[field.key];
        else n[field.key] = structuredClone(field.after);
      }
    } else throw new Error("Invalid operation");
  }
  return { document: conflicts.length ? current : result, conflicts };
}
export class CollaborationClient extends EventTarget {
  constructor(store, { baseURL = "/api", interval = 2500 } = {}) {
    super();
    Object.assign(this, {
      store,
      baseURL,
      interval,
      project: null,
      base: null,
      dirty: false,
      stopped: false,
      generation: 0,
      busy: null,
      conflict: null,
      clientId: globalThis.crypto.randomUUID(),
    });
    this.listener = () => {
      this.dirty = true;
      this.persistDraft();
      this.schedule(750);
    };
    store.addEventListener("change", this.listener);
  }
  get saving() {
    return !!this.busy;
  }
  emit(status, data = {}) {
    this.dispatchEvent(
      new CustomEvent("status", { detail: { status, ...data } }),
    );
  }
  async request(path, options = {}) {
    const response = await fetch(this.baseURL + path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    const body = await response
      .json()
      .catch(() => ({ error: "Server unavailable" }));
    if (!response.ok) {
      const e = new Error(body.error || "Request failed");
      Object.assign(e, body, { status: response.status });
      throw e;
    }
    return body;
  }
  async initialize() {
    this.user = await this.request("/session");
    return this.user;
  }
  async list() {
    return this.request("/projects");
  }
  schedule(delay = 750) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), delay);
  }
  valid(g, id) {
    return g === this.generation && (!id || this.project?.id === id);
  }
  async create(doc = this.store.doc) {
    this.stop();
    const g = this.generation,
      sent = structuredClone(doc);
    const p = await this.request("/projects", {
      method: "POST",
      body: JSON.stringify({ document: sent }),
    });
    if (!this.valid(g)) return p;
    this.project = p;
    this.base = structuredClone(p.document);
    this.dirty = !eq(this.store.doc, sent);
    history.replaceState(null, "", `?project=${p.id}`);
    this.persistDraft();
    this.emit(this.dirty ? "saving" : "saved");
    this.start();
    if (this.dirty) this.schedule();
    return p;
  }
  async open(id) {
    this.stop();
    const g = this.generation;
    const p = await this.request(`/projects/${encodeURIComponent(id)}`);
    if (!this.valid(g)) return p;
    this.project = p;
    this.base = structuredClone(p.document);
    this.store.replace(p.document, true);
    this.dirty = false;
    this.conflict = null;
    history.replaceState(null, "", `?project=${id}`);
    this.emit("saved");
    this.emit("presence", {
      people: p.presence || [],
      comments: p.comments || [],
    });
    this.start();
    return p;
  }
  start() {
    this.stopped = false;
    clearInterval(this.poller);
    this.poller = setInterval(() => this.sync(), this.interval);
  }
  stop() {
    this.generation++;
    this.stopped = true;
    this.busy = null;
    clearInterval(this.poller);
    clearTimeout(this.timer);
  }
  draftKey(id = this.project?.id) {
    return `vellum-draft-${id || "local"}`;
  }
  persistDraft() {
    try {
      localStorage.setItem(
        this.draftKey(),
        JSON.stringify({
          document: this.store.doc,
          base: this.base,
          updated: Date.now(),
          dirty: this.dirty,
        }),
      );
    } catch {
      this.emit("draft-full");
    }
  }
  async save() {
    if (!this.project) {
      this.emit("local");
      return;
    }
    if (this.busy || !this.dirty || this.conflict || this.store.pending) {
      if (this.dirty && !this.conflict) this.schedule(1000);
      return;
    }
    const token = { generation: this.generation, id: this.project.id };
    this.busy = token;
    this.emit("saving");
    const sent = structuredClone(this.store.doc),
      changes = diffDocument(this.base, sent);
    if (!changes.length) {
      this.dirty = false;
      this.busy = null;
      this.emit("saved");
      return;
    }
    try {
      const r = await this.request(`/projects/${token.id}`, {
        method: "PATCH",
        body: JSON.stringify({ changes, clientId: this.clientId }),
      });
      if (!this.valid(token.generation, token.id)) return;
      if (this.store.pending) {
        this.dirty = true;
        return;
      }
      const queued = diffDocument(sent, this.store.doc),
        merged = mergeChanges(r.document, queued);
      if (merged.conflicts.length) {
        this.conflict = r;
        this.emit("conflict", { conflicts: merged.conflicts });
        return;
      }
      this.base = structuredClone(r.document);
      this.project.revision = r.revision;
      if (!eq(this.store.doc, merged.document))
        this.store.replace(merged.document, true);
      this.dirty = queued.length > 0;
      this.persistDraft();
      this.emit(this.dirty ? "saving" : "saved");
    } catch (e) {
      if (!this.valid(token.generation, token.id)) return;
      if (e.status === 409) {
        this.conflict = e;
        this.emit("conflict", { conflicts: e.conflicts });
      } else this.emit("offline", { error: e.message });
    } finally {
      if (this.busy === token) {
        this.busy = null;
        if (this.dirty && !this.conflict && !this.stopped) this.schedule(3000);
      }
    }
  }
  async sync() {
    if (
      this.busy ||
      this.stopped ||
      this.conflict ||
      !this.project ||
      this.store.pending
    )
      return;
    if (this.dirty) {
      await this.save();
      return;
    }
    const token = { generation: this.generation, id: this.project.id };
    this.busy = token;
    try {
      const r = await this.request(
        `/projects/${token.id}?since=${this.project.revision}`,
      );
      if (
        !this.valid(token.generation, token.id) ||
        this.store.pending ||
        r.revision < this.project.revision
      )
        return;
      this.emit("presence", {
        people: r.presence || [],
        comments: r.comments || [],
      });
      if (r.document) {
        const pending = diffDocument(this.base, this.store.doc),
          merged = mergeChanges(r.document, pending);
        if (merged.conflicts.length) {
          this.conflict = r;
          this.emit("conflict", { conflicts: merged.conflicts });
          return;
        }
        this.base = structuredClone(r.document);
        this.project.revision = r.revision;
        this.store.replace(merged.document, true);
        this.dirty = pending.length > 0;
        this.emit(this.dirty ? "saving" : "saved");
      }
    } catch (e) {
      if (this.valid(token.generation, token.id))
        this.emit("offline", { error: e.message });
    } finally {
      if (this.busy === token) this.busy = null;
    }
  }
  async presence(cursor) {
    if (!this.project) return;
    try {
      await this.request(`/projects/${this.project.id}`, {
        method: "POST",
        body: JSON.stringify({
          action: "presence",
          clientId: this.clientId,
          cursor,
          pageId: this.store.page.id,
        }),
      });
    } catch {}
  }
  async action(action, extra = {}) {
    if (!this.project) throw new Error("Save this project to the cloud first");
    return this.request(`/projects/${this.project.id}`, {
      method: "POST",
      body: JSON.stringify({ action, ...extra }),
    });
  }
  async forkConflict() {
    const current = structuredClone(this.store.doc);
    current.name = current.name.slice(0, 150) + " — recovered copy";
    this.stop();
    this.conflict = null;
    this.store.replace(current, true);
    return this.create(current);
  }
  async acceptRemote() {
    const id = this.project.id;
    this.conflict = null;
    return this.open(id);
  }
  destroy() {
    this.stop();
    this.store.removeEventListener("change", this.listener);
  }
}
