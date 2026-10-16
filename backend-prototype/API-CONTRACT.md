# Claude integration contract — current backend, not deployed

Release preparation now requires `JARVIS_SECURITY_LOG_DIR` pointing to an existing private log directory; hosted API requests fail with generic 503 if private auditing cannot write. API routes/payloads/cookie names and workspace rules remain unchanged. Temporary infrastructure gate tokens must never enter Claude's frontend. See RELEASE-READINESS.md for the approval-gated HTTPS plan, logging retention and unverified hosted/browser/restore checks.

This documents the implemented v1 API. It does not authorize production integration. Existing dashboard/Claude UI, storage keys and visual assets remain untouched. Use same-origin HTTPS; cross-site credential requests from GitHub Pages are intentionally unsupported. The staging 403 gate remains until independently approved setup is complete.

## Authentication and sessions

`POST /api/v1/auth/login` accepts `{username,password,device_name}`. Successful login returns `{identity:'owner',session_id,csrf,expires}` and a host-only `__Host-JarvisSession` Secure/HttpOnly/SameSite=Strict cookie. Password creation requires 14–72 UTF-8 bytes; bcrypt cost is 12. Device label is at most 80 UTF-8 bytes. Sessions have a 12-hour absolute lifetime and 30-minute idle timeout, maximum 20 active sessions. Device labels identify browser sessions, not authenticated hardware.

`GET /api/v1/session` returns the current session ID, identity, expiry and derived CSRF. Keep CSRF in page memory, never store cookies/bearers in browser storage. Authentication is cookie-based. Every POST except login additionally requires `X-CSRF-Token`. All POSTs, including login, require the exact application Origin and JSON Content-Type. Host must match the configured origin. No CORS permission is issued; redirects must not forward credentials to another origin.

`POST /api/v1/auth/logout` accepts `{}` and revokes the current session. `GET /api/v1/sessions` lists active session metadata; `POST /api/v1/sessions/revoke` accepts `{id}`. Mutation-time session revalidation and revocation share the owner transaction lock. A write ordered before revocation can finish; a write ordered after revocation is rejected. Revocation cannot erase previously downloaded offline data.

Login limits: 10 attempts per peer IP/15 minutes and 100 aggregate/15 minutes. Session budget: 600 requests/10 minutes. Do not trust forwarded IP headers. No open registration, password-reset endpoint, passkey or MFA exists. Do not invent a recovery shortcut; password/key recovery and rotation need a separately reviewed CLI procedure, an encrypted backup and explicit session revocation before real use.

## Shared data

`GET /api/v1/sync` returns `{binding,revision,records}` for task/event/preference records, including tombstones, read atomically. `GET /api/v1/memory` returns notes only; do not cache them offline or include their text in client logs.

Each record is `{kind,id,revision,deleted,data}`. Mutation:

```json
{
  "binding": {"subject_id":"11111111111111111111111111111111","workspace_id":"22222222222222222222222222222222","generation":"33333333333333333333333333333333"},
  "operation_id": "49f08200-a659-4bcb-bcd1-17335607d6f7",
  "kind": "task",
  "id": "example-task",
  "base_revision": 0,
  "deleted": false,
  "data": {"text": "Synthetic example", "done": false}
}
```

`POST /api/v1/sync` returns `{binding,record}`. IDs contain lowercase ASCII letters/digits/hyphen/underscore, at most 100 characters. Operation IDs must use grouped lowercase hexadecimal UUID shape. Base revision must be a nonnegative integer; zero creates an unseen record. Tasks accept text (720 UTF-8 bytes) and boolean done. Events accept text (480 bytes), valid date `YYYY-MM-DD`, time `HH:MM`, normalized to Asia/Dubai. Preferences accept language `en-GB` or `ne-NP`. Notes accept text (4000 bytes). Deletion keeps a tombstone and requires the current revision.

After an uncertain network outcome, retry the **same operation ID and identical normalized payload**. A duplicate successful operation does not create another write; its response contains the latest canonical record, which may be newer or deleted. Do not expect a byte-identical historical response. A stale base returns 409 and the current record. Preserve the draft and require a user choice; an intentional replacement is a new operation ID based on the currently shown revision and can conflict again.

Limits: request 16 KiB, 1000 retained records/tombstones, 5 MiB current plaintext-equivalent content and 10000 retry-history entries. Limits reject new writes instead of silently deleting history. Do not schedule unreviewed tombstone/history pruning. Deleting a note does not erase old encrypted operation history or backups; permanent erasure is not implemented. No real personal-memory migration is approved.

## Offline and workspace boundary

The isolated prototype adapter retains tasks/events/preferences and up to 200 queued operations in IndexedDB; it never writes to the dashboard's existing localStorage key. Only static shell files enter Cache Storage. Authentication is required to replay edits after reconnect; retain drafts on failure or expiry. Background browser execution is not guaranteed on iPadOS; sync in the foreground/on resume.

The display identity remains `owner`, while authenticated login/session/snapshot/mutation responses now carry `binding: {subject_id,workspace_id,generation}` (independent 32-character lowercase hexadecimal IDs). Every mutation MUST include the same binding. The server checks it under the owner lock before any idempotency lookup or write: 428 `binding_required` for missing metadata, 412 `binding_mismatch` for another user/workspace/restore generation. API paths remain v1; this stricter prototype contract intentionally rejects older unbound writers. Deploy client/server/schema together only after review; older clients fail closed rather than bypass binding.

The adapter stores binding with its cache and every queued operation. IndexedDB readwrite transactions serialize changes across tabs; optional BroadcastChannel only invalidates stale views. Duplicate transmissions are safe through server idempotency. Stale snapshots cannot replace newer records, and a shared cache epoch rejects late responses after logout/workspace switching. Conflicts keep drafts; concurrent local edits of one record are rejected until its pending edit resolves. No Web Locks dependency.

On binding mismatch, retain all old records/drafts and stop replay. Nonempty legacy caches without a binding also stop. `exportLocal()` exports active/quarantined cache values; export contains personal plaintext and requires owner-controlled storage. `switchWorkspace(expectedBinding)` is an integration API requiring explicit caller confirmation, not an automatic handler: it rechecks the authenticated target and atomically archives the former state without relabeling it. No visual integration was changed. See SECURITY-OPERATIONS.md for schema migration, logout races, iPad limits and raw-database-clone caveats.

## Errors and disabled capabilities

Errors use JSON `{error,...}`. 400 invalid JSON; 401 reauthenticate; 403 rejected Origin/CSRF/Host or disabled control; 404 missing route; 405 method; 409 conflict; 412 binding mismatch; 413 size; 415 content type; 422 validation; 426 HTTPS required; 428 binding required; 429 backoff; 503 generic unavailable/configuration/ciphertext failure. Retain unsynchronized edits on errors. Do not log passwords, raw cookies, note payloads or exception internals. API responses use no-store.

`GET /api/v1/devices` exposes browser-session activity only, with null CPU/GPU/RAM/temperature. It does not prove PC power state. `/api/v1/control...` is denied and `/api/v1/ai` returns 501. No command queue, arbitrary shell execution, paid API or Tailscale Funnel exists.

## Backup, release and rollback

`bin/backup.php export` creates a bounded authenticated encrypted logical archive outside public roots. Preserve its encryption key separately. `restore-local` supports empty isolated SQLite or strictly loopback disposable `jarvis_test_<hex>` MariaDB targets only; no production/Hostinger restore is enabled. It excludes sessions/rate buckets, preserves record/retry revisions, creates a fresh generation, rejects tampering and refuses overwrite. Format 2 preserves subject/workspace; format 1 gains fresh identity metadata. Optional JARVIS_BACKUP_DATA_KEY decrypts the old archive while JARVIS_DATA_KEY encrypts the new target, allowing a copy-and-verify key rotation drill. Source/archive remain unchanged. Local PHP 8.3/MariaDB tests verify new-key ciphertext, concurrency, least-privilege runtime and source invariance. These are not hosted integration results.

Hosted restore drill remains blocked pending owner approval, restricted credentials, native sodium and reviewed host-specific tooling. Validate schema/archive/key and compare synthetic live/deleted/Nepali records, revisions/retries, excluded sessions, fresh generation and source invariance. Never restore over the source or an existing website database. Keep rollback release files and the staging 403 gate. Main merge, access-gate removal and runtime changes remain separate approval steps. CLI-only local password rotation/recovery is documented in SECURITY-OPERATIONS.md; no public recovery route exists. Long-lived sessions, MFA and passkeys are proposals, not active features.
