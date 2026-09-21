/** Stable-entity Yjs document adapter, independently usable without UI or transport. */
import * as Y from "../vendor/crdt.js";
import { validateDocument, clone, uid } from "../core/index.js";
export { Y };
export const LOCAL_ORIGIN = "vellum-local";
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b),
  plain = (v) => v && typeof v === "object" && !Array.isArray(v),
  blocked = new Set(["__proto__", "prototype", "constructor", "_orderToken"]);
export const encode64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768)
    s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
};
export const decode64 = (s) => {
  if (
    typeof s !== "string" ||
    s.length > 24_000_000 ||
    !/^[A-Za-z0-9+/=]*$/.test(s)
  )
    throw new Error("Invalid sync payload");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
function patchText(shared, before, after) {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  if (start && /[\uD800-\uDBFF]/.test(before[start - 1])) start--;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before.at(-1 - end) === after.at(-1 - end)
  )
    end++;
  if (end && /[\uDC00-\uDFFF]/.test(before[before.length - end])) end--;
  const count = before.length - start - end;
  if (count)
    shared.delete(start, Math.min(count, Math.max(0, shared.length - start)));
  const insert = after.slice(start, after.length - end);
  if (insert) shared.insert(start, insert);
}
function patchMap(target, before, after, depth = 0) {
  if (depth > 16) throw new Error("Invalid document nesting");
  for (const key of new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ])) {
    if (blocked.has(key) || key === "id") continue;
    if (!(key in after) || after[key] === undefined) {
      target.delete(key);
      continue;
    }
    if (eq(before?.[key], after[key])) continue;
    const value = after[key];
    if (key === "text" && typeof value === "string") {
      let text = target.get(key);
      if (!(text instanceof Y.Text)) {
        text = new Y.Text();
        target.set(key, text);
      }
      patchText(
        text,
        typeof before?.[key] === "string" ? before[key] : "",
        value,
      );
    } else if (plain(value)) {
      let map = target.get(key);
      if (!(map instanceof Y.Map)) {
        map = new Y.Map();
        target.set(key, map);
      }
      patchMap(map, plain(before?.[key]) ? before[key] : {}, value, depth + 1);
    } else target.set(key, clone(value));
  }
}
export function createReplica(document) {
  const replica = new Y.Doc();
  for (const name of ["identity", "meta", "nodes", "pages", "groups"])
    replica.getMap(name);
  for (const name of ["nodesOrder", "pagesOrder", "groupsOrder"])
    replica.getArray(name);
  if (document) {
    replica
      .getMap("identity")
      .set("value", {
        format: document.format,
        version: document.version,
        id: document.id,
      });
    applyDocumentChanges(
      replica,
      { nodes: [], pages: [], groups: [] },
      document,
      "seed",
    );
  }
  return replica;
}
function ordered(replica, kind) {
  const map = replica.getMap(kind),
    out = [],
    seen = new Set();
  for (const p of replica.getArray(kind + "Order").toArray()) {
    const n = map.get(p?.id);
    if (
      n instanceof Y.Map &&
      n.get("_orderToken") === p.token &&
      !seen.has(p.id)
    ) {
      seen.add(p.id);
      out.push(p.id);
    }
  }
  return out;
}
export function applyDocumentChanges(
  replica,
  before,
  after,
  origin = LOCAL_ORIGIN,
) {
  replica.transact(() => {
    const prev = { ...before },
      next = { ...after };
    for (const kind of ["pages", "nodes", "groups"]) {
      delete prev[kind];
      delete next[kind];
      const map = replica.getMap(kind),
        order = replica.getArray(kind + "Order"),
        old = new Map((before[kind] || []).map((n) => [n.id, n])),
        nodes = after[kind] || [],
        ids = new Set(nodes.map((n) => n.id));
      for (const id of old.keys()) if (!ids.has(id)) map.delete(id);
      for (const n of nodes) {
        let shared = map.get(n.id);
        if (!(shared instanceof Y.Map)) {
          shared = new Y.Map();
          map.set(n.id, shared);
        }
        patchMap(shared, old.get(n.id) || {}, n);
      }
      if (
        eq(
          (before[kind] || []).map((n) => n.id),
          nodes.map((n) => n.id),
        )
      )
        continue;
      let current = ordered(replica, kind);
      for (let i = 0; i < nodes.length; i++) {
        const id = nodes[i].id;
        if (current[i] === id) continue;
        const token = uid(),
          nextId = current.filter((v) => v !== id)[i],
          entries = order.toArray();
        let index = nextId
          ? entries.findIndex(
              (p) =>
                p.id === nextId &&
                map.get(nextId)?.get("_orderToken") === p.token,
            )
          : entries.length;
        if (index < 0) index = entries.length;
        order.insert(index, [{ id, token }]);
        map.get(id).set("_orderToken", token);
        current = ordered(replica, kind);
      }
    }
    for (const k of ["id", "format", "version"]) {
      delete prev[k];
      delete next[k];
    }
    patchMap(replica.getMap("meta"), prev, next);
  }, origin);
}
function unmap(value, depth = 0) {
  if (depth > 20) throw new Error("Invalid CRDT nesting");
  if (value instanceof Y.Text) return value.toString();
  if (value instanceof Y.Map) {
    const obj = {};
    for (const [key, v] of value) {
      if (key === "_orderToken") continue;
      if (blocked.has(key) || key === "id")
        throw new Error("Invalid CRDT field");
      obj[key] = unmap(v, depth + 1);
    }
    return obj;
  }
  if (value instanceof Y.AbstractType) throw new Error("Invalid shared type");
  return clone(value);
}
export function materializeDocument(replica) {
  const identity = replica.getMap("identity").get("value"),
    doc = { ...unmap(replica.getMap("meta")), ...identity };
  for (const kind of ["pages", "nodes", "groups"])
    doc[kind] = ordered(replica, kind).map((id) => ({
      ...unmap(replica.getMap(kind).get(id)),
      id,
    }));
  if (!doc.pages.length) throw new Error("Invalid CRDT page deletion");
  const pages = new Set(doc.pages.map((p) => p.id));
  doc.nodes = doc.nodes.filter((n) => pages.has(n.pageId));
  doc.groups = doc.groups.filter((g) => pages.has(g.pageId));
  const groups = new Map(doc.groups.map((g) => [g.id, g]));
  for (const g of doc.groups) {
    let p = g,
      seen = new Set([g.id]);
    while (p?.parentId) {
      const next = groups.get(p.parentId);
      if (!next || next.pageId !== g.pageId || seen.has(next.id)) {
        g.parentId = null;
        break;
      }
      seen.add(next.id);
      p = next;
    }
  }
  for (const n of doc.nodes) {
    if (
      n.groupId &&
      (!groups.has(n.groupId) || groups.get(n.groupId).pageId !== n.pageId)
    )
      n.groupId = null;
    if (n.nextFrame && !doc.nodes.some((x) => x.id === n.nextFrame))
      n.nextFrame = null;
  }
  return validateDocument(doc);
}
export function validateReplica(replica) {
  const allowed = new Set([
    "identity",
    "meta",
    "pages",
    "nodes",
    "groups",
    "pagesOrder",
    "nodesOrder",
    "groupsOrder",
  ]);
  for (const [name, type] of replica.share) {
    if (!allowed.has(name)) throw new Error("Invalid CRDT root");
    const order = name.endsWith("Order");
    if (
      (order && !(type instanceof Y.Array)) ||
      (!order && !(type instanceof Y.Map))
    )
      throw new Error("Invalid CRDT type");
    if (type.length > 200000 || type.size > 25000)
      throw new Error("Invalid CRDT size");
  }
  if (replica.store.pendingStructs || replica.store.pendingDs)
    throw new Error("Invalid incomplete CRDT update");
  const result = materializeDocument(replica);
  if (Y.encodeStateAsUpdate(replica).length > 12_000_000)
    throw new Error("CRDT exceeds 12 MB");
  return result;
}
export const encodeState = (replica) => Y.encodeStateAsUpdate(replica);
export const stateVector = (replica) => Y.encodeStateVector(replica);
export const applyUpdate = (replica, bytes, origin = "remote") =>
  Y.applyUpdate(replica, bytes, origin);
