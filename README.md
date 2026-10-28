# Wangui Beauty Bar

Wangui Beauty Bar is a TypeScript salon site with a Node.js backend. Customer booking requests are stored in PostgreSQL and the salon confirms availability directly with customers via WhatsApp. An owner-only dashboard manages gallery videos using Supabase Auth and Storage.

## Database setup

Install PostgreSQL and create a database named `wangui_beauty_bar` in pgAdmin (or with `createdb`). Database changes are stored as versioned SQL files in `migrations/`. The PostgreSQL role used to run migrations needs permission to create objects in the database. Apply migrations explicitly before starting the app.

## Run locally

Requires Node.js 20 or newer. Install the project dependencies once with `npm.cmd install`.

On Windows, run this command in PowerShell from the project folder:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

The execution-policy bypass applies only to this PowerShell process; it does not change the machine's policy. The script uses the local PostgreSQL defaults below (or existing `PGHOST`, `PGPORT`, `PGUSER`, and `PGDATABASE` values in that terminal), displays the selected host, port, database, and user, then prompts only for the database password. It applies migrations before starting the app. Passwords are not written to files. Create the database first in pgAdmin if it does not exist. If `DATABASE_URL` is set in the terminal, clear it before running this local script.

Defaults: host `127.0.0.1`, port `5432`, user `postgres`, database `wangui_beauty_bar`.

You can also create a `.env` file from `.env.example` in the project root. `server.mjs`, `migrate.mjs`, and API verification tools automatically load `.env` without third-party dependencies, while process environment variables and interactive prompts always take precedence.

For manual PowerShell setup:

```powershell
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '5432'
$env:PGUSER = 'postgres'
$env:PGDATABASE = 'wangui_beauty_bar'
$securePgPassword = Read-Host 'PostgreSQL password' -AsSecureString
$env:PGPASSWORD = (New-Object System.Net.NetworkCredential('', $securePgPassword)).Password
npm.cmd run migrate
npm.cmd start
```

Open <http://localhost:3000>. Appointment submissions are requests, not confirmations; customers should continue the conversation in WhatsApp to confirm availability. The server validates service duration and opening hours using East Africa Time. Pending requests do not reserve a time slot.

The API checks need a running local or staging server. Run `npm.cmd run check:bookings-api` with `PGDATABASE` (or `DATABASE_URL`) pointing to a database whose name contains `test` or `stage`; it creates and removes test bookings. Run `npm.cmd run check:public-api` to verify the public video catalogue and confirm owner endpoints require authentication. Never run the booking check against production data.

Set `DATABASE_URL` instead of the `PG*` variables when using a hosted PostgreSQL database. Keep passwords in environment variables or your hosting provider's secret manager; never commit credentials.

## Render free staging setup

The root `render.yaml` defines a free Render web service. It uses an external Supabase PostgreSQL database, avoiding Render's one-free-database-per-workspace limit. This is a public trial configuration, not dependable production hosting: Render's free web service sleeps when idle and its local filesystem is temporary. Supabase's Free plan has limited database/storage capacity and may pause projects after inactivity; it does not provide production-grade availability or backups. Check the providers' current limits before deploying.

1. Create a Supabase Free project and set a strong, unique database password. Select a region reasonably close to Nairobi if available.
2. In Supabase, open **Connect**, choose **Session pooler**, and copy its PostgreSQL connection string. Replace its password placeholder, percent-encoding reserved characters if necessary. Use Session pooler because it is IPv4-compatible; the direct endpoint may require IPv6.
3. In Render, sync the `wangui-beauty-bar-staging` Blueprint from this repository. It creates only a free web service. Enter the Supabase connection string for `DATABASE_URL`, the project URL for `SUPABASE_URL`, the anon/public key for `SUPABASE_ANON_KEY`, and the owner's Auth UUID for `SUPABASE_OWNER_USER_ID` in Render's prompts. Never commit credentials.
4. Deploy the Blueprint. It builds the TypeScript app, applies database migrations at startup, and serves `/api/health` as the health check.

The app serves the bundled `/video/` files and public catalogue. Do not use this staging database for real customer bookings.

## Render production setup

`render.production.yaml` is a separate, paid production Blueprint; it does not change the free staging service above. It provisions a Frankfurt web service and a private, paid Render Postgres database in the same region. Review current Render pricing, database backup/retention terms, and regional availability before syncing it. No resources are provisioned by this repository change.

1. In Render, create a Blueprint from this repository and select `render.production.yaml` as its configuration file. Confirm the paid service and database plans before applying it.
2. The Blueprint installs from `package-lock.json`, includes build-time dev dependencies, pins Node.js 22.22.2, runs `npm run migrate` as the pre-deploy command, then starts the server. The `/api/health` check verifies PostgreSQL connectivity; startup refuses to listen if production database configuration is missing, owner-video settings are only partially configured, or the required schema migration is missing.
3. Configure Supabase Auth and the public `salon-videos` Storage bucket with the owner-only write/delete policies in the owner video section below. Add the Supabase project URL, anon key, and owner Auth UUID as prompted. These values enable owner publishing; never add a service-role key.
4. Set `SITE_URL` to the exact public frontend origin when serving through Cloudflare Pages or another separate frontend domain. For a frontend served directly by the same Render service, no extra origin is required. Add every production origin when using a custom domain.
5. Before accepting bookings, verify how the Render ingress populates client IP headers and configure `TRUSTED_PROXIES` only with verified immediate proxy addresses. This app's rate limiter is process-local; without correct proxy configuration, visitors may share a rate-limit bucket. Do not guess proxy addresses or trust arbitrary forwarded headers.
6. Configure database backup retention and access controls in Render, then complete a restore drill into a non-production database. Keep the database private; the Blueprint restricts it to private-network connections.
7. Configure the custom domain and confirm HTTPS, the health check, booking submission to a non-production database, and owner authentication/video upload before launch. Do not run API verification scripts that create bookings against production.

This Blueprint is production-capable infrastructure, not proof of production readiness by itself. The booking workflow still requires the salon to monitor requests and confirm appointments through WhatsApp; pending requests do not reserve a time slot. Before public launch, verify all business details, publish an approved privacy notice, define booking-data retention/deletion, and agree who monitors and responds to requests. The site has no staff booking dashboard, automated WhatsApp notification, payment processing, or customer self-service cancellation/rescheduling.

## Cloudflare Pages frontend with a Node API backend

Cloudflare Pages can host the static frontend, but it does not run this project's Node/PostgreSQL server. The Pages Function in `functions/api/[[path]].js` proxies same-origin `/api/*` requests to the existing HTTPS Node backend, including owner-session cookies. The backend must remain deployed and healthy for bookings, gallery API data, and owner publishing to work.

For the Pages project connected to this repository, configure:

- Production branch: `deploy/render-staging-owner-videos` (or the branch containing the deployment code you intend to publish).
- Root directory: repository root.
- Build command: `npm run build:pages`.
- Build output directory: `dist`.
- Environment variable: `BACKEND_ORIGIN` set to the HTTPS origin of the Node backend only, for example `https://wangui-beauty-bar.onrender.com` (no path or trailing API route).

On the **backend** host, also set `SITE_URL` to the Pages origin (comma-separated if there are several), for example `SITE_URL=https://your-project.pages.dev`. Owner sign-in, upload, edit, and delete are state-changing requests, so the backend rejects any `Origin` it does not recognize. Because the proxy forwards the Pages origin while `Host` is the backend host, the two never match — without `SITE_URL` every owner action fails with `403 Cross-origin requests are not allowed.` Add your custom domain there too once it is configured.

The build packages `css/` and `video/` into `dist/`; the `functions/` directory remains at the repository root for Pages Functions. After deployment, verify `/api/health` on the Pages URL. A Pages deployment does not fix a 503 from the backend; resolve the backend health failure before accepting bookings or enabling owner tools.

## Owner video publishing

The owner can open `https://your-site/#/owner` to manage the public gallery. They can upload MP4/WebM files up to 50 MB, set the title, caption, category and department, publish or hide entries, and delete entries. Only the configured Supabase Auth owner account can use these controls. Files are stored in Supabase Storage; the catalogue metadata is stored in PostgreSQL. Uploaded media is never stored on Render's temporary filesystem.

Before enabling the dashboard:

1. In Supabase Auth, create and confirm the owner's account and disable public sign-ups after the owner has access. Copy that account's user UUID.
2. Create a **public** Storage bucket named `salon-videos`, allow only `video/mp4` and `video/webm`, and set the maximum file size to 50 MB. Public read access lets the gallery play published clips.
3. Add the following Storage policies in the Supabase SQL editor, replacing `OWNER_UUID` with the exact Auth user UUID. These policies allow only that authenticated owner to upload/delete files in their own folder; do not enable anonymous writes.

```sql
CREATE POLICY "Owner can upload salon videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'salon-videos'
  AND auth.uid() = 'OWNER_UUID'::uuid
  AND (storage.foldername(name))[1] = 'owner'
);

CREATE POLICY "Owner can delete salon videos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'salon-videos'
  AND auth.uid() = 'OWNER_UUID'::uuid
  AND (storage.foldername(name))[1] = 'owner'
);
```

4. Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_OWNER_USER_ID` in the app host's environment. `SUPABASE_VIDEO_BUCKET` defaults to `salon-videos`. The Supabase database connection must be the same PostgreSQL database used by the app so `npm run migrate` applies `002_create_owner_videos`.
5. Redeploy, open `/#/owner`, and test with a short non-customer video. Confirm it appears in the public gallery after publishing and disappears from the gallery after hiding/deleting it.

The app never needs a Supabase service-role key. Keep the owner password and PostgreSQL connection string private. Supabase Free has storage/bandwidth limits and is not a production availability guarantee; choose an appropriate durable media plan before relying on public customer traffic.

After staging is live, verify `/api/health` and perform the documented booking and public API checks using the staging environment only. Supabase's Free plan may pause the project after a week of inactivity and has limited capacity; do not rely on it for real customer bookings. Before public launch, create a production environment with a durable database and backups, and review the privacy and operational requirements below.

## Deployment requirements

- Deploy the whole project, including `css/` and `video/`, and run `npm start` on a Node.js host.
- Run `npm run migrate` as a deployment step before starting the new application version. Review each new SQL migration and back up the database before applying production changes.
- Set `PGHOST`, `PGPORT`, `PGUSER`, and `PGDATABASE`, or provide `DATABASE_URL` for PostgreSQL. Use a dedicated database role with only the permissions the app needs.
- Ship the bundled videos and `css/videos.json` with the application.
- Configure Supabase Auth, the public media bucket, and owner-only Storage write policies before enabling owner video publishing.
- The request rate limiter is held in process memory. Multiple instances require shared rate-limit storage or provider-level rate limiting. Set `TRUSTED_PROXIES` to the proxy's addresses so limits are keyed per customer; without it every request behind a proxy shares one bucket.
- Use HTTPS through the hosting provider or a trusted TLS reverse proxy.
- Provide customers a privacy notice and an operational process for responding, cancelling, and removing old requests.
- Before public launch, confirm every service name, price, email, social handle, and business detail is verified by the salon owner.

The repository does not configure a public domain, TLS certificate, cloud host, or hosted PostgreSQL instance. Use a persistent PostgreSQL service and backups for production booking data.
