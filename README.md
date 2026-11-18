# EduPro: school management (my-student-app)

EduPro is a school management app. This repository holds three parts:

| Folder | What it is | Stack |
| --- | --- | --- |
| `server/` | REST API | Node.js 18+, Express 4, Mongoose 6, MongoDB (replica set), zod, pino |
| `client/` | Web app | Next.js 12, React 18, Tailwind CSS + daisyUI, ECharts |
| `e2e/` | Browser tests | Playwright |

## What works today

- **Schools**: add, edit, deactivate, and delete (only when the school has no records). Each school's short code starts its admission numbers, e.g. `GVPS-2026-00001`.
- **Admissions**: apply → review → request documents → approve or reject → enrol. Duplicate applications are blocked. Enrolment creates the student record and its admission number in one transaction.
- **Students**: create, view, edit, change status and delete (a soft delete).
  - Filter by school, class, section and status.
  - Each student has a photo, stored in MongoDB GridFS and re-encoded to a 512 px JPEG with its metadata (such as GPS location) removed.
  - Records cover address, contact, transport and bus route, parents, guardian, emergency contact, and private medical notes.
- **Global search**: a type-ahead search for students across all schools. Picking a result opens the student's profile.
- **Student profile** tabs:
  - **Overview**: personal, school, address and transport details.
  - **Academics**: exam marks with totals, percentages, 9-point grades and pass/fail.
  - **Attendance**: year summary and a monthly calendar where each day can be marked or corrected.
  - **Parents**: contact details with tap-to-call.
  - **Fees**: bills, part and full payments with receipt numbers, and overdue tracking.
- **Dashboard**: active students, admissions to review, the latest day's attendance, fees outstanding and overdue, students per school and per class. It can be filtered by school.
- **Phone layout**: an app bar, bottom tabs, full-screen search and card lists. The app can be installed to a phone's home screen.

> 🔐 **Sign-in is required.** Every page and every data endpoint needs an admin session.
> - Passwords are bcrypt-hashed.
> - The session cookie is httpOnly and SameSite=Strict, and expires after 8 hours.
> - Five failed attempts lock the account for 15 minutes, and sign-ins are rate limited per IP.
>
> There is only one role (admin) so far; staff, parent and teacher roles come next.

## Quick start (local development)

You need Node.js 18 or later, and a MongoDB **replica set**: any MongoDB Atlas cluster, or a local `mongod --replSet rs0` with `rs.initiate()` run once.

```bash
# 1. API
cd server
cp .env.example .env      # set MONGODB_URI; CORS_ORIGIN if the web app is not on :3000
npm install
npm run db:maintain       # creates the indexes (run again after each deploy)
EDUPRO_ADMIN_PASSWORD='at least 12 characters' npm run create-admin -- admin "School Admin"
npm run seed              # optional: 3 sample schools with ~85 students, photos, marks, attendance, fees
                          # (npm run seed -- --reset replaces them; refused when NODE_ENV=production)
npm run dev               # http://localhost:5000/api

# 2. Web app (second terminal)
cd client
cp .env.example .env.local   # API_INTERNAL_URL, default http://localhost:5000
npm install
npm run dev                  # http://localhost:3000 – sign in as the admin you created
```

## Architecture

```
Browser ──► Next.js (client/)  pages + /api/* proxy (same origin, so the cookie is first-party)
               │
               ▼
           Express app (server/src/app.js)
             pino-http (request id, JSON log) → helmet → CORS allow-list
             → compression → rate limit → cookie parser → JSON-only writes
             → JSON body (100 kB) → sanitize
             → public routes (/health, /ready, /auth/*, /meta/classes)
             → requireAuth (session lookup) → data routes → 404 → error handler
               │
   routes ─► validators (zod) ─► controllers ─► services ─► models (Mongoose)
                                                               │
                                                        MongoDB replica set
```

- `server/src/config`: environment validation (`env.js`), logger, database connection.
- `server/src/services`: the business rules (status transitions, duplicate checks, the enrolment transaction). Controllers only translate HTTP.
- Every response has the same shape: `{ success, message, data?, pagination?, errors? }`. Internal errors are logged with the request id and answered with a generic message.
- Records expose `id`. Internal fields (`_id`, `__v`, `dedupeKey`, `searchTokens`, `deletedAt`, `medicalNotes`) are never returned.

More detail: [docs/API.md](docs/API.md) · [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · [docs/AUDIT.md](docs/AUDIT.md)

## Tests

| Command | What it covers | Count |
| --- | --- | --- |
| `cd server && npm run test:unit` | validators, query helpers, sanitizer, error mapping, env config, password hashing | 52 |
| `cd server && npm run test:integration` | API against an in-memory MongoDB replica set: auth, admissions, schools, student CRUD, photo upload and validation, attendance, results and grading, fees and payments (including simultaneous payments), search, dashboard, concurrency, injection, index usage | 74 |
| `cd server && npm test` | both of the above (`npm run test:coverage` for coverage) | 126 |
| `cd client && npm test` | React components: sign-in, session guard, global search, student form, photo upload, attendance calendar, fees, admissions, dashboard | 40 |
| `cd e2e && npm install && npm test` | builds the web app, starts a throwaway database, an admin and the API, then runs Playwright on desktop and a phone | 16 |

The server and e2e tests download a MongoDB binary on first run. If your network blocks that, set `MONGOMS_SYSTEM_BINARY=/path/to/mongod` (and `MONGOMS_VERSION` to its version). The e2e suite uses Playwright's Chromium (`npx playwright install chromium`).

CI (`.github/workflows/ci.yml`) runs all of these on every push.

## Known limitations

- **One role only (admin).** Role-based permissions (principal, teacher, parent, accountant…) and password reset by email are the next phase (see docs/AUDIT.md §5), and the remaining modules depend on them. Reset a password with `npm run create-admin`; doing so also signs out that user's sessions.
- Not built yet:
  - parent, teacher and student logins
  - class-wide attendance entry (attendance is marked per student)
  - exam schedules and result approval or publishing
  - timetables and online payment gateways
  - notifications and exportable reports
  - document uploads other than photos
- All signed-in admins see every school. There is no per-school restriction yet.
- Classes are a fixed list (LKG–12). Sections are free text.
- Parent and guardian details are stored on each admission and student record, not as separate parent records.
- Editing a student cannot clear an optional field (an empty box keeps the old value).
- Enrolment requires a replica set, so a standalone `mongod` will fail at the enrol step.
- Counting uses `countDocuments` on every list request. That is fine for a single school (tens of thousands of records). Very large tenants would want cached or estimated totals.
