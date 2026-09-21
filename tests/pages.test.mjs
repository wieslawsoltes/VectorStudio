import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createDocument, createNode, DocumentStore } from '../public/studio/core/index.js';
import { BrowserClient, BrowserProjectStore } from '../public/studio/collab/browser.js';
import { diffDocument, CollaborationClient } from '../public/studio/collab/index.js';
import { buildPages } from '../scripts/build-pages.mjs';
import { servePages } from '../scripts/static-server.mjs';
class MemoryStore {
  constructor() { this.projects = new Map(); }
  async open() {}
  async close() {}
  async list() { return structuredClone([...this.projects.values()]); }
  async access(id, write, operation) {
    const { result, project } = operation(structuredClone(this.projects.get(id)));
    if (project) { assert.equal(write, true); this.projects.set(id, structuredClone(project)); }
    return structuredClone(result);
  }
}
function client(t, storage = new MemoryStore()) {
  const doc = createDocument('Pages test');
  doc.nodes.push(createNode('rect', { pageId: doc.pages[0].id, width: 120, height: 70 }));
  const c = new BrowserClient(new DocumentStore(doc), { storage });
  t.after(() => c.destroy());
  return c;
}
const request = (c, path, method = 'GET', body) => c.request(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
const create = c => request(c, '/projects', 'POST', { document: c.store.doc });

test('browser provider saves, lists and reloads complete editable projects without fetch', async t => {
  const c = client(t), p = await create(c);
  assert.equal((await c.initialize()).local, true);
  assert.equal((await c.list()).projects[0].id, p.id);
  const opened = await request(c, `/projects/${p.id}`);
  assert.deepEqual(opened.document, c.store.doc);
  assert.equal(opened.role, 'owner');
  assert.equal((await request(c, `/projects/${p.id}?since=1`)).document, undefined);
});
test('browser store preserves field merges and refuses conflicting tab edits', async t => {
  const c = client(t), p = await create(c), before = p.document;
  const a = structuredClone(before), b = structuredClone(before);
  a.nodes[0].x = 20; b.nodes[0].fill = '#ee9900';
  await request(c, `/projects/${p.id}`, 'PATCH', { changes: diffDocument(before, a) });
  const merged = await request(c, `/projects/${p.id}`, 'PATCH', { changes: diffDocument(before, b) });
  assert.equal(merged.document.nodes[0].x, 20); assert.equal(merged.document.nodes[0].fill, '#ee9900');
  const conflict = structuredClone(before); conflict.nodes[0].x = 90;
  await assert.rejects(request(c, `/projects/${p.id}`, 'PATCH', { changes: diffDocument(before, conflict) }), e => e.status === 409 && e.conflicts.length > 0);
  assert.equal((await request(c, `/projects/${p.id}`)).document.nodes[0].x, 20);
});
test('browser revision history retains twenty snapshots and can retrieve them', async t => {
  const c = client(t), p = await create(c); let before = p.document;
  for (let i = 0; i < 24; i++) {
    const after = structuredClone(before); after.nodes[0].x = i + 1;
    await request(c, `/projects/${p.id}`, 'PATCH', { changes: diffDocument(before, after) }); before = after;
  }
  const history = await request(c, `/projects/${p.id}`, 'POST', { action: 'revisions' });
  assert.equal(history.revisions.length, 20); assert.equal(history.revisions[0].revision, 25);
  const latest = await request(c, `/projects/${p.id}`, 'POST', { action: 'revision', revision: 25 });
  assert.deepEqual(latest.document, before);
  await assert.rejects(request(c, `/projects/${p.id}`, 'POST', { action: 'revision', revision: 1 }), /expired/);
});
test('browser notes persist and resolve locally, with page validation', async t => {
  const c = client(t), p = await create(c);
  await request(c, `/projects/${p.id}`, 'POST', { action: 'comment', body: 'Local note', pageId: p.document.pages[0].id, x: 15, y: 30 });
  let current = await request(c, `/projects/${p.id}`);
  assert.equal(current.comments[0].body, 'Local note');
  await request(c, `/projects/${p.id}`, 'POST', { action: 'resolve', commentId: current.comments[0].id, resolved: true });
  current = await request(c, `/projects/${p.id}`); assert.equal(current.comments[0].resolved, true);
  await assert.rejects(request(c, `/projects/${p.id}`, 'POST', { action: 'comment', body: 'bad page', pageId: 'missing' }), /Unknown page/);
});
test('browser provider rejects remote account operations and absent projects', async t => {
  const c = client(t), p = await create(c);
  await assert.rejects(request(c, `/projects/${p.id}`, 'POST', { action: 'share' }), /standalone server/);
  await assert.rejects(request(c, `/projects/${p.id}/sync`), /standalone server/);
  await assert.rejects(request(c, '/projects/absent'), /not found in this browser/);
});
test('invalid projects and failed storage writes never report successful persistence', async t => {
  const storage = new MemoryStore(), c = client(t, storage);
  await assert.rejects(request(c, '/projects', 'POST', { document: {} }));
  assert.equal((await storage.list()).length, 0);
  storage.access = async () => { throw new Error('Quota exceeded'); };
  await assert.rejects(create(c), /Quota exceeded/);
});
test('unavailable IndexedDB is disclosed instead of simulated cloud storage', async () => {
  const original = globalThis.indexedDB; delete globalThis.indexedDB;
  try { await assert.rejects(new BrowserProjectStore().open(), /Browser storage is unavailable/); }
  finally { if (original) globalThis.indexedDB = original; }
});
test('browser draft keys are scoped separately from the server provider', t => {
  const c = client(t); assert.match(c.draftKey(), /^vellum-pages-draft:/);
  const server = new CollaborationClient(new DocumentStore()); t.after(() => server.destroy());
  assert.equal(server.draftKey(), 'vellum-draft-local');
  assert.notEqual(c.draftKey('p'), server.draftKey('p'));
});
test('CDR import reports the backend requirement without making a network request', async () => {
  const old = globalThis.VELLUM_STATIC; globalThis.VELLUM_STATIC = true;
  try {
    const { readFile: importFile } = await import('../public/studio/io/index.js');
    await assert.rejects(importFile(new File(['RIFF'], 'test.cdr'), 'page'), /standalone server/);
  } finally { globalThis.VELLUM_STATIC = old; }
});
test('Pages output is repository-relative, static-only, and reachable below a subpath', async t => {
  const tmp = await mkdtemp(resolve(tmpdir(), 'vellum-pages-')); t.after(() => rm(tmp, { recursive: true, force: true }));
  const info = await buildPages(resolve(tmp, 'site'));
  assert.equal(info.capabilities.remoteCollaboration, false);
  assert.ok(Object.keys(info.files).every(p => !p.startsWith('server/') && !p.startsWith('data/') && !p.endsWith('.env')));
  const html = await readFile(resolve(tmp, 'site/index.html'), 'utf8');
  assert.match(html, /src="\.\/studio\/pages-config.js"/); assert.doesNotMatch(html, /(?:href|src)="\/(?!\/)/);
  const example = await readFile(resolve(tmp, 'site/examples/standalone.html'), 'utf8'); assert.match(example, /from '\.\.\/studio\//);
  const server = await servePages(resolve(tmp, 'site')); t.after(server.close);
  const response = await fetch(server.url); assert.equal(response.status, 200);
  assert.equal((await fetch(new URL('studio/app.js', server.url))).status, 200);
  assert.equal((await fetch(new URL('studio/vendor/lcms.wasm', server.url))).headers.get('content-type'), 'application/wasm');
  assert.equal((await fetch(new URL('/api/session', server.url))).status, 404);
});
