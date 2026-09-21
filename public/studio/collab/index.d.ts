import type { VectorDocument, DocumentStore } from "../core/index.js";
export function diffDocument(
  before: VectorDocument,
  after: VectorDocument,
): Array<Record<string, unknown>>;
export function mergeChanges(
  current: VectorDocument,
  changes: Array<Record<string, unknown>>,
): { document: VectorDocument; conflicts: string[] };
export class CollaborationClient extends EventTarget {
  constructor(
    store: DocumentStore,
    options?: { baseURL?: string; interval?: number },
  );
  project: { id: string; revision: number; role?: string } | null;
  base: VectorDocument | null;
  dirty: boolean;
  readonly saving: boolean;
  initialize(): Promise<unknown>;
  list(): Promise<unknown>;
  create(doc?: VectorDocument): Promise<unknown>;
  open(id: string): Promise<unknown>;
  save(): Promise<void>;
  sync(): Promise<void>;
  action(action: string, extra?: Record<string, unknown>): Promise<unknown>;
  presence(cursor: { x: number; y: number }): Promise<void>;
  start(): void;
  stop(): void;
  draftKey(id?: string | null): string;
  persistDraft(): void;
  forkConflict(): Promise<unknown>;
  acceptRemote(): Promise<unknown>;
  destroy(): void;
}
