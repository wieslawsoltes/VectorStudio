/** Hierarchical groups retain world-space child geometry; group appearance composites once. */
const groupMaps = new WeakMap();
function groupMap(doc) {
  let cached = groupMaps.get(doc);
  const groups = doc.groups || [];
  if (!cached || cached.groups !== groups || cached.length !== groups.length) {
    cached = {
      groups,
      length: groups.length,
      map: new Map(groups.map((g) => [g.id, g])),
    };
    groupMaps.set(doc, cached);
  }
  return cached.map;
}
export function ancestors(doc, node) {
  const map = groupMap(doc),
    out = [];
  let id = node.groupId;
  while (id && map.has(id) && out.length < 32) {
    const g = map.get(id);
    out.push(g);
    id = g.parentId;
  }
  return out;
}
export const effectiveLocked = (doc, n) =>
  n.locked || ancestors(doc, n).some((g) => g.locked);
export const effectiveVisible = (doc, n) =>
  n.visible !== false && ancestors(doc, n).every((g) => g.visible !== false);
export const outerGroup = (doc, n) => ancestors(doc, n).at(-1)?.id || n.groupId;
export const inGroup = (doc, n, id) =>
  n.groupId === id || ancestors(doc, n).some((g) => g.id === id);
export function validateStructure(doc, fail) {
  groupMaps.delete(doc);
  if (doc.groups != null && !Array.isArray(doc.groups)) fail("groups");
  if ((doc.groups || []).length > 20000) fail("group count");
  const map = new Map();
  for (const g of doc.groups || []) {
    if (
      !/^[a-zA-Z0-9_-]{1,100}$/.test(g.id) ||
      map.has(g.id) ||
      typeof g.name !== "string" ||
      g.name.length > 300 ||
      !doc.pages.some((p) => p.id === g.pageId) ||
      !Number.isFinite(g.opacity) ||
      g.opacity < 0 ||
      g.opacity > 1 ||
      typeof g.locked !== "boolean" ||
      typeof g.visible !== "boolean"
    )
      fail("group");
    map.set(g.id, g);
  }
  for (const g of map.values()) {
    const seen = new Set([g.id]);
    let id = g.parentId;
    while (id) {
      const parent = map.get(id);
      if (
        !parent ||
        parent.pageId !== g.pageId ||
        seen.has(id) ||
        seen.size > 32
      )
        fail("group cycle or parent");
      seen.add(id);
      id = parent.parentId;
    }
  }
  for (const n of doc.nodes) {
    const g = map.get(n.groupId);
    if (g && g.pageId !== n.pageId) fail("cross-page group");
    if (n.nextFrame) {
      const ids = new Set([n.id]);
      let p = n;
      while (p.nextFrame) {
        p = doc.nodes.find((x) => x.id === p.nextFrame);
        if (!p || p.type !== "text" || ids.has(p.id) || ids.size > 100)
          fail("text thread cycle or target");
        ids.add(p.id);
      }
    }
  }
}
export function pageLayout(doc, gap = 88) {
  let x = 0;
  return doc.pages.map((p) => {
    const r = { id: p.id, x, y: 0, width: p.width, height: p.height };
    x += p.width + gap;
    return r;
  });
}
