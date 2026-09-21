/** Browser-local persistence for static hosts. No network identity or remote sharing. */
import { CollaborationClient, mergeChanges } from './index.js';
import { validateDocument } from '../core/index.js';

const copy = value => structuredClone(value);
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const view = project => {
  const { snapshots, ...rest } = project;
  return { ...copy(rest), role: 'owner', presence: [] };
};

export class BrowserProjectStore {
  constructor(name = `vellum-pages:${globalThis.location?.pathname || '/'}`) {
    this.name = name;
    this.pending = null;
  }
  open() {
    if (!globalThis.indexedDB) return Promise.reject(failure('Browser storage is unavailable. Download a .vellum file to keep your work.'));
    this.pending ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); this.pending = null; };
        resolve(request.result);
      };
      request.onerror = () => { this.pending = null; reject(request.error); };
      request.onblocked = () => { this.pending = null; reject(failure('Close other Studio tabs to finish opening browser storage.')); };
    });
    return this.pending;
  }
  async list() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const request = tx.objectStore('projects').getAll();
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error || failure('Could not read browser projects.'));
    });
  }
  /** Read and update one project in a single IndexedDB transaction, including its revision check. */
  async access(id, write, operation) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('projects');
      let result, error;
      store.get(id).onsuccess = event => {
        try {
          const outcome = operation(event.target.result);
          result = outcome.result;
          if (outcome.project) {
            if (!write) throw failure('Read-only transaction cannot change a project.');
            store.put(outcome.project);
          }
        } catch (reason) { error = reason; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(error || tx.error || failure('Browser storage failed. Export a .vellum file before closing the tab.'));
    });
  }
  async close() { const db = await this.pending; db?.close(); this.pending = null; }
}

export class BrowserClient extends CollaborationClient {
  constructor(store, options = {}) {
    super(store, options);
    this.local = true;
    this.storage = options.storage || new BrowserProjectStore();
  }
  draftKey(id = this.project?.id) {
    return `vellum-pages-draft:${globalThis.location?.pathname || "/"}:${id || "local"}`;
  }
  async request(path, options = {}) {
    const url = new URL(path, 'https://browser.invalid');
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : {};
    if (url.pathname === '/session') {
      await this.storage.open();
      return { id: 'browser-local', email: 'designer@browser.local', name: 'This browser', local: true };
    }
    if (url.pathname === '/projects') {
      if (method === 'GET') return { projects: (await this.storage.list()).map(p => ({ id: p.id, name: p.name, revision: p.revision, updated: p.updated, role: 'owner' })).sort((a, b) => b.updated - a.updated) };
      if (method !== 'POST') throw failure('Unsupported browser project operation.');
      validateDocument(body.document);
      const id = crypto.randomUUID(), now = Date.now();
      const project = { id, name: body.document.name, document: copy(body.document), revision: 1, created: now, updated: now, comments: [], snapshots: [{ revision: 1, created: now, author: 'designer@browser.local', document: copy(body.document) }] };
      return this.storage.access(id, true, old => {
        if (old) throw failure('A project with this identifier already exists.', 409);
        return { project, result: view(project) };
      });
    }
    const match = /^\/projects\/([^/]+)$/.exec(url.pathname);
    if (!match) throw failure('This operation requires the standalone server.');
    const id = decodeURIComponent(match[1]);
    return this.storage.access(id, method !== 'GET', project => {
      if (!project) throw failure('Project not found in this browser. Import its .vellum file or use the original browser profile.', 404);
      if (method === 'GET') {
        const result = view(project);
        if (Number(url.searchParams.get('since')) === project.revision) delete result.document;
        return { result };
      }
      if (method === 'PATCH') {
        if (!Array.isArray(body.changes)) throw failure('Invalid document update.');
        const merged = mergeChanges(project.document, body.changes);
        if (merged.conflicts.length) throw Object.assign(failure('Another tab changed the same artwork. Your draft is preserved.', 409), { ...view(project), conflicts: merged.conflicts });
        validateDocument(merged.document);
        project.document = merged.document;
        project.name = merged.document.name;
        project.revision++;
        project.updated = Date.now();
        project.snapshots.push({ revision: project.revision, created: project.updated, author: 'designer@browser.local', document: copy(project.document) });
        project.snapshots = project.snapshots.slice(-20);
        return { project, result: view(project) };
      }
      if (method !== 'POST') throw failure('Unsupported browser operation.');
      switch (body.action) {
        case 'presence': return { result: { ok: true } };
        case 'revisions': return { result: { revisions: project.snapshots.map(({ document, ...summary }) => summary).reverse() } };
        case 'revision': {
          const snapshot = project.snapshots.find(s => s.revision === Number(body.revision));
          if (!snapshot) throw failure('This browser revision has expired.', 404);
          return { result: copy(snapshot) };
        }
        case 'comment': {
          if (typeof body.body !== 'string' || !body.body.trim() || body.body.length > 10000) throw failure('Enter a note of 1–10,000 characters.');
          if (!project.document.pages.some(p => p.id === body.pageId)) throw failure('Unknown page.');
          project.comments.push({ id: crypto.randomUUID(), body: body.body.trim(), author: 'designer@browser.local', page_id: body.pageId, x: Number(body.x) || 0, y: Number(body.y) || 0, resolved: false, created: Date.now() });
          project.updated = Date.now();
          return { project, result: { ok: true } };
        }
        case 'resolve': {
          const comment = project.comments.find(c => c.id === body.commentId);
          if (!comment) throw failure('Note not found.', 404);
          comment.resolved = Boolean(body.resolved);
          return { project, result: { ok: true } };
        }
        default: throw failure('Sharing, remote collaborators and account administration require the standalone server. GitHub Pages stores projects only in this browser.');
      }
    });
  }
  async destroy() { super.destroy(); await this.storage.close(); }
}
