import type { VectorDocument } from "../core/index.js";
export interface SharedMap {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  readonly size: number;
}
export interface Replica {
  destroy(): void;
  getMap(name: string): SharedMap;
  getArray(name: string): unknown;
  transact(fn: () => void, origin?: unknown): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}
export const LOCAL_ORIGIN: string;
export function createReplica(document?: VectorDocument): Replica;
export function applyDocumentChanges(
  replica: Replica,
  before: VectorDocument | { nodes: never[]; pages: never[]; groups?: never[] },
  after: VectorDocument,
  origin?: unknown,
): void;
export function materializeDocument(replica: Replica): VectorDocument;
export function validateReplica(replica: Replica): VectorDocument;
export function encodeState(replica: Replica): Uint8Array;
export function stateVector(replica: Replica): Uint8Array;
export function applyUpdate(
  replica: Replica,
  bytes: Uint8Array,
  origin?: unknown,
): void;
export function encode64(bytes: Uint8Array): string;
export function decode64(text: string): Uint8Array;
export const Y: {
  encodeStateAsUpdate(replica: Replica, vector?: Uint8Array): Uint8Array;
  encodeStateVector(replica: Replica): Uint8Array;
  applyUpdate(replica: Replica, bytes: Uint8Array, origin?: unknown): void;
  mergeUpdates(updates: Uint8Array[]): Uint8Array;
  [key: string]: unknown;
};
