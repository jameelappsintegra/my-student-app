# EduPro audit and Phase 1 report

Audit date: 13 Nov 2026, against commit `c9d8920` (`main`).

## 1. What the repository contained

| Area | Finding |
| --- | --- |
| Backend entry | `npm start` ran `nodemon server.js`, which does not exist. The real code was in `app.js`. |
| Server start-up | `app.js` called `app.listen` twice (port 5000 after the DB connected, port 4000 unconditionally). |
| Middleware | The request logger was registered **after** the routes, so it never ran for them. No JSON body parser, no CORS, no error handler. |
| Student routes | `GET /add-student` saved a hardcoded "John" record on every call. `GET /single-student` used a hardcoded ObjectId. Errors were logged and the request was left hanging (no response). |
| Tutorial code | `routes/record.js` and `db/conn.js` were copied unchanged from MongoDB's Airbnb tutorial (`sample_airbnb`, `listingsAndReviews`, swipes and likes). Nothing used them. |
| Student model | Every field a required `String`, dates included (`"14-01-1986"`). No unique admission number, no indexes, no enums. |
| Unused deps | Server: `mongodb` (alongside mongoose), `ejs`. Client: `calendar-reactjs` (pulled in ~390 packages including unmaintained `core-js@1`), Font Awesome, Line Awesome, `scss`. |
| Frontend data | Everything hardcoded: the "Hi, Kevin William" greeting, a Mon–Sun "Academic Result" chart, May 2021 attendance. |
| Demo content | daisyUI sample buttons and a "Shoes!" card on the dashboard. Flowbite docs accordion as the "My Class" page. A lorem.space avatar in the right column. |
| New Admission | Inputs only. No state, no submit, and the date picker's `onChange` was commented out, so the date could not change. Class options misspelled ("Eigth", "Nineth", "Tevelvth"). |
| Navigation | "Academic" linked to `/`, so two menu items pointed at the dashboard. Parents and Personal Details were just headings. |
| React warnings | `class=` instead of `className=` across several pages; `<img>` without `alt`. |
| Layout | Fixed `200px / minmax(500px, 1fr) / 200px` grid, so phones scrolled horizontally. No mobile navigation. |

## 2. Security findings

1. **MongoDB Atlas credentials committed in plain text** in `server/app.js` and `server/.env`. They appear in commits `0ca5480`, `18db011` and `0bd4921`, so they are in the public history of every clone and fork.
   - **Action required (owner):** rotate that Atlas user's password now, or delete the user and create a new one. Moving the value into `.env` does **not** make the old credential safe.
   - Also check Atlas → Network Access. If `0.0.0.0/0` is allowed, restrict it.
   - Optional: purge the history with `git filter-repo` (or BFG) and force-push. This rewrites `main` and every fork keeps the old history, so rotation is what actually matters.
2. No authentication or authorization on any endpoint. **Still true after Phase 1** (see section 4).
3. No input validation, so arbitrary request data could reach Mongo queries (NoSQL operator injection).
4. No rate limiting, no security headers, no CORS policy.
5. Errors were logged but never answered, which leaves connections hanging.

## 3. What Phase 1 changed

### Backend (`server/`)
- New layout: `src/{config,constants,models,validators,services,controllers,routes,middleware,utils}`, `src/app.js` (builds the Express app) and `src/server.js` (entry point).
- `npm start` → `node src/server.js`; `npm run dev` → nodemon. One configurable `PORT`. Clear errors when `MONGODB_URI` is missing or the port is taken. Graceful shutdown.
- Configuration only from environment variables. `.env` removed from git and ignored; `.env.example` added.
- Middleware order: helmet → CORS allow-list (`CORS_ORIGIN`) → rate limit (300 req / 15 min per IP on `/api`) → JSON body (100 kB limit) → operator-key sanitizer → routes → 404 → central error handler. The error handler never returns stack traces.
- Consistent responses: `{ success, message, data, pagination? }` and `{ success: false, message, errors? }`.
- Request validation with zod. Unknown fields are rejected (`.strict()`), so a client cannot set `status` or `admissionNumber` itself.
- Models:
  - `Admission`: application number `APP-YYYY-NNNNN`, status and status history, transition rules, and a unique partial index that blocks duplicate open applications (same normalised name + date of birth + academic year), even under concurrent requests.
  - `Student`: unique admission number `ADM-YYYY-NNNNN`, real `Date` fields, enums, indexes, soft delete, `medicalNotes` excluded from every query and response.
  - `Counter`: atomic sequence numbers.
- Admission workflow: `submitted → under_review → (documents_required ↔ under_review) → approved → enrolled`, and `rejected` from any open state. Enrolling creates the student and marks the application enrolled **in one transaction**. A rejected child can re-apply; an enrolled child cannot.
- Endpoints:
  - `GET /api/health`, `GET /api/meta/classes`, `GET /api/dashboard`
  - `GET|POST /api/admissions`, `GET /api/admissions/:id`, `PATCH /api/admissions/:id/status`, `POST /api/admissions/:id/enroll`
  - `GET /api/students` (pagination, search, class/section/status/year filters, sorting), `GET|PUT|DELETE /api/students/:id`, `PATCH /api/students/:id/status`
- Tests: 12 Jest + Supertest tests against an in-memory MongoDB replica set (`npm test`).

### Frontend (`client/`)
- `services/api.js`: one fetch wrapper, base URL from `NEXT_PUBLIC_API_URL`, readable network errors, field-level server errors.
- Responsive layout: daisyUI drawer, a sidebar that becomes a menu on mobile, and a custom `edupro` theme. The pink gradient and fixed three-column grid are gone.
- **New Admission**: complete form (student, class, parents/guardian, emergency contact), working date picker (DD/MM/YYYY, ages 2–25), client-side validation matching the server, field errors from the server, loading/success/error states, duplicate detection shown to the user.
- **Admissions** (new page): search, status filter, pagination, and review/approve/reject/enrol dialogs. Reject is styled as destructive.
- **Dashboard**: live counts, students-by-class chart, recent applications, and empty states.
- **Students** (`/myclass`): enrolled students with class, section and search filters.
- Attendance, Parents and Personal Details now show an honest "not available yet" state, marked "Soon" in the menu, instead of fake data.
- All demo content, Flowbite text, lorem images and unused dependencies removed. `next lint` and `next build` pass with no warnings.

## 4. Known gaps (not done in Phase 1)

- **No login or roles yet.** Anyone who can reach the API can read and change admissions and students. Do not expose the API to the internet until Phase 2 ships. Until then, run it locally or behind a private network.
- Parent details are embedded on the admission/student records. Phase 3 normalises them into `Parent` and `StudentParent` once parent accounts exist.
- Classes are a fixed list (LKG–12). Sections are free text. Real `Class`, `Section` and `AcademicYear` records come with Phase 3.
- No document uploads yet. They need a storage decision (S3, GCS or Atlas GridFS).
- Single school only. Adding `schoolId` tenancy should happen together with Phase 2 auth, before data grows.

## 5. Recommended order for the remaining work

1. **Auth and RBAC**: `User`, `Role` and permission strings (`students.view`, `admissions.approve`, …) stored in the database. Bcrypt/argon2 password hashing. httpOnly, Secure, SameSite session cookies with expiry and logout. Login rate limiting and lockout. Password reset. Audit log. Middleware on every route checking identity, permission and record scope. Role-aware navigation.
2. **School structure**: school and settings, academic years and terms, classes and sections with capacity and class teachers, subjects, and teacher/staff records. Replace the fixed class list.
3. **People**: parent accounts linked to one or more children, the student profile page with edit/transfer/withdraw/promote and history, and document uploads.
4. **Attendance**: daily per-section entry with a unique (student, date, session) index, holidays and calendar, corrections with authorization, reports.
5. **Exams and results**: exams, subjects with max/pass marks, marks entry → approval → publication (hidden from parents and students until published), grading, report cards.
6. **Timetable** with teacher/room conflict detection; **homework and assignments**.
7. **Fees**: structures, invoices, installments, concessions, recorded payments and receipts. Gateway integration only with verified callbacks.
8. **Notifications** (in-app first, with a channel interface for email/SMS later) and **reports** (CSV/Excel/PDF export).
