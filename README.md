# EduPro: school management (my-student-app)

EduPro is a school management app. This repository holds three parts:

| Folder | What it is | Stack |
| --- | --- | --- |
| `server/` | REST API | Node.js 18+, Express 4, Mongoose 6, MongoDB (replica set), zod, pino |
| `client/` | Web app | Next.js 12, React 18, Tailwind CSS + daisyUI, ECharts |
| `e2e/` | Browser tests | Playwright |

## What works today

- **Admissions**: apply → review → request documents → approve or reject → enrol. Duplicate applications are blocked. Enrolment creates the student record and its admission number in one transaction.
- **Students**: list, search, filter by class/section/status, edit, change status, soft delete.
- **Dashboard**: live counts, students by class, recent applications.

Attendance, Parents and Personal Details are placeholders that say they are not available yet.

> ⚠️ **There is no login or permission system yet.** Anyone who can reach the API can read and change admissions and students. Run it only on a private network until authentication ships. See [Known limitations](#known-limitations).

## Quick start (local development)

You need Node.js 18 or later, and a MongoDB **replica set**: any MongoDB Atlas cluster, or a local `mongod --replSet rs0` with `rs.initiate()` run once.

```bash
# 1. API
cd server
cp .env.example .env      # set MONGODB_URI; CORS_ORIGIN if the web app is not on :3000
npm install
npm run db:maintain       # creates the indexes (run again after each deploy)
npm run dev               # http://localhost:5000/api

# 2. Web app (second terminal)
cd client
cp .env.example .env.local   # NEXT_PUBLIC_API_URL, default http://localhost:5000/api
npm install
npm run dev                  # http://localhost:3000
```

## Architecture

```
Browser ──► Next.js pages (client/pages)
               │ services/api.js  (fetch, credentials: include)
               ▼
           Express app (server/src/app.js)
             pino-http (request id, JSON log) → helmet → CORS allow-list
             → compression → rate limit → JSON body (100 kB) → sanitize
             → routes → 404 → central error handler
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
| `cd server && npm run test:unit` | validators, query helpers, sanitizer, error mapping, env config | 49 |
| `cd server && npm run test:integration` | API against an in-memory MongoDB replica set: workflow, concurrency, duplicates, injection, limits, CORS, rate limit, index usage | 33 |
| `cd server && npm test` | both of the above (`npm run test:coverage` for coverage) | 82 |
| `cd client && npm test` | React components (form validation and submit, admissions actions, dashboard, API client) | 20 |
| `cd e2e && npm install && npm test` | builds the web app, starts a throwaway database and the API, then runs Playwright on desktop and mobile | 8 |

The server and e2e tests download a MongoDB binary on first run. If your network blocks that, set `MONGOMS_SYSTEM_BINARY=/path/to/mongod` (and `MONGOMS_VERSION` to its version). The e2e suite uses Playwright's Chromium (`npx playwright install chromium`).

CI (`.github/workflows/ci.yml`) runs all of these on every push.

## Known limitations

- **No authentication, roles or permissions.** These are the next phase (see docs/AUDIT.md §5), and the remaining modules depend on them.
- Not built yet: parent and teacher accounts, attendance, exams and results, timetables, fees, notifications, reports, file and document uploads, multi-school tenancy. None of these are tested because they don't exist.
- Classes are a fixed list (LKG–12). Sections are free text.
- Parent and guardian details are stored on each admission and student record, not as separate parent records.
- Enrolment requires a replica set, so a standalone `mongod` will fail at the enrol step.
- Counting uses `countDocuments` on every list request. That is fine for a single school (tens of thousands of records). Very large tenants would want cached or estimated totals.
