# Hostinger staging evidence and installation boundary

## Actual private Hostinger core verification — 2026-10-16

After the owner entered the existing verification credential directly into the private 0600 file, the CLI fixture ran on Hostinger. Its sanitized result reports **PASS, 25 checks**, PHP **8.3.35**, database **11.8.9-MariaDB-log**. This verifies actual native Sodium authenticated encryption/decryption and tamper rejection, PDO connection/schema checks, restricted grant allowlist/no visible global privileges, initially empty tables, rollback, idempotent retry, tombstone preservation, stale-write conflict, generation rejection before retry lookup, core CSRF validation, hashed session-token authentication, expiry/revocation and independent PDO-connection owner locking. Only synthetic fixture data was inserted.

The host-generated 32-byte key, credential, claims and reports remain outside public_html with restrictive permissions. Actual schema grants include the two disclosed metadata/history privileges; this is not an exactly-four-grant result. Separate website roots/0700 files do not establish isolation from another process running as the same Unix account.

Automatic approval review initially rejected a recurring every-minute schedule as broader than a one-shot execution. No job was created by that rejected action. The owner then explicitly approved a temporary every-minute private test cron with removal after results. One incorrectly saved hourly definition was removed before running; the corrected every-minute job produced the report and was then removed. The three pre-existing automation schedules remained unchanged. No web access exception was introduced; public staging stayed denied.

**Not verified by this CLI result:** real HTTPS login/cookies/security headers, concurrent HTTP requests, browser offline/multi-tab behavior on Hostinger, physical iPad Safari, password recovery/key rotation on Hostinger or a separate hosted database restore. The fixture's two independent connections prove owner-row lock exclusion, not concurrent HTTP scheduling. Local browser and restore results remain separate evidence. The old staging database and its earlier schema remain untouched; the current schema exists only in the disposable verification database.

The unchanged existing `bin/backup.php export` was then executed through a separately guarded private verifier against the same synthetic database. **Seven hosted checks PASS:** export, authenticated format 2, owner/records/retry history matching the source, excluded sessions/rate buckets, nested ciphertext authentication, archive tamper rejection and unchanged archive after verification. The archive/key/report remain private (0600); no archive or key was published. No hosted restore occurred. The temporary backup cron was removed after the result; only the original three jobs remain.

Independent review identified a check-then-act race in the backup verifier's first draft, where overlapping schedules could overwrite a PASS report with FAIL. Before hosted execution, it was replaced by exclusive `backup.claim` creation. Two parallel local processes now prove one claimant succeeds, the other exits without writes, and later runs preserve the report. Local PHP 8.3.35/MariaDB 11.8.9 transaction/concurrent-writer/new-key-restore drills passed again after this fix; independent re-review found no remaining actionable issue.

Next gates: design/review a private HTTPS test path without relaxing the existing public deny-all gate; provision a separately approved empty restore target and narrowly reviewed hosted restore tool; assess the two residual MariaDB grants, same-Unix-account isolation, private logging/rotation and separate key custody. Production remains unready. Rollback requires stopping only these test schedules (already removed), retaining private evidence/archive/key and the public gate, and leaving the original database/site untouched. No automatic migration or restore over an existing database is authorized.

## Earlier disposable verification preparation — 2026-10-16 (superseded above)

The owner created the separate `jarvis_verify` database and `jvverify` user. Only this empty disposable database received the current five-table schema, including immutable subject/workspace and restore-generation columns. Authenticated SQL verified MariaDB 11.8.9, all five tables using InnoDB/utf8mb4_bin, and an INSERT/UPDATE/ROLLBACK drill leaving zero fixture rows. The older staging database was preserved.

The new user's visible DDL/routine permissions were removed through its scoped permission form. A subsequent SQL query found SELECT, INSERT, UPDATE, DELETE **plus DELETE HISTORY and SHOW CREATE ROUTINE**; all showed IS_GRANTABLE=NO. The panel's four checked boxes therefore do not establish exactly four effective grants. These two additional MariaDB privileges remain an explicit least-privilege limitation to assess; no global-grant absence has yet been demonstrated on Hostinger. The private runner reports the actual schema grant list and refuses unexpected grants/global privileges.

A reviewed CLI-only `tests/hosted.php` fixture and unchanged backend core were prepared in a new owner-only (0700) directory outside `public_html`. Its password file is owner-only (0600), initially empty; the owner must enter the existing verification user's password directly in File Manager, never chat/Git. A server-generated key will remain private. The runner refuses non-CLI execution, unexpected database names/grants, a previously claimed run or any nonempty application table before initialization. It writes only synthetic records, fails closed and reports no credentials or raw exceptions. No public runner or API exception was installed. No new cron has yet been activated.

The exact runner passed on disposable local PHP 8.3.35/MariaDB 11.8.9, including encryption/tamper, idempotency, deletion conflicts, generation rejection, CSRF/session expiry/revocation and a two-connection InnoDB lock check. Repeat execution preserved its original report. The existing independent-writer 200/409 and encrypted new-key restore drills also passed again. These are local tests, **not hosted PHP/PDO successes**. Authenticated hosted SQL checks do not verify application cookies/HTTPS authentication, real hosted PDO, browser multi-tab behavior or hosted backup/restore.

At 03:49 UTC, certificate-verified HTTPS checks returned Glow root/www 200 and staging 403. Production, other website files, email/DNS and Claude's frontend were not changed. Historical sections below describe earlier gates; this dated update supersedes their statements about the verification database not yet existing.

## Native sodium enabled — 2026-10-16 03:32 UTC

The owner subsequently instructed "enable sodium and go on, we will revert if needed", superseding the worker-uncertainty hold for the selected staging website. Only sodium was selected on jarvis-staging.glowwithimane.com's extension page: a before/after comparison of all 128 controls found exactly one change. Save completed after dismissing a feedback overlay; no PHP version/options/reset action was used. Authenticated PHP Info then reported PHP 8.3.35, sodium support enabled and libsodium headers/library 1.0.18. This is native runtime evidence, not merely a checked UI box. Runtime encryption roundtrip/application integration remains a separate test.

Before activation at 03:30 UTC and after at 03:32 UTC, normal TLS checks returned 200 for Glow With Imane/root+www and the intentional 403 for staging. No observed endpoint error required rollback. This does not certify no transient worker reload or every website's health. The original website, mail/DNS and other PHP settings were not edited.

Hosted PHP Info lists system/exec/shell_exec/passthru/popen/proc_open among disabled functions. The authenticated cron panel provides a private PHP execution option; its existing automation jobs were inspected as inventory only and not changed. No public authentication/API exception or new cron was created. A fresh disposable verification database form was prepared with suffix jarvis_verify and user jvverify, preserving the prior staging database. Its password was left blank for owner-controlled creation; no new credential was generated, entered or submitted by the agent. Actual PDO application tests still require that credential, private config/execution setup and verified runtime grants. Native sodium activation alone is not a successful application test or production-readiness certification.

## Conditional sodium activation check — 2026-10-16 03:26–03:29 UTC

The owner explicitly authorized sodium activation on staging only, conditional on no shared-worker impact. Read-only reinspection found PHP 8.3.35 and active PDO MySQL/OpenSSL module sections; no sodium section was present in the authenticated PHP Info diagnostic. The PHP extensions page was inspected without toggling anything; Save remained disabled. A local non-secret snapshot of 128 extension controls was retained as a pre-change baseline, not a full hosting/files/database backup.

Normal certificate-verified HTTPS requests returned 200 for Glow With Imane and its www alias, and the intentional 403 for staging. These observations establish those endpoints' availability, not all hosted websites' health or absence of potential worker impact. No unrelated website/repository was changed.

Dwi's reviewed answer confirms per-selected-website extension settings and no customer-managed php.ini/FPM pool. It does not explicitly answer whether sodium saving can reload workers serving other websites. A focused read-only human follow-up was submitted; Kirby's review is pending. Support was explicitly denied permission to activate, restart, deploy, upgrade or change settings. Pending that account-specific worker statement, the owner's safety condition is not satisfied: no activation, shared PHP change, access-gate exception, backend deployment or hosted application test was performed. Do not treat conditional staging approval as permission to accept uncertain shared impact.

The last implementation remains the tested binding/recovery backend. Hosted API/authentication/cookies/CSRF, runtime-user grants, concurrent PDO writes, encryption/tamper and separate-database restore are still unverified. Earlier local tests and MariaDB integration must not be presented as new hosted successes. Continue only after written worker scope is resolved; then apply the already-authorized staging-only sodium change within its verified scope and verify actual runtime before installing a securely gated test environment. Runtime credential entry remains an owner handoff; no public API/auth route is authorized.

## Actual infrastructure, 2026-10-16

The owner authorized isolated staging, not production. A separate empty PHP/HTML website was provisioned on the existing plan at `jarvis-staging.glowwithimane.com`; the old website's subfolder-based subdomain flow was avoided. Its scoped file manager shows a separate `public_html` with a new default placeholder. The absolute server path and OS-level isolation are not yet verified. Separate website roots do not imply separate Unix accounts.

One new staging database and a migration user were created by the owner. No password was read or copied into source, logs or this report. phpMyAdmin initially confirmed no tables. Database-scoped migration then created the five application tables, verified as InnoDB with `utf8mb4_bin`. Database default charset/collation were verified as `utf8mb4` / `utf8mb4_bin`. No owner/login account or personal records have been initialized.

The actual server reports MariaDB `11.8.9-MariaDB-log`, with InnoDB DEFAULT and transactions YES. A synthetic insert/update inside an explicit transaction followed by ROLLBACK left zero fixture rows. This is a SQL engine smoke test, **not** verification of the application's PDO transaction/concurrency contract.

Hostinger's authenticated PHP Info diagnostic reports PHP 8.3.35 CGI/FastCGI, PDO MySQL/SQLite and OpenSSL 3.5.8. Sodium has no active module section. This diagnostic does not replace an actual deployed application probe. No public phpinfo endpoint was created. Diagnostic `log_errors` is Off and the default log mode is 0644; a private application log and rotation remain required. Native sodium activation must be verified before encryption is considered usable.

An HTTPS HEAD request with normal certificate verification succeeded. The staging-only `.htaccess` now deliberately denies all requests. A second HTTPS check returned 403 with `Cache-Control: no-store`, nosniff, no-referrer and DENY framing headers. Application files, credentials and authentication are not deployed. Do not describe this URL as a working backend. The staging dashboard indicates CDN off; responses still traverse Hostinger's hcdn edge, so cache behavior must be tested directly.

The original domain's DNS baseline was read before provisioning: root/www on Hostinger CDN; Titan MX/SPF/DMARC and existing nameservers. Only the newly authorized staging hostname was provisioned. No existing website files, unrelated records, email settings or protected repositories were changed. Existing hosting dashboard backup evidence shows a daily backup dated 2026-10-15 00:20; restoration is unverified.

## Reversible backend changes

- `schema.mysql.sql` explicitly selects InnoDB and utf8mb4_bin; `init.php` selects the correct driver-specific schema.
- API and CLI preflight reject incomplete MySQL tables or incorrect engine/collation. MySQL DSNs must specify utf8mb4. Existing incompatible tables are never silently converted.
- `config.local.php`, outside `public`/`public_html`, can supply server-only settings when environment injection is unavailable. Environment variables take precedence. The loader rejects configuration under detected document roots; this filename remains Git-ignored. Never put secrets in the public directory or publish this file.

The latest local suite has 38 API regressions on PHP 8.3.35/SQLite, plus Chromium/WebKit multitab tests and a disposable loopback MariaDB 11.8.9/PDO transaction/restore contract. See SECURITY-OPERATIONS.md for binding/schema migration and recovery; no Hostinger schema migration was applied. Chromium and Windows WebKit backend suites pass; Chromium offline replay passes. These are **local**, not Hostinger application integration results. Physical Safari and Windows WebKit offline simulation remain unverified.

## Remaining deployment gates

1. Confirm a staging-only sodium activation path. The extension form describes account scope; do not assume a site-labeled panel guarantees site-only effects. No extension/version change was saved. The owner explicitly chose to confirm staging-only scope first. With owner-authorized read-only support contact, a Dwi-reviewed answer now confirms per-selected-website extension settings and no customer-managed php.ini/FPM pool. Other sites' settings/files are not expected to change, but exact worker-reload scope remains unspecified. No activation was approved or performed.
2. Establish a restricted runtime user distinct from migration credentials, or document an approved equivalent credential/role transition. The newly created migration user currently has database-scoped DDL permissions. Never use that credential in a public application. Verify runtime SELECT/INSERT/UPDATE/DELETE only and migration access removal after setup.
3. Set runtime origin, utf8mb4 DSN, runtime database user/password and independently generated 32-byte data key in private server configuration with restrictive permissions. Preserve the key separately. Credential creation/entry is an owner handoff; do not request passwords in chat. Run CLI initialization with a separately supplied initial owner password, then remove it.
4. Set an absolute private error-log path, verify file permissions and rotation. Do not allow an `error_log` file in the public root. No plan-wide PHP setting or unrelated cron job may be changed as a shortcut.
5. Deploy reviewed backend files outside the public root and only intended public files inside it. Retain the deny-all gate until an independent staging access gate is configured and tested. Do not upload the whole repository into public_html. Chrome file upload was blocked by extension file-URL permission; file-manager editing was used for the gate without expanding browser permissions.
6. Run actual PHP/PDO API tests over HTTPS with two sessions, CSRF/Host/Origin failures, expiration/revocation including concurrent writes, idempotency, tombstones and cache bypass. Validate storage permissions with negative DDL attempts only on the dedicated fixture database.
7. Review the implemented subject/workspace/generation binding and multi-tab IDB adapter before integrating Claude's UI. Existing hosted schema is still v1 and needs a separately approved migration. No Claude UI assets have been changed.
8. Export an encrypted consistent staging backup and restore into a separately authorized disposable database, excluding sessions; compare decrypted records, revisions and tombstones. The existing `restore-local` command intentionally supports empty local SQLite or strict loopback disposable MariaDB drills only. No Hostinger/MariaDB restore success is claimed.

## Private configuration layout

Use the staging site's actual verified parent directory as the private release root:

```text
staging-site/
  config.local.php      # owner-entered secrets; not Git; restrictive permissions
  src/core.php
  bin/init.php
  bin/preflight.php
  bin/backup.php
  schema.sql
  schema.mysql.sql
  state/                # private logs/exports; never public
  public_html/          # intended public files only; staging access gate
```

Allowed runtime settings are `JARVIS_ORIGIN`, `JARVIS_DSN`, `JARVIS_DB_USER`, `JARVIS_DB_PASSWORD`, `JARVIS_DATA_KEY`, `JARVIS_LOCAL_DEV`. Production-like staging must use HTTPS and `JARVIS_LOCAL_DEV=0`. Do not trust client-supplied forwarded headers as proof of TLS.

## Rollback

Keep the deny-all gate active while installation is incomplete. Existing production systems need no rollback because none were altered. To pause staging, retain the 403 gate and preserve its database/key privately. Do not drop the database or remove the site automatically: those are destructive cleanup steps requiring a separate decision. Before any later release switch, export and verify a backup; never restore over an existing database. A data restore requires a new generation and explicit reconciliation/quarantine of old offline queues. PR #1 remains draft and must not merge into main without separate approval.

## Claude integration

The same-origin v1 API contract remains in README/HARDENING. Successful idempotent retries return the latest canonical record; 409 retains drafts; 401 requires reauthentication; 429/503 retain pending edits. Cookies are HttpOnly and CSRF stays in page memory. Notes are online-only, hardware metrics remain null, and all PC controls remain disabled. Staging infrastructure availability does not indicate application readiness or permission for personal-data migration.
