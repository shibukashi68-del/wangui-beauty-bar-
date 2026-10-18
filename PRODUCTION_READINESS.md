# Production readiness

This file reflects the current workspace after the booking, upload, and migration updates. It is an implementation status report, not a claim that a public deployment has been provisioned.

## Verified locally

- TypeScript build completes.
- Frontend checks pass: `npm run check` (18/18) and `npm run check:all` (19/19).
- Booking API checks passed against a temporary local PostgreSQL database: create, decline, rebook released slot, reject reactivation conflict, reject overlapping request, and confirm a non-conflicting booking.
- Database migration `001_create_bookings` applied to a fresh temporary database and a repeat run correctly skipped it.
- Video API checks passed against the temporary server: staff login, valid MP4 upload, duplicate rejection, invalid-content rejection, wrong-extension rejection, oversize rejection, and cleanup.
- Temporary booking rows, videos, server process, and test database were removed after verification.

## Current progress

- Render free staging Blueprint prepared in `render.yaml` with free PostgreSQL, migration-on-start, and a health check. It is intended only for temporary testing.
- Corrected video serving to honor `VIDEO_STORAGE_DIR`. On a fresh empty configured volume, startup seeds the bundled videos and catalogue once without overwriting existing media.
- **Not yet provisioned or verified on Render.** No hosting resources have been created. Free Render PostgreSQL expires after 30 days and has no backups; the free web filesystem is ephemeral, so uploaded media is not durable. Do not store real bookings on this staging setup.

## Required before public launch

1. Deploy the Render free staging Blueprint and verify `/api/health` and booking/video flows using test data only. Before public launch, provision production hosting with persistent PostgreSQL and durable media storage.
2. Choose a domain and configure HTTPS. Set `NODE_ENV=production` and a unique `ADMIN_PASSWORD` between 12 and 200 bytes. Production startup rejects a password outside that range.
3. Mount durable media storage and set `VIDEO_STORAGE_DIR` and `VIDEO_CATALOGUE_PATH`. Copy the supplied video files and `css/videos.json` to those paths before launch. The current app supports one instance because sessions and rate limits are held in process memory.
4. Configure automated database backups and complete a restore drill. Confirm that the host's storage backups cover uploaded videos and the video catalogue.
5. Have the salon owner verify service names, prices, durations, contact details, location, and opening hours. Publish an approved privacy notice and define booking-data retention and deletion.
6. Test the hosted site on desktop and mobile, then submit and manage a real-world trial booking before sharing the public URL.

## Current product scope

- Customers submit guest booking requests. Staff sign in with one shared password and manage requests; there are no customer accounts or individual staff/creator roles.
- Booking requests are not payments. M-Pesa, deposits, refunds, customer self-service cancellation, and rescheduling are not implemented.
- Video uploads are MP4-only and limited by `MAX_VIDEO_UPLOAD_BYTES` (100 MiB by default). Uploaded media is served by this app from the configured storage directory.

Until the external hosting, storage, domain, owner verification, and privacy steps above are complete, treat the site as staging rather than a public production service.
