import { CollaborationClient } from "./index.js";
import type { Replica } from "./crdt.js";
export class RealtimeClient extends CollaborationClient {
  replica: Replica | null;
  outbox: Array<{ updateId: string; update: string }>;
  session?: string;
  expires?: number;
  persistReplica(): Promise<void>;
  acceptRemote(): Promise<unknown>;
  save(): Promise<void>;
  sync(): Promise<void>;
}
