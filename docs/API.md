# EduPro API reference

Base URL: `http://<host>:<PORT>/api`. All bodies are JSON, with a 100 kB limit.

> Every endpoint except `/health`, `/ready`, `/meta/classes` and `/auth/login` requires a signed-in session and returns **401** without one.

## Conventions

**Success**
```json
{ "success": true, "message": "Students retrieved successfully", "data": [], "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 } }
```
**Error**
```json
{ "success": false, "message": "Validation failed", "errors": [{ "field": "father.phone", "message": "Enter a valid phone number" }] }
```

| Status | Meaning |
| --- | --- |
| 400 | Validation failed, invalid id, malformed JSON, or a disallowed status change |
| 404 | Record or route not found (including soft-deleted students) |
| 409 | Duplicate (application, student, roll number) or a concurrent edit conflict |
| 413 | Body over 100 kB |
| 429 | Rate limit exceeded (default 300 requests per 15 min per IP; health checks exempt) |
| 500 / 503 | Server error (generic message) / database unavailable (`/ready`) |

- Unknown fields are rejected, so clients cannot set `status`, `admissionNumber` and similar fields themselves.
- Keys starting with `$` or containing `.` are stripped from every request.
- Empty strings in optional fields are treated as "not provided".
- Every response carries an `X-Request-Id` header (or echoes a valid incoming one). Quote it when reporting a problem.
- List endpoints take `page` (≥1), `limit` (1–100, default 10), `search` and `sort`.
  - `search` matches word prefixes of first, middle and last names and the record number, case-insensitively. Every word must match: `mary le` finds "Mary Ann Lee".

## Authentication

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/login` | `{ username, password }` → 200 with `{ user, expiresAt }` and an `edupro_session` cookie. Wrong credentials → 401 with one generic message. 5 failures → account locked for 15 min. 10 failed attempts per IP per 15 min → 429. |
| POST | `/auth/logout` | Deletes the session server-side and clears the cookie |
| GET | `/auth/me` | `{ user, expiresAt }` for the current session |

The cookie is `HttpOnly; SameSite=Strict; Path=/`, plus `Secure` in production. It expires after `SESSION_HOURS` (default 8). Only a SHA-256 hash of the token is stored, and expired sessions are removed automatically. `POST`, `PUT` and `PATCH` must use `Content-Type: application/json` (otherwise 415), which together with SameSite=Strict blocks cross-site request forgery. Call the API through the web app's `/api` proxy so the cookie is first-party.

## Health

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Liveness. 200 while the process is running. Never touches the database. |
| GET | `/ready` | Readiness. 200 if the database answers a ping, otherwise 503. |
| GET | `/meta/classes` | `[{ code, label }]` for LKG–12 |
| GET | `/dashboard` | `{ totalStudents, pendingAdmissions, approvedAwaitingEnrolment, studentsByClass: [{className, count}], recentAdmissions: [...] }` |

## Admissions

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/admissions` | `status`, `classApplied`, `academicYear`, `search`, `sort` (`-createdAt` default, `createdAt`, `lastName`, `-lastName`) |
| POST | `/admissions` | Application (below). Optional `saveAsDraft: true`. → 201 |
| GET | `/admissions/:id` | Includes `statusHistory` |
| PATCH | `/admissions/:id/status` | `{ status, note? }` |
| POST | `/admissions/:id/enroll` | `{ section?, rollNumber?, admissionDate? }` → 201 `{ admission, student }` |

**Application fields**
- Required: `firstName`, `lastName`, `dateOfBirth` (`YYYY-MM-DD`, age 2–25), `gender` (`male|female|other`), `address`, `classApplied` (`LKG|UKG|1`–`12`), `academicYear` (`2026-2027`).
- Optional: `middleName`, `bloodGroup`, `nationality`, `previousSchool`, plus these contact objects:
  - `father` / `mother`: `{ name, phone, email, occupation }`
  - `guardian`: `{ name, relation, phone, email }`
  - `emergencyContact`: `{ name, relation, phone }`
- At least one parent or guardian name and one phone number are required.

**Status rules**

```
draft → submitted → under_review ⇄ documents_required
                         └→ approved ──(enroll)──► enrolled
any open status → rejected        (rejected and enrolled are final)
```

**Duplicates**
- An open application for the same child (same name and date of birth, ignoring case and spacing) in the same academic year → 409. This holds under concurrent requests.
- A child who is already enrolled → 409.
- A rejected child may apply again.

**Enrolment** runs in a transaction. It assigns `ADM-<year>-<00001>`, creates the student, and marks the application enrolled. If anything fails (for example, the roll number is taken), nothing is saved.

## Students

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/students` | `className`, `section`, `status`, `academicYear`, `search`, `sort` (`lastName` default, `-lastName`, `admissionNumber`, `-admissionNumber`, `rollNumber`, `createdAt`, `-createdAt`) |
| GET | `/students/:id` | |
| PUT | `/students/:id` | Any personal field, plus `className`, `section`, `rollNumber`, `medicalNotes` (write-only) |
| PATCH | `/students/:id/status` | `{ status }`: `active|inactive|transferred|withdrawn|graduated` |
| DELETE | `/students/:id` | Soft delete. Hidden afterwards; frees the roll number. |

Students are created only by enrolling an admission. A roll number is unique per academic year, class and section (409 if taken). If two people edit the same record at once, the later save gets a 409 instead of silently overwriting.

## Schools

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/schools` | `search`, `page`, `limit` (default 50). Each school includes `activeStudents`. |
| POST | `/schools` | `{ name, code (2–8 letters/digits), board?, address?, city?, phone?, email?, principalName?, active? }`. A duplicate code → 409. |
| GET / PUT / DELETE | `/schools/:id` | Changing the code once students exist → 409. Deleting a school that has students or admissions → 409; mark it `active: false` instead. Inactive schools refuse new students and applications. |

`school` (a school id) is now required when creating admissions (`POST /admissions`) and students. Admission numbers are `<CODE>-<year>-<00001>`, numbered per school per year.

## Students (direct create, photos)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/students` | Registers an existing student: the personal fields plus `school`, `className`, `academicYear`, `section?`, `rollNumber?`, `admissionDate?`, `email?`, `phone?`, `transport?` (`school_bus|private|walking|other`), `busRoute?`, `medicalNotes?`. A duplicate name and date of birth → 409. |
| GET | `/students?school=` | Also filters by school. Rows include `school {id,name,code}` and `photoUrl`. |
| PUT | `/students/:id/photo` | `multipart/form-data` with one field, `photo` (JPEG, PNG, WebP or HEIC, ≤ 5 MB), plus the header `X-Requested-With: EduPro`. The image is re-encoded to a 512×512 JPEG with metadata removed. Not an image → 400; too large → 413. |
| GET | `/students/:id/photo` | Requires a session. `Cache-Control: private`. Supports ETag / 304. |
| DELETE | `/students/:id/photo` | |

## Attendance (per student)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/students/:id/attendance?from=&to=` | Dates are `YYYY-MM-DD`. The default range is 1 April to today, at most 400 days. Returns `summary { present, absent, late, half_day, leave, holiday, workingDays, percentage }` and `records`. Percentage = (present + late + ½ × half days) ÷ days that aren't holidays. |
| PUT | `/students/:id/attendance/:date` | `{ status, note? }`. Marks or corrects one day (one record per student per day). Future dates → 400. |
| DELETE | `/students/:id/attendance/:date` | |

## Exam results

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/students/:id/results` | Each result includes `total`, `maxTotal`, `percentage`, `grade` (A1 ≥ 91 … D ≥ 33, E below), `passed`, and the same per subject. |
| POST | `/students/:id/results` | `{ academicYear, exam, examDate?, subjects: [{ subject, maxMarks, marks }], remarks? }`. Marks over the maximum or duplicate subjects → 400. One result per exam per year → 409. |
| PUT / DELETE | `/students/:id/results/:resultId` | A record id belonging to a different student → 404. |

## Fees

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/students/:id/fees` | `summary { billed, paid, balance, overdue, overdueCount, status }` and `invoices` (each with `paid`, `balance`, `status` paid/partial/unpaid, and `overdue`). |
| POST | `/students/:id/fees` | `{ academicYear, title, amount (whole ₹), dueDate }` |
| PUT / DELETE | `/students/:id/fees/:feeId` | The amount can't go below what has been paid. A fee with payments can't be deleted (409). |
| POST | `/students/:id/fees/:feeId/payments` | `{ amount, method (upi|cash|card|bank_transfer|cheque), paidAt?, reference? }`. Assigns a receipt number `RCPT-<CODE>-<year>-<00001>`. Overpaying → 400; already paid → 409. Simultaneous payments can't overpay. These are records of money received; no payment gateway is involved. |
| DELETE | `/students/:id/fees/:feeId/payments/:paymentId` | For correcting mistakes. |

## Search

`GET /search?q=<text>&limit=8` matches name or admission-number prefixes across all schools and returns students with their school and `photoUrl`. It is used by the type-ahead search box.

`GET /dashboard?school=<id>` also returns `attendance` (the latest marked day), `fees { billed, collected, outstanding, overdue, overdueInvoices }` and `studentsBySchool`.

## Attendance register (whole class)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/attendance/register?school=&className=&section=&date=` | Active students in that class (and section, if given) in roll order, each with `attendance` for the date (or `null`). `marked` is how many already have a mark. |
| PUT | `/attendance/register` | `{ school, className, section?, date, entries: [{ student, status, note? }] }`, up to 200 entries. Saved in one bulk upsert. Students outside the class, inactive students and duplicates → 400 and nothing is saved. Future dates → 400. |

## Reports

`GET /reports/<name>?school=&className=&section=&format=json|csv`. With `format=csv` the response is a file download (`Content-Disposition: attachment`, UTF-8 with BOM, `Cache-Control: private, no-store`). Cells that start with `= + - @` are prefixed with `'` so spreadsheets don't run them as formulas.

| Name | Rows |
| --- | --- |
| `fee-defaulters` | Students with an overdue balance: `overdue`, `balance`, `overdueBills`, `oldestDue`, largest first. `data.overdue` is the total. |
| `low-attendance` | Also takes `threshold` (default 75), `from` and `to`. Shows `days`, `absent` and `percentage`, lowest first. Holidays don't count as school days. |
| `students` | Class list with gender, date of birth, address, transport and the first parent's name and phone. |


## School life (notifications, announcements, homework, timetable, leave, results)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/notifications?unread=true` | `{ items, unread }` for the signed-in person. |
| POST | `/notifications/read` | `{ ids }` or `{ all: true }`. |
| GET / POST / DELETE | `/announcements` | Posting needs `announcements.manage`. `audience`: `everyone`, `parents`, `students` or `staff`; optional `school`, `className`, `eventDate`, `expiresAt`, `pinned`. |
| GET | `/homework?upcoming=true` | Scoped to the person's classes or children. Families get `submissions` (their own); staff get `submissionCounts`. |
| POST | `/homework` | `{ school, className, section?, subject, title, details?, dueDate, maxMarks?, onlineSubmission? }`. Only for an assigned class. |
| PUT | `/homework/:id/submission` | Student only. `{ text?, link? }` (one is required; links must be http/https). Re-submitting is allowed until marked. Late = after the due date in the school's time zone; refused if the school doesn't accept late work. |
| GET | `/homework/:id/submissions` | Teacher. Class roster with each submission, plus `summary { students, submitted, late, graded, missing }`. |
| POST | `/homework/:id/submissions/:subId/review` | `{ action: grade|return, marks?, feedback? }`. Marks are required when the homework has `maxMarks`; returning needs feedback. |
| GET / PUT / DELETE | `/timetable`, `/timetable/mine`, `/timetable/slot` | Clashes for a class, teacher or room in the same period → 409. |
| GET / POST | `/leave`, `/leave/:id/decision`, `/leave/:id/cancel` | Approval marks the school days (skipping weekly offs and holidays) as leave. |
| GET / POST | `/results/status`, `/results/publish` | Publishing locks marks; parents, students and other schools see published results only. |
| GET | `/students/:id/report-card?academicYear=` | Results graded on the school's scale, attendance for the school's academic year, `grading` and `terms`. |
| POST | `/promotion` | Year-end promotion of a class. |
| GET | `/audit` | Admin only. |

## Student logins

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/users` | `role: "student"` needs `student` (a student id). One login per student (409 for a second). |
| POST | `/users/student-logins` | Admin. `{ school, className, section? }`. Creates logins for every active student in the class who has none. Returns `{ created: [{ name, username, password, … }], skipped }`; passwords are shown only in this response. |

## School settings and calendar

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/schools/:id/settings` | Anyone who belongs to the school (staff, parents and students of its children). Returns the settings with defaults filled in. |
| PUT | `/schools/:id/settings` | `settings.manage` (admin, or the school's principal). Any of `currency` (ISO code), `locale`, `timezone` (IANA name), `academicYearStartMonth`, `weeklyOffs` (0 = Sunday), `passPercentage`, `gradingScale [{ min, grade, remark? }]` (one band must start at 0), `terms [{ name, start, end }]`, `holidays [{ date, name }]`, `library { finePerDay, loanDays, maxBooks }`, `homework { allowLate }`. |
| GET | `/schools/:id/calendar?from=&to=` | Holidays, terms, weekly offs, events (announcements with an `eventDate` for this audience) and homework due dates the person can see. At most 400 days. |

The attendance register response also includes `offDay` (the holiday's name, or "Weekly off") when the date isn't a school day.

## Transport

All need staff access; changes need `transport.manage` (admin, principal, or a teacher it was granted to).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/transport/routes?school=` | With `riders` per route. |
| POST / PUT | `/transport/routes`, `/transport/routes/:id` | `{ school, name, vehicleNumber?, driverName?, driverPhone?, attendantName?, attendantPhone?, capacity, stops: [{ name, pickupTime?, dropTime?, fee? }] }`. Names are unique per school. Capacity can't go below the riders; stops in use can't be removed. |
| DELETE | `/transport/routes/:id` | 409 while students are assigned. |
| GET | `/transport/routes/:id/riders` | By stop order, with one parent phone each. |
| PUT | `/transport/assign` | `{ student, route, stop }`, or `{ student, route: null }` to take them off. Full route → 409. Parents and the student are notified. |

## Library

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/library/books?school=&search=&available=true` | Staff see their schools; parents and students see their children's schools. `available = copies - issued`. |
| POST / PUT / DELETE | `/library/books`, `/library/books/:id` | `library.manage`. Copies can't go below copies on loan; a book on loan can't be removed. |
| GET | `/library/issues?school=&status=open|overdue|returned|fines&student=` | `library.manage`. |
| POST | `/library/issues` | `{ book, student, dueDate? }`. Due date defaults to the school's loan period. Refused when no copy is free (taken atomically), when the student is at the school's book limit, already has that book, or has an unpaid fine. |
| POST | `/library/issues/:id/return` | `{ fine?: collect|waive|later }`. Fine = days late × the school's daily fine. Returning twice → 409. |
| POST | `/library/issues/:id/fine` | `{ action: collect|waive }` for an unpaid fine. |

## Certificates

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/certificates?school=&type=&student=` | `certificates.issue` (admin, principal). |
| POST | `/certificates` | `{ student, type: transfer|bonafide|character|study, purpose?, reason?, leavingDate?, conduct?, remarks?, ignoreDues? }`. Bonafide needs `purpose`; TC needs `reason`. A TC with fees due → 409 (with an `ignoreDues` field error) unless `ignoreDues: true`; it marks the student as transferred. One active TC per student. Details are stored as a snapshot. |
| GET | `/certificates/:id` | Issuing staff of that school, or the student's own parent or student login. |
| POST | `/certificates/:id/cancel` | `{ reason }`. Cancelling a TC puts the student back to their previous status. |
| GET | `/certificates/verify/:code` | **Public.** Only type, serial, student name, school, issue date and status. |
| GET | `/students/:id/services` | Bus assignment, library loans and certificates for one student (not available under a cross-school share). |

## Progress, class insights and receipts

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/students/:id/progress` | Anyone who can see the student (not under a cross-school share). For the school's academic year: `results { exams, subjects (with previous and change), latest, change }`, `attendance { percentage, schoolDays, absent, monthly }`, `homework { summary, recent }`, `library { onLoan, overdue }`, and `fees` only for people with `fees.view`. Parents and students get published results only. |
| GET | `/insights/class?school=&className=&section=` | `reports.view` and assigned to the class (principals: their schools). Per student: attendance, latest exam (drafts included), online homework handed in, fees (only with `fees.view`) and `flags` (`low_attendance`, `failing`, `missing_homework`, `fees_overdue`). Plus `summary` and `daily` attendance for the last 14 marked days. |
| GET | `/students/:id/fees/:invoiceId/payments/:paymentId/receipt` | `fees.view`. Receipt number, date, amount (`amountText` in the school's currency), method, reference, the bill, the balance after this payment, student and school details. |

## Librarian

`role: "librarian"` users are created with `schools` (the libraries they run). They have `library.manage`, `students.search` (their schools) and `schools.view`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/library/dashboard?school=` | Books (titles, copies, on shelf), loans (on loan, overdue, due today, this month, returns), fines (due, collected and waived this month), reservations (waiting, ready), the 5 most-borrowed books in 90 days and the oldest 10 overdue loans. |
| POST | `/library/issues/:id/renew` | Extends by the loan period. At most 2 renewals; not when overdue or when students are waiting. |
| POST | `/library/issues/:id/remind` | Overdue loans only. In-app notification to the student and parents with the fine so far. |
| POST | `/library/remind-overdue` | `{ school }`. Every overdue loan not reminded in the last 2 days. |
| POST | `/library/books/:id/reserve` | Student: for themselves. Parent: `{ student }` (their child). Library staff: `{ student }` in their school. Only when no copy is free; one open reservation per book, 3 per student. Returns the queue `place`. |
| GET | `/library/reservations?school=&status=waiting|ready|open` | Families: their own. Library staff: their schools. |
| DELETE | `/library/reservations/:id` | Cancel (the student's family or library staff). A ready copy passes to the next in line. |
| POST | `/library/books/import?dryRun=true` | Multipart: `school`, `file` (CSV with `title,author,isbn,category,publisher,shelf,copies`). Errors by row (nothing saved); a matching ISBN, or title and author, adds copies. |
| GET | `/library/books/import/template` | CSV template. |

Lending respects holds: copies kept for reservations can only be lent to the student they're kept for, and lending fulfils that reservation. Returning a book moves the next waiting reservation to `ready` for 3 days and notifies the family. `GET /library/books` now also returns `onHold`, `waiting`, `available` (after holds) and, for families, `myReservation`.
