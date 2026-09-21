import { CollaborationClient } from './index.js';
import type { DocumentStore } from '../core/index.js';
export interface BrowserStorage {
  open(): Promise<unknown>;
  list(): Promise<Array<Record<string, any>>>;
  access<T>(id: string, write: boolean, operation: (project: any) => { result: T; project?: any }): Promise<T>;
  close(): Promise<void>;
}
export class BrowserProjectStore implements BrowserStorage {
  constructor(name?: string);
  name: string;
  open(): Promise<IDBDatabase>;
  list(): Promise<Array<Record<string, any>>>;
  access<T>(id: string, write: boolean, operation: (project: any) => { result: T; project?: any }): Promise<T>;
  close(): Promise<void>;
}
export class BrowserClient extends CollaborationClient {
  constructor(store: DocumentStore, options?: { storage?: BrowserStorage; interval?: number });
  local: true;
  storage: BrowserStorage;
  request(path: string, options?: { method?: string; body?: string }): Promise<any>;
  destroy(): Promise<void>;
}
