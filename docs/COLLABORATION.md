# Collaboration protocol and administration

The studio uses `RealtimeClient` and a Yjs document. The original three-way merge API remains exported for compatibility and legacy HTTP patches; those patches now commit through the same durable state service.

## Shared representation

`identity` holds immutable format/version/document ID. `meta` holds editable metadata. `nodes`, `pages` and `groups` map stable IDs to nested Y.Maps. Text fields use Y.Text. Each entity has an internal placement token; corresponding Y.Arrays contain placement records. Only the current token for each ID materializes, so concurrent reorders do not duplicate objects. Unchanged local ordering is not replayed over remote ordering.

Scalar and nested map fields merge independently. Path point arrays, mesh point arrays and other arrays without entity IDs are atomic properties. Concurrent edits to different characters use Y.Text. A local UndoManager tracks local origins and leaves remote edits intact. Deleted-page objects are omitted; children of missing groups detach. Cyclic/invalid text threads are rejected. The source document is validated before persistence.

## Transport

`GET /api/projects/:id/sync` returns the seed/delta, state vector, revision, effective role and a five-minute session. `/api/projects/:id/socket` upgrades to a WebSocket. Protocol 1 supports `hello`, `pulse`, `update`, `sync`, `ack`, `dirty` and `error` messages. Binary Yjs updates are base64 inside bounded JSON frames. An update is acknowledged by its exact update ID only after its transaction commits; vector equality alone is not used as evidence that deletions saved.

Each client pulses about once a second. Same-process rooms send a content-free `dirty` notification so peers can immediately request an authorized delta. Hosted connections on different Worker isolates converge via D1-backed pulses. WebSocket failure falls back to HTTP POST on the sync endpoint. Incoming work is serialized and bounded by queued frame count/bytes; outgoing buffers are bounded.

Every WebSocket update and HTTP `/sync` POST request rechecks the required current session and project role. Writes also enforce the editing lock. SQL repeats the write-authorization predicates in the compare-and-swap operation. Each Worker frame starts a fresh primary-constrained D1 session. A revoked member/session receives no subsequent document sync. Logout through an external identity gateway is bounded by the application session lifetime unless the host integrates immediate logout events.

## Durability and recovery

IndexedDB stores the local replica and unacknowledged outbox under authenticated user + project identity. Reload restores pending operations and retries them. Remote updates are deferred while a pointer transaction is pending. A divergent initial handshake preserves the local draft and presents recovery options rather than applying stale text offsets. Rejected permanent updates pause synchronization. Loading the server version archives the recovery replica and clears its pending queue.

Server snapshots use chunk rows below D1's per-row limit. Unicode boundaries are preserved. Chunk inserts are batched in groups of ten within the parameter limit. The CAS, chunks, revision, exact receipt and audit entry are one transaction. Failed CAS writes cannot insert dependent records because every statement checks the winning commit token. Acknowledged retries return the recorded revision. Revision retention removes unreferenced snapshot chunks; receipts currently remain durable without an automatic expiry policy.

The implementation stores complete snapshots per accepted batch, trading write bandwidth for simple recovery. It is not an incremental log with epoch compaction. State/history growth, large user populations and deployment quotas need load qualification. The Node adapter executes SQLite batches synchronously to prevent transaction interleaving.

## Permissions and administration

Owners manage editor/commenter/viewer membership. Viewers cannot edit or comment; commenters can comment and resolve feedback but cannot commit artwork edits. The UI marks stores read-only when role or project policy forbids editing; server checks remain authoritative.

Window → Project administration provides active-session revocation, an editing lock, retention of 5–100 revisions and exportable audit records. Owners can reopen a locked project. Project membership does not grant access through the hosting site's separate access policy. No email invitations are sent.

Audit records cover document updates, membership revocation and administration changes. They are application database records, not externally immutable audit storage. This release has no organization-tenant administration, SAML/SCIM provisioning, billing or compliance certification.

The legacy document PATCH API remains an independently authenticated compatibility endpoint. It rechecks project membership and editing policy and commits through the same atomic CRDT path, but it does not use collaboration-session tokens. Revoking a collaboration session is not an account logout: a user who remains authenticated and authorized can obtain a new session. Remove the project role or revoke the gateway identity to remove that user's continuing access.
