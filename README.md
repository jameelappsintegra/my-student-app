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
- **Attendance register**: pick a school, class, section and date, then mark the whole class on one screen.
  - Each student has one-tap Present / Absent / Late / Half-day / Leave buttons, plus "Mark rest present" and "Holiday" for the whole class.
  - The register remembers the last class used and warns before you leave with unsaved marks.
  - Marks show up on each student's calendar.
- **Reports**: fee defaulters, low attendance (threshold of your choice) and class lists with parent contacts. Each can be filtered by school and class, viewed on screen, or downloaded as CSV for Excel (UTF-8, with protection against spreadsheet formula injection).
- **Dashboard**: active students, admissions to review, the latest day's attendance, fees outstanding and overdue, students per school and per class. It can be filtered by school.
- **Phone layout**: an app bar, bottom tabs chosen per role, full-screen search and card lists. The app can be installed to a phone's home screen.
  - Lists never scroll sideways. Below 1280 px each row becomes a card with labelled values (two cards per row on tablets); reports are always cards, and the CSV download gives the spreadsheet view. The timetable shows one day at a time on phones, and tab bars wrap instead of scrolling.
- **School life**: notifications (a bell with unread count), announcements by school, class or audience, homework, class timetables with clash checks, leave requests that mark attendance when approved, draft → published exam results, printable report cards, year-end promotion and an audit log.
- **Student logins**: each student signs in to see their own record, published results, timetable, calendar and library catalogue. Admins create logins one at a time or for a whole class (usernames are admission numbers; random passwords are shown once and can be downloaded as CSV).
- **Online homework**: teachers can ask for work to be handed in online, optionally out of a mark. Students type an answer and/or add a link; work after the due date is flagged late (or refused, per school). Teachers see who handed in, who hasn't, mark it or return it for changes; students and parents are notified.
- **Transport**: bus routes with vehicle, driver, attendant, seats and ordered stops (pickup and drop times, per-stop fee). Students are assigned to a stop; capacity is enforced; the riders list prints with a parent phone per child. Parents and students see the bus on the profile's **Bus & library** tab.
- **Library**: catalogue per school (title, author, ISBN, category, shelf, copies), lending with a due date, returns, overdue list, and late fines worked out from the school's daily fine. Students can't borrow while a fine is unpaid or past the school's limit. Students and parents can browse the catalogue.
- **Certificates**: transfer (TC), bonafide, character and study certificates with serial numbers like `GVPS/TC/2026/0001`, printed on the school's letterhead. A TC checks fee dues (it can be issued anyway after confirming) and marks the student as transferred; cancelling restores them. Each certificate carries a random code that anyone can check at `/verify/<code>` without signing in.
- **Progress** (parents, for each child, and students): the year's exam trend against the pass mark, each subject compared with the previous exam, attendance by month (months under 75% in red), homework handed in, missing and marked, library loans and (parents) fees due.
- **Fees & receipts** (parents): every child's bills and payments in one place, with a printable receipt for each payment (receipt number, amount in the school's currency, method, balance after payment).
- **Class insights** (teachers for their classes, principals and admins): average attendance, latest-exam average, homework hand-in rate, the last marked days as a chart, and every student flagged for low attendance, a failed exam, missing homework or (principals) overdue fees, with filters. Teachers open it from each class card on their home screen.
- **School settings** (per school): currency and number format, time zone, the month the academic year starts, weekly off days, terms, holidays, grading scale and pass mark, library fine/loan period/book limit, and whether late homework is accepted. Results, report cards, reports, fee amounts, leave approval, the register's holiday warning and "today" all follow these settings. A **Calendar** page shows holidays, terms, events and homework due dates.

> 🔐 **Sign-in is required.** Every page and every data endpoint needs a session (except the certificate verification page).
> - Passwords are bcrypt-hashed.
> - The session cookie is httpOnly and SameSite=Strict, and expires after 8 hours.
> - Five failed attempts lock the account for 15 minutes, and sign-ins are rate limited per IP.

## Roles

| Role | Sees | Can do | Theme |
| --- | --- | --- | --- |
| Admin | All schools | Everything, including Users, Schools, admissions and fee collection | Indigo |
| Principal (head of school or department) | Their own schools | Dashboard, all students, attendance, marks, fees (view), every report; approves sharing requests | Teal |
| Teacher | Their assigned classes | Attendance register, marks, student photos, class reports; can request records from other schools | Green |
| Parent | Their own children | Profile, attendance, published results and fees (read-only); can update their child's photo; requests leave | Orange |
| Student | Their own record | Profile, attendance, published results, timetable, calendar, library catalogue; hands in homework online | Violet |

- Permissions live in `server/src/constants/permissions.js` and are checked on every API route. Records outside someone's scope return 404.
- Admins can switch on extra permissions per person: **Can import students** (teacher or principal; a teacher imports only into their own classes), **Runs the library** and **Manages school buses** (teachers).
- Principals also manage transport, the library, certificates and their school's settings.
- **Cross-school sharing**: a teacher or principal requests a student by admission number and says which kinds of record they need: academic, attendance, personal or fees. The student's principal (or an admin) approves, possibly narrowing the request, or rejects it. Shared access is read-only, expires automatically (30 days by default) and can be revoked.
- **Profile photos**: everyone can set their own under My account. Staff photos are visible to signed-in users; a parent's photo is visible only to them and to admins.

## Bulk import and Aadhaar

- **Students → Import CSV** (`/students/import`): download the template, fill it in Excel, then upload.
  - Every row is checked first, and the problems are listed by row and column.
  - Nothing is saved until the whole file is clean; then all rows are added in one transaction, and admission numbers are generated.
  - Accepted formats include dates as DD/MM/YYYY or YYYY-MM-DD, classes as 5, V or "Class 5", and gender as M/F.
- **Fill from Aadhaar** (New Admission and Add student) uses UIDAI's **Paperless Offline e-KYC**. The parent downloads the ZIP from myaadhaar.uidai.gov.in with a 4-character share code. EduPro reads the name, date of birth, gender, address, father or guardian, and photo to fill in the form.
  - To verify UIDAI's signature, set `UIDAI_OFFLINE_KYC_CERT` to the UIDAI public certificate (a PEM file). Without it, the details are shown as "not verified".
  - The file is processed in memory and never stored. EduPro doesn't save the Aadhaar number.
  - Live Aadhaar e-KYC or DigiLocker would need a UIDAI KUA licence or DigiLocker partner registration. They are not included.

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
                          # SEED_USER_PASSWORD='…' also creates demo accounts for each role:
                          # principal.gvps, teacher.gvps, principal.smms, teacher.smms, parent.demo, student.gvps
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
| `cd server && npm run test:unit` | validators, query helpers, sanitizer, error mapping, env config, password hashing | 53 |
| `cd server && npm run test:integration` | API against an in-memory MongoDB replica set: auth, roles and scoping, admissions, students, records, register, reports, import, sharing, Aadhaar, school-life modules, student logins, homework submissions, settings and calendar, transport, library, certificates, progress, class insights and receipts | 138 |
| `cd server && npm test` | both of the above (`npm run test:coverage` for coverage) | 191 |
| `cd client && npm test` | React pages and components for every role, including homework hand-in and marking, settings, library, certificates, verification, calendar, student home, progress, fees and receipts, and class insights | 76 |
| `cd e2e && npm install && npm test` | builds the web app, starts a throwaway database, an admin and the API, then runs Playwright on desktop and a phone | 27 |

The server and e2e tests download a MongoDB binary on first run. If your network blocks that, set `MONGOMS_SYSTEM_BINARY=/path/to/mongod` (and `MONGOMS_VERSION` to its version). The e2e suite uses Playwright's Chromium (`npx playwright install chromium`).

CI (`.github/workflows/ci.yml`) runs all of these on every push.

## Known limitations

- Password reset is done by an admin (Users → Reset password). There's no email reset yet.
- Notifications are in-app only; email, SMS and WhatsApp aren't connected.
- No online payment gateway; fee payments are recorded by staff.
- Homework hand-in takes text and links, not file uploads.
- A teacher who runs the library or buses finds students through search, which only covers their own classes. Principals and admins can find any student in their schools.
- Not built yet: hostel, inventory, payroll and HR, exam timetables and seating plans, ID cards.
- Classes are a fixed list (LKG–12). Sections are free text.
- Parent and guardian details are stored on each admission and student record, not as separate parent records.
- Editing a student cannot clear an optional field (an empty box keeps the old value).
- Enrolment requires a replica set, so a standalone `mongod` will fail at the enrol step.
- Counting uses `countDocuments` on every list request. That is fine for a single school (tens of thousands of records). Very large tenants would want cached or estimated totals.
