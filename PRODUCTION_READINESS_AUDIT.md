# Wangui Beauty Bar Production Readiness Audit

> Historical snapshot from 2026-10-17. Subsequent work added versioned migrations, fixed verification scripts, hardened video uploads, and verified local booking/video flows. See [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) for the current status.

**Audit date:** 2026-10-17  
**Scope:** Read-only inspection of the existing workspace and non-destructive syntax/type checks. No source files or dependencies were changed, no database connection or schema operation was attempted, and no payment requests were made.

## Executive summary

This workspace is a single TypeScript browser application served by a custom Node.js HTTP server. The server code contains a PostgreSQL-backed appointment-request flow, a single shared staff/admin password login, status updates, and a local-disk video upload/delete API. It is not a collection of separate frontend applications or portals.

The TypeScript no-emit check and Node syntax check pass. The application could not be verified end-to-end: its server initializes PostgreSQL and runs DDL before listening, so starting it would violate the instruction not to run database schema operations; no database connection was tested. The existing DOM verification scripts stop immediately because `jsdom` is missing from the installed dependencies. No actual M-Pesa integration, Prisma schema/migrations, customer accounts, separate staff/creator roles, deployment configuration, or production backup setup was found.

**Production status: not ready to launch with confidence.** The most important immediate blockers are to establish a safe, versioned database deployment process; verify the booking system against a non-production database; and decide and implement the required account/role scope before granting staff or creators access.

## 1. Existing architecture and technology stack

- **Frontend:** One hash-routed, single-page application in `css/`, authored in TypeScript and served from its generated JavaScript files. It has home, department/service, gallery, booking, calendar, admin, and video-management routes. See [css/app.ts](./css/app.ts), [css/router.ts](./css/router.ts), and [css/views.ts](./css/views.ts).
- **Backend:** A single custom Node.js ES-module server in [server.mjs](./server.mjs), using Node's built-in HTTP, filesystem, and crypto APIs. It serves static assets and implements JSON and multipart endpoints.
- **Database:** PostgreSQL via the `pg` package. Connection options are `DATABASE_URL` or `PG*` variables. The server creates the `bookings` table and an index on startup if they do not exist; no Prisma files or versioned migration set were found. See [server.mjs](./server.mjs) and [package.json](./package.json).
- **Media:** Existing MP4 files live under `video/`; the gallery catalogue is [css/videos.json](./css/videos.json). The upload API writes new video files to that same local directory.
- **Dependencies and scripts:** One root `package.json`; runtime dependency `pg`, dev dependency `typescript`. Scripts are `build`, `start`, and `watch`. There are no separate frontend/backend package manifests, test runner, deployment manifest, or lockfile-based test dependency for `jsdom`.
- **Configuration:** Business and service information is embedded in [css/config.ts](./css/config.ts) and [css/services.ts](./css/services.ts). [.env.example](./.env.example) documents local PostgreSQL, admin-password, port, and environment settings; it contains placeholders, not live credentials.

## 2. Feature status

“Implemented” below means code exists; it does **not** mean production runtime behavior was proven.

| Feature | Observed state | Verification status |
|---|---|---|
| Marketing site, service pages, categorized video gallery and filters | Implemented in the SPA; 14 services and 20 catalogue entries are defined. | Not browser-verified. Existing gallery checks require missing `jsdom`. |
| Customer registration and login | No account registration or customer login routes/API were found. | Not implemented. |
| Customer booking request | Form posts customer details to the server. Server validates service, date, time, opening hours, duration, and overlapping requests, then saves a pending request. | Code path exists; DB write and live request flow unverified. |
| Customer appointment management | Customer receives a request ID and can continue to WhatsApp. No customer-authenticated listing, cancellation, or rescheduling flow was found. | Not implemented. |
| Staff booking management | One password-protected dashboard reads requests and changes status. `/calendar` and `/admin` both render this same dashboard. | Code path exists; login, cookie, DB reads/writes, and concurrent use unverified. |
| Staff and creator portals/permissions | No distinct staff accounts, roles, creator portal, or role-specific authorization were found. Video management is another route behind the same admin check. | Not implemented as separate roles/portals. API-side admin checks exist for booking reads/updates and video mutations. |
| Video upload and deletion | Admin-gated API writes/deletes MP4 files and updates `css/videos.json`; public API reads the catalogue. | Code path exists; upload/deletion not exercised. Local-disk persistence and resource limits are unsuitable/unverified for production. |
| M-Pesa | No Daraja/STK Push, payment callback, transaction records, or payment endpoint was found. Booking fee is explicitly disabled in configuration. | Not implemented; no payment requests were made. |
| Prisma | No Prisma dependency, schema, or migration files were found. | Not present. |
| Production deployment, domain, TLS, and backups | README gives general requirements but the workspace has no host/domain/TLS setup or backup/restore automation. | Not configured or verified. |

## 3. Backend and database status

- **Backend startup:** `node --check server.mjs` passed. The server source calls PostgreSQL initialization (including `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`) before it opens its listener. It was deliberately not started because that initialization would perform schema operations. Therefore, successful runtime startup is **unknown**, not confirmed.
- **Database connectivity:** Unknown. No database connection was attempted. A health route exists and executes `SELECT 1`, but it cannot establish that the configured database is reachable from this environment.
- **Persistence:** Booking rows are designed to live in PostgreSQL, so they can persist if a durable PostgreSQL service is configured and backed up. There is no evidence here of a working production database, actual data preservation, recovery, or retention policy. Login sessions are held in a process-local `Map` and do not survive server restart or work consistently across multiple server instances.
- **Schema management:** The inline startup DDL is only an initial schema bootstrap. There is no versioned migration history or automated schema-drift check, and `CREATE TABLE IF NOT EXISTS` will not reconcile an existing table whose columns/constraints differ from the current code.
- **Checks run:** `node --check server.mjs` passed; `node_modules\.bin\tsc.cmd --noEmit` passed. No build output was emitted or overwritten.
- **Existing frontend checks:** `node verify-all.mjs` and `node check.mjs` both failed before running assertions because Node could not resolve `jsdom`. `jsdom` is not in the root dependency manifest/installed top-level dependency set. No packages were installed.

## 4. Security and operational concerns

The server includes several useful baseline protections: parameterized SQL, server-side booking validation, a constant-time comparison for the shared admin password, `HttpOnly`/`SameSite=Strict` session cookies, a `Secure` cookie when `NODE_ENV=production`, and basic process-local login/booking throttles. These are positive code-level observations, not proof of a secure deployment.

The main concerns are listed with severity, evidence, recommended action, dependencies, and verification in the findings table below. In particular:

- The single shared password cannot provide distinct staff/creator permissions or per-person accountability.
- Login/session/rate-limit state is process-local; it is lost on restart and is not shared across replicas.
- Video multipart bodies are buffered fully in memory without a request/file size limit. Files are accepted by `.mp4` filename extension alone and stored on the application filesystem.
- Booking records contain names, phone numbers, appointment details, and optional notes. The code includes a brief scheduling-use notice, but no full privacy notice, retention/deletion workflow, or demonstrated access/backup policy was found.
- No configured hosting, HTTPS certificate, public domain, production environment, monitoring, or tested backup/restore procedure was found.

## 5. Booking and payment readiness

Booking requests are not simply WhatsApp messages: the client submits them to `/api/bookings`, and the server attempts to store them in PostgreSQL before offering a WhatsApp continuation link. The server checks for overlapping requests while holding a per-date PostgreSQL advisory transaction lock, and staff can change a booking to pending, confirmed, declined, or completed.

This workflow is **implemented but not runtime-verified**. It depends on a reachable PostgreSQL database and the startup schema matching the code. The current customer experience does not include registration, account login, customer appointment history, or self-service cancellation/rescheduling. Staff confirmation still occurs outside the platform through WhatsApp.

There is no M-Pesa implementation. The current booking experience does not collect payment or booking fees. Before adding payments, the business must specify deposit/full-payment behavior, payment reconciliation/refund rules, and the official Daraja environment/credentials; integration and callbacks must be tested in sandbox before any live request is considered.

## 6. Production deployment requirements

Before a public launch:

1. Choose a Node.js host that supports the required Node version (README specifies Node.js 20 or newer), persistent PostgreSQL connectivity, durable media storage, environment secrets, and an HTTPS custom domain.
2. Configure `PORT`, `NODE_ENV=production`, a strong unique `ADMIN_PASSWORD` of at least 12 characters if retaining the current login, and either `DATABASE_URL` or the required `PG*` settings in the host's secret/environment manager. Never put real values in the audit, source, or committed files.
3. Use a dedicated, least-privilege database role. Establish versioned schema migrations and an explicit deployment/rollback procedure instead of relying on implicit startup DDL.
4. Decide whether media will use durable object storage/CDN or an explicitly persistent mounted volume. Confirm that deployments, restarts, and multiple instances will not lose uploads or diverge on `videos.json`.
5. Configure DNS for the chosen domain and HTTPS/TLS at the hosting platform or trusted reverse proxy. Confirm redirects, secure cookies, and browser behavior over HTTPS.
6. Set up automated database backups, retention, access controls, monitoring/alerts, and a documented restore drill. Decide how customer booking PII is retained, deleted, and handled under the salon's privacy obligations.
7. Confirm the salon owner has verified all business details, service descriptions/prices/durations, contact details, opening hours, privacy text, and operational booking/WhatsApp process.
8. Run reproducible frontend/backend checks, then test booking, overlap rejection, admin sign-in/status changes, upload limits, and recovery against a staging database and staging media store.

The existing [README.md](./README.md) already describes basic local PostgreSQL setup, the environment variables, HTTPS, and the need for persistent hosting/backups; it does not provision or verify those services.

## 7. Findings and prioritized staged plan

Severity describes launch impact: **High** blocks or materially risks production operation; **Medium** creates material operational/security risk or leaves an important requirement unimplemented; **Low** is a smaller readiness gap. No critical exploitable issue was confirmed by this read-only review.

| ID | Severity | Problem and evidence | Recommended fix | Dependencies | Verification steps |
|---|---|---|---|---|---|
| F1 | High | Runtime readiness is unknown: [server.mjs](./server.mjs) performs PostgreSQL DDL before listening; no database connection/startup was tested. The existing schema setup has no versioned migration history and does not reconcile drift. | In an approved follow-up, define versioned migrations and a documented staging deployment path; verify the schema before enabling the application listener. Then test against a disposable/staging database, not production data. | Approved database target and migration/deployment approach. | Apply migrations to an empty staging DB and a representative prior-schema DB; verify startup, `/api/health`, booking insert/read/update, and restart persistence. |
| F2 | High | Customer registration/login and authenticated self-service appointment management are absent; [css/views.ts](./css/views.ts) exposes only a booking form and a shared staff dashboard. | Confirm whether customer accounts are required for launch. If required, implement identity, secure session lifecycle, and customer-scoped appointment list/cancel/reschedule operations; otherwise explicitly scope launch to guest requests and WhatsApp confirmation. | Product decision on guest booking versus accounts; privacy and retention requirements. | Test registration/login or guest flow as selected; prove a customer cannot view/change another customer's booking; exercise cancellation/rescheduling rules. |
| F3 | High | There are no separate staff, admin, or creator identities/permissions. `/admin` and `/calendar` render the same dashboard; login uses one `ADMIN_PASSWORD` for all authorized actions in [server.mjs](./server.mjs). | Decide required roles and implement per-user identity and server-enforced least-privilege authorization for bookings and video management. Avoid relying on hidden routes or client UI for access control. | Role/permission matrix and account lifecycle/ownership decision. | Test every role against each API operation, including unauthenticated and cross-role denial; verify account disablement, logout, and audit attribution. |
| F4 | Medium | Sessions and throttling are in-memory in [server.mjs](./server.mjs), so they reset on restart and do not coordinate across replicas; the shared password has no individual credential rotation or recovery. | As part of the chosen identity design, use a durable/shared session or identity provider and a distributed rate-limit strategy. Document credential rotation and account recovery. | F3 identity/role design; hosting topology. | Restart and multi-instance tests preserve expected session semantics; verify throttles work across instances and credential rotation invalidates old access. |
| F5 | Medium | Video uploads in [server.mjs](./server.mjs) buffer multipart bodies without a size cap, validate only the `.mp4` extension, and write into the local `video/` directory and [css/videos.json](./css/videos.json). | Add request/file size limits and content validation; use durable object storage or a persistent volume with a safe catalogue update strategy. Define overwrite/duplicate behavior and surface storage/JSON errors rather than silently treating a failed catalogue read as empty. | Media host/storage choice, maximum upload size and accepted formats. | Test oversized and malformed files, duplicate names, interrupted writes, restart/redeploy, concurrent reads/writes, and delete failures; confirm existing media/catalogue remains intact. |
| F6 | Medium | Gallery/admin verification scripts ([verify-all.mjs](./verify-all.mjs), [check.mjs](./check.mjs), and [gallery-check.mjs](./gallery-check.mjs)) import `jsdom`, but `jsdom` is absent from [package.json](./package.json) and the installed dependencies; the scripts currently fail before assertions. | Make the existing checks reproducible by adding the approved test dependency and test script, or replace them with the repository's chosen browser-test setup. Do not treat current scripts as passing tests. | Approval to change dependency manifest in a later implementation stage. | Perform a clean install from the lockfile and run the documented test command successfully; add/execute end-to-end tests for booking and role permissions once implemented. |
| F7 | Medium | Booking data includes personal contact details and notes; [css/views.ts](./css/views.ts) has only a brief scheduling notice, and [README.md](./README.md) calls for a privacy notice and operational process. No retention/deletion workflow or restore evidence exists. | Publish a salon-approved privacy notice; define data minimization, retention/deletion, access, incident response, backup retention, and customer-request handling. | Owner/legal review and hosting backup policy. | Review the customer notice and operational procedure; verify retention/deletion in staging and successfully restore a backup under controlled access. |
| F8 | Medium | The booking fee is disabled and no M-Pesa/Daraja API, callback, or transaction state exists; [css/config.ts](./css/config.ts) explicitly sets `bookingFeeEnabled: false`. | Keep online payment disabled until requirements are approved. If payment is in scope, implement a sandbox-first integration with verified callbacks, idempotency, reconciliation, and refund/error handling. | Business rules, Daraja onboarding/credentials, approved callback URL and payment policy. | Run sandbox scenarios for success, rejection, timeout, duplicate callback, and reconciliation; confirm no live requests occur during testing. |
| F9 | Medium | Production infrastructure is not configured in this workspace: no host/domain/TLS, environment-secret provisioning, durable upload storage, monitoring, or backup/restore configuration was found. [README.md](./README.md) describes these as deployment requirements only. | Select a host and domain, configure HTTPS and secret management, provision persistent PostgreSQL and media storage, and establish monitoring plus automated backups and restore drills. | Hosting/domain/budget choice; F1 migration and F5 media decisions. | Staging smoke test over HTTPS; verify environment configuration without printing secret values; restore a database backup and confirm uploaded media survives redeploy. |
| F10 | Low | The production `build` script runs `tsc` with output directed into `css/` ([package.json](./package.json), [tsconfig.json](./tsconfig.json)); generated JavaScript is already present and ignored by [`.gitignore`](./.gitignore). The no-emit type check passes, but the actual emitting build was not run to avoid overwriting files under the read-only instruction. | In a future approved change, define a clean build artifact/output and deployment command so production builds do not depend on stale generated assets or write into the source tree. | Deployment artifact strategy; approval to change build configuration. | Build from a clean checkout into the chosen artifact directory; serve that artifact in staging and confirm all routes, CSS, and videos load. |

### Recommended staged sequence

1. **Stage 1 — Resolve product and access scope:** decide guest versus customer accounts, required staff/admin/creator roles, booking/payment rules, and the intended deployment topology. Address F2, F3, and F8 requirements before implementation starts.
2. **Stage 2 — Make data deployment safe:** add versioned migrations and a staging-only database verification path; decide session behavior and test real booking persistence without touching production data. Address F1 and F4.
3. **Stage 3 — Complete security and data operations:** enforce the approved roles; set upload limits and durable media strategy; publish privacy/retention procedures. Address F3, F5, and F7.
4. **Stage 4 — Make checks reproducible:** repair the missing test dependency/setup, add backend and browser tests, and establish a clean production build artifact. Address F6 and F10.
5. **Stage 5 — Deploy and prove recovery:** provision hosting, domain, HTTPS, secrets, monitoring, backups, and durable media; run staging acceptance and restore drills before public launch. Address F9 and verify the other stages end-to-end.

## Recommended next task

**Approve a staging-only backend/database verification stage**: first choose or provision a disposable staging PostgreSQL database and confirm whether the existing bookings schema is empty or must be preserved; then add the minimal reproducible tests needed to verify server startup, health, booking persistence/overlap handling, and admin status updates without contacting M-Pesa or modifying production data.

No implementation was started as part of this audit.
