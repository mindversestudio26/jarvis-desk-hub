# Prototype security review and production gates

This is an implementation self-review plus automated negative/integration tests, not an independent penetration test or permission to deploy. No production changes have been made. Human review and actual Hostinger staging checks remain required.

## Boundaries reviewed

- No open signup, reset backdoor, provider key, exposed bootstrap URL or debug exception in API responses. Initialization is CLI-only and refuses to overwrite an owner.
- Password hashes use bcrypt cost 12, limited to 14–72 UTF-8 bytes on setup. Raw credentials are never stored by the frontend. Production refuses HTTP, sets host-only Secure/HttpOnly/SameSite=Strict session cookies and compares CSRF values using constant-time comparison.
- Exact Host/Origin checks, JSON-only state changes, prepared PDO queries and no permissive CORS. No trust in arbitrary forwarded-IP/HTTPS headers. The local insecure exception requires an explicit flag, loopback origin and loopback peer.
- Record encryption uses independent random nonces and binds kind/ID/revision as authenticated context. Session bearer values are hashed in the database. Notes and retry results are encrypted, although record types, IDs, timestamps, revisions and session labels remain metadata.
- Atomic revision checks and stable retry IDs protect uncertain/offline writes. Draft conflicts are retained; tombstones are not silently discarded. SQLite uses an immediate transaction; MySQL uses the owner-row lock and needs actual database validation.
- 16-KiB requests, 10-second PHP/API budget, 64-MiB PHP memory budget, bounded records/queues/history/sessions, login and session request limits. The HTTP client also times out.
- User text is inserted using text nodes. Strict self-only CSP, no eval/inline scripts, no external script/CDN dependency. The service worker caches only the engineering shell; no authenticated API payload enters Cache Storage. Private memory never enters the IndexedDB queue/state.
- No command executor, public device-control service, arbitrary URL fetch, AI callback, Funnel or unattended control queue exists. Browser-session timestamps are labelled separately from hardware readings.

## Findings addressed during development

1. Empty JSON object decoding originally rejected logout/control-denial requests; the parser now distinguishes an object from a JSON array correctly.
2. Immediate navigation could race a local IndexedDB save; input is cleared only after commit, local writes are serialized, failures retain the input and an in-progress-save navigation warning is installed. Browser tests wait for durable-save feedback before offline reload.
3. Unsafe SQLite placement under `public/` is rejected before database creation.
4. Lowercase record IDs avoid case-insensitive MySQL key aliases undermining context-bound encryption.
5. Server cookie attributes are checked from real response headers, and HttpOnly isolation is checked in both engines. Windows WebKit's cookie-inspection API reports `None` for SameSite even though headers specify Strict; do not infer physical Safari enforcement from that runner. Origin/CSRF rejection also protects write requests.

## Known limitations / before real personal data

- Single-owner identity is a fixed namespace, not a full multi-user/tenant system. Bind caches to an immutable account/workspace identifier before supporting account/database switching. Never repoint an origin to a different owner's database while old offline edits exist.
- Password recovery/rotation, passkeys/MFA and detailed security audit event retention are not implemented. No risky public reset mechanism has been improvised.
- Shared-host account compromise can reach the encryption key; this is not end-to-end encryption. Offline task/event data also relies on trusted-device protection. Do not place high-sensitivity memory in the prototype.
- Logical deletion retains tombstones and encrypted operation history; old values can survive in history/backups. Select and implement a retention/export/erasure policy before personal memory, rather than promise permanent deletion.
- The 10,000-operation cap needs reviewed maintenance. Tombstone pruning needs per-device checkpoints; do not simply schedule database deletion. No existing host cron job was changed or repurposed.
- MySQL/InnoDB integration, sodium/PDO activation on the host, HTTPS cookies behind Hostinger, CDN bypass for auth/API, session isolation under concurrent load and backup/restore remain staging gates.
- Real microphone/Siri/Nepali voice and physical iPad offline tests remain. Windows WebKit's simulated offline navigation is not used as proof.
- The engineering console is not integrated into Claude's UI. Same-origin migration/import and device-specific private monitoring/control are separate reviewed changes.

Verdict: useful isolated prototype with passing tests; **not approved for production deployment or personal-memory migration** until the listed gates and an independent review are complete.
