# JANGE shared-backend prototype — isolated development only

Current release preparation and exact approval boundary: [RELEASE-READINESS.md](RELEASE-READINESS.md). New private logging/gate/audit/restore-preparation source is locally tested and not installed on Hostinger. Earlier private CLI fixtures passed hosted core/export checks; HTTPS authentication remains blocked by the intentional public 403 gate.

Current backend hardening, updated test evidence, API retry semantics and staging gates: [HARDENING.md](HARDENING.md). The original baseline notes below remain historical where superseded by that report.

Actual Hostinger staging provisioning and evidence, including remaining deployment blockers: [STAGING.md](STAGING.md). The staging URL currently denies access; it is not a verified running backend.

Claude's implemented v1 integration boundary, error handling and workspace/generation and multi-tab contract: [API-CONTRACT.md](API-CONTRACT.md).

This directory is additive. It does not change JANGE's dashboard, service worker, storage key, Pages deployment or Claude's UI. Selected private CLI fixture files were deployed for the documented hosted tests; the authenticated HTTP API has not been exposed. The console is a test harness, not a replacement design.

## Implemented

- One owner account with a strong bcrypt password hash; independent, revocable device sessions. Twenty-session cap, 12-hour absolute lifetime, 30-minute idle timeout.
- Production `__Host-` Secure/HttpOnly/SameSite=Strict cookies; exact Host/Origin checks, CSRF tokens in page memory, prepared SQL, no CORS permission, bounded requests and login/session rate limits.
- Task, calendar and language preference persistence; full bounded snapshots, per-record revisions, idempotent operation IDs and retained deletion tombstones. Conflicting edits require a visible user choice.
- IndexedDB task/event cache and a 200-operation offline queue; shell-only service worker. Retried requests do not duplicate committed edits. Edits already pending cannot be changed again until synchronized/resolved.
- Explicit private notes encrypted using XChaCha20-Poly1305 with context-bound authentication. Notes and conversation history are never cached by the offline client; no conversations are recorded.
- Push-to-talk capability detection, typed English/Nepali commands, optional installed-voice synthesis and text fallback. Dictation text requires review before applying. Supported commands are deliberately limited to adding/listing tasks.
- Browser-session activity timestamps; all hardware metrics remain null. No computer-control or arbitrary shell execution implementation.
- AI endpoint deliberately returns 501: no provider calls, keys, automatic billing or personal-data transmission.

Encryption is **server-side, not end-to-end**. Someone controlling the hosting account and its key can decrypt records. Offline task/event data relies on trusted-device/OS/browser protection and is not encrypted by this prototype. Remote session revocation cannot recall already downloaded offline data. Use synthetic or low-sensitivity data until production review.

## Local start

Requires PHP 8.3+ with PDO SQLite and sodium; alternatively the PDO MySQL path needs a dedicated database and validation. Local compatibility is tested on PHP 8.3.35/SQLite. The separate disposable loopback MariaDB 11.8.9/PDO suite validates InnoDB transactions, concurrent writers, least-privilege runtime and empty-target encrypted restore. These are not Hostinger integration tests.

From this directory, create an ignored `state/` directory outside `public/`. Set process environment variables using a local secret-handling method:

| Variable | Value |
| --- | --- |
| `JARVIS_LOCAL_DEV` | `1`, loopback development only |
| `JARVIS_ORIGIN` | `http://127.0.0.1:8787`, no trailing slash |
| `JARVIS_DSN` | `sqlite:` plus the absolute path to `state/private.sqlite` |
| `JARVIS_DATA_KEY` | Base64 of 32 cryptographically random bytes, generated once and kept privately |
| `JARVIS_INITIAL_PASSWORD` | Owner-chosen 14–72 UTF-8 bytes for first initialization only |
| `JARVIS_OWNER_NAME` | Optional login name; defaults to `owner` |
| `JARVIS_SECURITY_LOG_DIR` | Existing dedicated private directory; mandatory for hosted API, optional locally. See bounded rotation/approval policy in RELEASE-READINESS.md. |

Generate a new development key locally with `php -r "echo base64_encode(random_bytes(32));"`. Do not paste keys/passwords into chat or Git. Preserve the key separately from database backups; regenerating it makes existing ciphertext unreadable. Initialization refuses to overwrite an existing owner.

```powershell
php bin/init.php
# Remove JARVIS_INITIAL_PASSWORD from the environment after initialization.
php -S 127.0.0.1:8787 -t public router.php
```

Open `http://127.0.0.1:8787` and sign in. Never bind the development server to `0.0.0.0`. If PHP extensions are installed but disabled, enable them only for this CLI command using your actual extension directory and `-d extension=pdo_sqlite -d extension=sodium`; do not alter global/hosting PHP settings during the audit.

## Tests

```powershell
python -m unittest discover -s tests -v
python tests/run_browser.py
python tests/run_browser.py multitab.cjs
```

API tests create a disposable private database, generate temporary credentials in memory, launch a loopback PHP process and clean up. `JARVIS_PHP_EXT_DIR` optionally points to installed DLLs/modules for CLI tests. Browser tests use Playwright from normal Node resolution or `JARVIS_PLAYWRIGHT`; `JARVIS_CHROME_CHANNEL=chrome` selects installed Chrome. `JARVIS_TEST_OUTPUT` controls fixture-only screenshots/results. No user credentials are required.

The three release tests additionally use installed OpenSSL (`JARVIS_OPENSSL_BIN` can select it) for an isolated loopback TLS fixture; no OS/browser CA trust changes occur. The complete local suite is now 41 tests. `tests/hosted_https.py` is inert without `--execute`; no hosted execution is authorized by running the local suite.

38 API regressions cover restart persistence, binding/generation, session/password recovery, new-key restore, legacy archives and production HTTP/private-path guards. The two-tab suite tests durable queue serialization, lost acknowledgements and late responses after logout at 1080×810, including Windows WebKit without BroadcastChannel. Chromium and Windows WebKit pass the two-session functional suite. Chromium verifies offline reload/queued synchronization. Windows WebKit's offline simulator is not verified; its cookie-inspection API reports `None` despite the actual response header specifying `SameSite=Strict`. Both engines confirm HttpOnly isolation. Production HTTPS and physical Safari remain mandatory checks.

## API / integration boundary for Claude's UI

Use the same origin for UI and API. Direct third-party cookie calls from GitHub Pages to another domain are intentionally unsupported. For the eventual application origin, port the approved UI to that isolated root or provide a reviewed same-origin proxy. Do not change Pages or move existing user data automatically.

- `POST /api/v1/auth/login`: `{username,password,device_name}` → HttpOnly cookie, CSRF and session ID.
- `GET /api/v1/session`: session metadata and fresh derived CSRF token.
- `POST /api/v1/auth/logout`, `GET /api/v1/sessions`, `POST /api/v1/sessions/revoke` with `{id}`.
- `GET /api/v1/sync`: non-memory records, including tombstones and revisions.
- `POST /api/v1/sync`: `{binding,operation_id,kind,id,base_revision,deleted,data}`. IDs are lowercase ASCII letters/digits/hyphen/underscore, ≤100 characters. Operation IDs are UUID-shaped. Request ≤16 KiB. Conflict → 409 with the current record; retain the draft.
- `GET /api/v1/memory`: explicit online-only note retrieval.
- `GET /api/v1/devices`: browser session activity, never inferred CPU/power statistics.
- `POST /api/v1/ai`: disabled, 501. `/api/v1/control...`: denied, 403 after authentication.

Every POST requires exact Origin, JSON and (except login) `X-CSRF-Token`. Production requires HTTPS and removes the local-dev exception. Sessions use cookies, not frontend bearer storage. Tasks use `{text,done}`; events use `{text,date,time}` and are normalized to Dubai time; preferences currently support `{language:'en-GB'|'ne-NP'}`; notes use `{text}`. The existing dashboard's version-2 backups are accepted through explicit console import, without writing to `jarvis.desk.v2`. Import a backup only once; imports add fresh IDs.

This is a **single-owner, single-database prototype**, not a multi-user account system. Do not switch an origin to a different owner's database with old cached edits present. Immutable subject/workspace/generation binding and IDB multi-tab coordination are implemented in the prototype adapter. CLI password rotation/recovery and new-key copy/restore are limited to isolated drills. Passkeys/MFA, persistent-device refresh sessions, encrypted offline cache, private host log rotation and production administration remain release gates. See [SECURITY-OPERATIONS.md](SECURITY-OPERATIONS.md) for migration, recovery, retention, grants and reviewed future-session proposals. No public reset shortcut exists.

Limits: 1,000 retained records/tombstones, 5 MiB of current plaintext-equivalent record content, 10,000 encrypted retry-history entries, 20 sessions, 10 login attempts per IP/15 minutes and 100 aggregate/15 minutes, 600 requests per session/10 minutes. Retry history is currently retained until reviewed maintenance; deleting a note creates a tombstone but does not erase historical encrypted retry entries/backups. No permanent-erasure promise is made. A maintenance/retention policy is required before real personal memory is enabled. Record caps deliberately stop writes rather than silently purge offline tombstones.

## Future hosting gates

Keep the current beauty website and DNS intact. After explicit owner approval, create a separate Jarvis origin/document root and database. Point only that root to `public/`; keep `src/`, schema, keys, SQLite files and administration scripts outside every webroot. Hostinger can supply PHP and managed Node.js, but this prototype does not need a resident Node process or WebSockets.

For MySQL use an isolated InnoDB database and DSN with `charset=utf8mb4`, then run the entire test contract against it. Verify sodium and PDO driver activation, HTTPS cookie behavior, bypass CDN caching/challenges for authenticated API paths, test backups and review file permissions. Current shared-host defaults are not a substitute for application session settings. Never deploy the engineering console on top of the existing website, copy secrets into the public GitHub repository, enable Funnel, change mail DNS, or merge without review.

See [architecture](architecture.md), [AI and voice feasibility](ai-voice-feasibility.md), and [security review](security-review.md).

Portable MySQL drill: set JARVIS_MARIADB_BIN and JARVIS_PHP_BIN to verified official Windows binaries, then run `python tests/run_mysql.py`. The harness creates its own authenticated loopback server/databases/runtime user, tests transactions and restores, then shuts it down. It does not accept an existing hosting DSN or install a Windows service. Never use personal data.
