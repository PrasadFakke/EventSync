# EventSync

EventSync is a Phase 1 event venue discovery and operations platform. It includes a responsive public site, client and manager authentication, SQLite persistence, venue browsing, booking requests, feasibility-checked manager decisions, hall/shared inventory, and demo payment records.

## Requirements

- Node.js 20.19+ or 22.12+ and npm
- Windows, macOS, or Linux

## Local setup

```sh
npm install
copy .env.example .env
npm run dev
```

The Vite app runs at http://localhost:5173 and the API at http://localhost:3001. SQLite is created in `data/eventsync.sqlite`; uploaded images are stored in `uploads/`. The initial seed runs automatically on server start. Keep both folders local and back them up as needed.

## Demo accounts

- Manager: `manager@eventsync.local` / `EventSync2026!`
- Client: `client@eventsync.local` / `Client2026!`

Set `DEMO_MANAGER_EMAIL` and `DEMO_MANAGER_PASSWORD` before the first server run to provision a different local manager. The manager password is hashed with bcrypt. Set a unique `SESSION_SECRET` for local development. These documented accounts are for a local demonstration only; do not expose them on a public deployment.

To reset demo data, stop the server and delete only `data/eventsync.sqlite` and `data/sessions.sqlite`; the seed is recreated at next startup. Uploaded files in `uploads/` are retained.

To replace venue and event records with the starter sample while keeping existing user accounts, stop the server and run `npm run seed:reset-sample`. This clears venues, halls, bookings, waitlist entries, payment/history records, reschedules, and venue image references; it preserves user accounts and uploaded files. The reset seeds three fictional Mumbai venues and four upcoming sample events.

## Included workflows

- Public venue discovery, venue details, event types, and role selection.
- Client registration/login, profile, dashboard, multi-step booking request, bookings, and payment overview.
- Manager login, data-driven dashboard, venue creation with initial hall and shared resources, booking review, schedule, waitlist and payment overviews, reports, and guarded APIs.
- Clients can only read their own records. Manager APIs require a manager session. Requests remain pending until manually reviewed. A confirmation checks hall capacity, shared resource quantities, and time overlap.
- Venue image upload API accepts JPEG, PNG, and WebP up to 5 MB each (up to eight files per request). Images are stored under `uploads/` and referenced by database paths.
- Payment entries are demo/offline records. No gateway or sensitive financial credentials are collected.

## Phase 1 limitations

Automatic scheduling, waitlist promotion, email notifications, live payment processing, reschedule approval UI, full hall/inventory editing UI, detailed booking history UI, and production deployment hardening are later-phase work. The API includes core venue/hall operations and reschedule request creation; review remains manual. A booking must name a hall before it can be confirmed. Venue A/B/C are explicitly labeled seeded demonstration records; their hall capacities and shared inventories match the project brief.

## Build

```sh
npm run build
```

Production must use HTTPS, a strong session secret, an appropriate same-site/CSRF strategy for the deployment topology, and controlled manager provisioning. The development CORS origin is `http://localhost:5173`.
