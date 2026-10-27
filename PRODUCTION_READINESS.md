# Production readiness

This file reflects the current workspace after the booking and migration updates. It is an implementation status report, not a claim that a public deployment has been provisioned.

## Verified locally

- TypeScript build completes.
- Node unit tests pass: `npm test` (46/46).
- Frontend checks pass: `npm run check` (44/44) and `npm run check:all` (19/19).
- TypeScript build passes. Owner workflow unit tests cover owner-only sign-in, upload validation, storage persistence, deletion, and public catalogue integration.
- Migration `002_create_owner_videos` is added but has not been applied to a live database in this workspace. The booking/public API scripts were not run because no database credentials or running local/staging server were configured.

## Current progress

- Render free staging Blueprint prepared in `render.yaml` with an external Supabase PostgreSQL connection, migration-on-start, and a health check. It creates only the free Render web service and requires `DATABASE_URL` at sync/deploy.
- The public site serves bundled and published Supabase-hosted videos. A private owner dashboard supports upload, edits, publishing, and deletion after Supabase is configured.
- **Not yet provisioned or verified on Render or Supabase.** No new hosting resources have been created. The Supabase Free database may pause after inactivity and has limited capacity. Do not store real bookings on this trial setup.

## Required before public launch

1. Create a Supabase project, configure Auth/Storage and owner policies as described in `README.md`, then deploy the Render staging Blueprint. Verify `/api/health`, owner video flows, and public API using test data only. Before public launch, provision production hosting with persistent PostgreSQL and appropriate video storage.
2. Choose a domain and configure HTTPS.
3. Ship the supplied video files and `css/videos.json` with the app. The request rate limiter is held in process memory; multiple instances need shared rate-limit storage or provider-level rate limiting.
4. Configure automated database backups and complete a restore drill.
5. Have the salon owner verify service names, prices, durations, contact details, location, and opening hours. Publish an approved privacy notice and define booking-data retention and deletion.
6. Test the hosted site on desktop and mobile, then submit and manage a real-world trial booking before sharing the public URL.

## Current product scope

- Customers submit guest booking requests. Requests remain unconfirmed until the customer contacts the salon through WhatsApp; there is no staff dashboard or in-site request management.
- Booking requests are not payments. M-Pesa, deposits, refunds, customer self-service cancellation, and rescheduling are not implemented.
- The public video gallery is read-only. The private owner route `/#/owner` manages videos and their gallery metadata; it does not manage appointments, text announcements, or service prices.
- Owner publishing requires Supabase Auth, the configured owner UUID, a public `salon-videos` Storage bucket with owner-only write/delete policies, and migration `002_create_owner_videos`.

Until the external hosting, storage, domain, owner verification, and privacy steps above are complete, treat the site as staging rather than a public production service.
