# Claude integration contract — current backend, not deployed

This documents the implemented v1 API. It does not authorize production integration. Existing dashboard/Claude UI, storage keys and visual assets remain untouched. Use same-origin HTTPS; cross-site credential requests from GitHub Pages are intentionally unsupported. The staging 403 gate remains until independently approved setup is complete.

## Authentication and sessions

`POST /api/v1/auth/login` accepts `{username,password,device_name}`. Successful login returns `{identity:'owner',session_id,csrf,expires}` and a host-only `__Host-JarvisSession` Secure/HttpOnly/SameSite=Strict cookie. Password creation requires 14–72 UTF-8 bytes; bcrypt cost is 12. Device label is at most 80 UTF-8 bytes. Sessions have a 12-hour absolute lifetime and 30-minute idle timeout, maximum 20 active sessions. Device labels identify browser sessions, not authenticated hardware.

`GET /api/v1/session` returns the current session ID, identity, expiry and derived CSRF. Keep CSRF in page memory, never store cookies/bearers in browser storage. Authentication is cookie-based. Every POST except login additionally requires `X-CSRF-Token`. All POSTs, including login, require the exact application Origin and JSON Content-Type. Host must match the configured origin. No CORS permission is issued; redirects must not forward credentials to another origin.

`POST /api/v1/auth/logout` accepts `{}` and revokes the current session. `GET /api/v1/sessions` lists active session metadata; `POST /api/v1/sessions/revoke` accepts `{id}`. Mutation-time session revalidation and revocation share the owner transaction lock. A write ordered before revocation can finish; a write ordered after revocation is rejected. Revocation cannot erase previously downloaded offline data.

Login limits: 10 attempts per peer IP/15 minutes and 100 aggregate/15 minutes. Session budget: 600 requests/10 minutes. Do not trust forwarded IP headers. No open registration, password-reset endpoint, passkey or MFA exists. Do not invent a recovery shortcut; password/key recovery and rotation need a separately reviewed CLI procedure, an encrypted backup and explicit session revocation before real use.

## Shared data

`GET /api/v1/sync` returns `{revision,records}` for task/event/preference records, including tombstones, read atomically. `GET /api/v1/memory` returns notes only; do not cache them offline or include their text in client logs.

Each record is `{kind,id,revision,deleted,data}`. Mutation:

```json
{
  "operation_id": "49f08200-a659-4bcb-bcd1-17335607d6f7",
  "kind": "task",
  "id": "example-task",
  "base_revision": 0,
  "deleted": false,
  "data": {"text": "Synthetic example", "done": false}
}
```

`POST /api/v1/sync` returns `{record}`. IDs contain lowercase ASCII letters/digits/hyphen/underscore, at most 100 characters. Operation IDs must use grouped lowercase hexadecimal UUID shape. Base revision must be a nonnegative integer; zero creates an unseen record. Tasks accept text (720 UTF-8 bytes) and boolean done. Events accept text (480 bytes), valid date `YYYY-MM-DD`, time `HH:MM`, normalized to Asia/Dubai. Preferences accept language `en-GB` or `ne-NP`. Notes accept text (4000 bytes). Deletion keeps a tombstone and requires the current revision.

After an uncertain network outcome, retry the **same operation ID and identical normalized payload**. A duplicate successful operation does not create another write; its response contains the latest canonical record, which may be newer or deleted. Do not expect a byte-identical historical response. A stale base returns 409 and the current record. Preserve the draft and require a user choice; an intentional replacement is a new operation ID based on the currently shown revision and can conflict again.

Limits: request 16 KiB, 1000 retained records/tombstones, 5 MiB current plaintext-equivalent content and 10000 retry-history entries. Limits reject new writes instead of silently deleting history. Do not schedule unreviewed tombstone/history pruning. Deleting a note does not erase old encrypted operation history or backups; permanent erasure is not implemented. No real personal-memory migration is approved.

## Offline and workspace boundary

The isolated prototype adapter retains tasks/events/preferences and up to 200 queued operations in IndexedDB; it never writes to the dashboard's existing localStorage key. Only static shell files enter Cache Storage. Authentication is required to replay edits after reconnect; retain drafts on failure or expiry. Background browser execution is not guaranteed on iPadOS; sync in the foreground/on resume.

**Known unresolved release gates:** identity is currently the literal `owner`; immutable workspace identity, restore generation and cross-tab queue coordination are not implemented. Do not repoint a cached origin to another database, automatically replay old queues after a restore, or treat simultaneous tabs as safe. Do not integrate production shared data before these gates are addressed.

Required future binding: persist an immutable workspace ID with all cached records/operations, and a restore generation independent of numeric revisions. The server must validate both inside the mutation lock. A mismatch must reject the write and preserve/quarantine the draft; clients must never silently relabel old queued operations to a new generation. A restore must revoke sessions and create a new generation. This is a design requirement, **not an existing v1 field/endpoint**. Implement as a reviewed versioned migration with compatibility tests before use.

## Errors and disabled capabilities

Errors use JSON `{error,...}`. 400 invalid JSON; 401 reauthenticate; 403 rejected Origin/CSRF/Host or disabled control; 404 missing route; 405 method; 409 conflict; 413 size; 415 content type; 422 validation; 426 HTTPS required; 429 backoff; 503 generic unavailable/configuration/ciphertext failure. Retain unsynchronized edits on errors. Do not log passwords, raw cookies, note payloads or exception internals. API responses use no-store.

`GET /api/v1/devices` exposes browser-session activity only, with null CPU/GPU/RAM/temperature. It does not prove PC power state. `/api/v1/control...` is denied and `/api/v1/ai` returns 501. No command queue, arbitrary shell execution, paid API or Tailscale Funnel exists.

## Backup, release and rollback

`bin/backup.php export` creates a bounded authenticated encrypted logical archive outside public roots. Preserve its encryption key separately. `restore-local` supports empty isolated SQLite targets only; it excludes sessions and rate buckets, preserves owner/record/retry revisions, rejects tampering and refuses overwrite. Local tests compare every durable row before/after restoration and confirm the source remains unchanged. This is not a Hostinger/MariaDB restore implementation.

Hosted restore drill: approve an isolated disposable target, export while holding the owner lock, validate the archive/key and schema version, restore with migration credentials into the empty target, compare synthetic live/deleted/Nepali records, revisions and retry history, exclude sessions, and verify source database invariance. Require the future generation binding before any restored target can accept offline writes. Never restore over the source or any existing website database. Keep rollback release files and the staging 403 gate. Main merge, access-gate removal and runtime changes remain separate approval steps.
