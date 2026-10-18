# Wangui Beauty Bar

Wangui Beauty Bar is a TypeScript salon site with a Node.js backend. Booking requests are stored in PostgreSQL and staff manage them at `/#/admin`.

## Database setup

Install PostgreSQL and create a database named `wangui_beauty_bar` in pgAdmin (or with `createdb`). Database changes are stored as versioned SQL files in `migrations/`. The PostgreSQL role used to run migrations needs permission to create objects in the database. Apply migrations explicitly before starting the app.

## Run locally

Requires Node.js 20 or newer. Install the project dependencies once with `npm.cmd install`.

In PowerShell, configure the connection and start the app. The password prompt is hidden, so credentials are not saved in the project:

```powershell
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '5432'
$env:PGUSER = 'postgres'
$env:PGDATABASE = 'wangui_beauty_bar'
$securePgPassword = Read-Host 'PostgreSQL password' -AsSecureString
$env:PGPASSWORD = (New-Object System.Net.NetworkCredential('', $securePgPassword)).Password
$secureAdminPassword = Read-Host 'Choose a unique staff password (12+ characters)' -AsSecureString
$env:ADMIN_PASSWORD = (New-Object System.Net.NetworkCredential('', $secureAdminPassword)).Password
npm.cmd run migrate
npm.cmd start
```

Open <http://localhost:3000>. Staff sign in at <http://localhost:3000/#/admin>. Requests remain pending until staff updates their status. The server enforces service duration, opening hours, and overlapping appointment checks using East Africa Time.

The API checks need a running local or staging server and the staff password in `ADMIN_PASSWORD`. Run `npm.cmd run check:bookings-api` with `PGDATABASE` (or `DATABASE_URL`) pointing to a database whose name contains `test` or `stage`; it creates and removes test bookings. For `npm.cmd run check:video-api`, set `MAX_VIDEO_UPLOAD_BYTES=1048576` on the staging server and in the check process; it uploads and deletes temporary videos. Never run these checks against production data.

Set `DATABASE_URL` instead of the `PG*` variables when using a hosted PostgreSQL database. Keep passwords in environment variables or your hosting provider's secret manager; never commit credentials.

## Render free staging setup

The root `render.yaml` defines a free Render web service and free PostgreSQL database for temporary testing. Render's free services are not production storage: the web service sleeps when idle and its local file changes are lost on restart/redeploy; free PostgreSQL expires after 30 days, has 1 GB storage, and does not include backups. Uploaded videos are therefore temporary. Check Render's current free-tier limits and usage before deploying. No Render resources are created until you connect the repository and deploy the Blueprint.

1. Push the project to a Git provider connected to your Render account, then choose **New > Blueprint** and select this repository.
2. Review the proposed free staging resources and choose a region close to your customers for both the app and database.
3. When prompted, set a unique staff `ADMIN_PASSWORD` (12–200 bytes). Do not put it in this repository.
4. Deploy the Blueprint. It builds the TypeScript app, applies database migrations at startup, and serves `/api/health` as the health check.

The app serves the bundled `/video/` files for the initial test. Staff uploads may work during a running instance, but treat them as disposable because the free web service has no persistent disk. Do not use this staging database for real customer bookings.

After staging is live, verify `/api/health` and perform the documented booking and video API checks using the staging environment only. Do not use the staging setup for production bookings. Before public launch, create a separate production environment and review its backup, privacy, and operational requirements below.

## Deployment requirements

- Deploy the whole project, including `css/` and `video/`, and run `npm start` on a Node.js host.
- Run `npm run migrate` as a deployment step before starting the new application version. Review each new SQL migration and back up the database before applying production changes.
- Set `PGHOST`, `PGPORT`, `PGUSER`, and `PGDATABASE`, or provide `DATABASE_URL` for PostgreSQL. Use a dedicated database role with only the permissions the app needs.
- Set a strong, unique `ADMIN_PASSWORD` in the hosting provider's secret settings. Keep it away from Git history and never keep it in source files.
- Configure `VIDEO_STORAGE_DIR` and `VIDEO_CATALOGUE_PATH` to locations on a durable volume; copy the supplied videos and catalogue there before launch. Do not rely on an ephemeral container filesystem for customer uploads.
- Run a single app instance with the current in-memory sessions and rate limits. Multiple instances require shared session and rate-limit storage.
- Use HTTPS through the hosting provider or a trusted TLS reverse proxy, and set `NODE_ENV=production` so staff session cookies are secure.
- Provide customers a privacy notice and an operational process for responding, cancelling, and removing old requests.
- Before public launch, confirm every service name, price, email, social handle, and business detail is verified by the salon owner.

The repository does not configure a public domain, TLS certificate, cloud host, or hosted PostgreSQL instance. Use a persistent PostgreSQL service and backups for production booking data.
