# EduPro — Feature Comparison & QA Report

_Date: 2026-11-27 (updated after round 3) · Branch: `claude/app-summary-3jf06g`_

## 1. Summary

EduPro was compared with features that are common across widely used school-management
products: PowerSchool, Fedena, OpenSIS, Gibbon, Teachmint and Classter.

- **What this round added:** the everyday school-life modules those products share. These are
  notifications, announcements, homework, timetable, leave requests, result publishing, report
  cards, promotion and an audit log.
- **How it was checked:** each module was tested from the point of view of the role that uses it.
- **Result:** every automated suite passes, and the production Docker image builds, starts and
  serves the new endpoints.

**Round 3** added student logins with online homework submission, transport, library, certificates
(TC, bonafide, character, study) with public verification, and per-school settings (currency, time
zone, grading scale, academic calendar). See section 9.

| Layer | Suites | Tests | Result |
|---|---|---|---|
| Backend unit (Jest) | 5 | 53 | ✅ all pass |
| Backend integration (Jest + Supertest + real MongoDB replica set) | 10 | 132 | ✅ all pass |
| Frontend (Jest + Testing Library) | 12 | 69 | ✅ all pass |
| End-to-end (Playwright, Chromium, desktop and phone viewports) | 8 files | 25 | ✅ all pass (1.4 min) |
| Production Docker image (API + web in one container) | – | smoke | ✅ rebuilt in round 3; student login and the new endpoints return 200; staff-only transport returns 403 |

**Total: 279 automated tests, 0 failing.**

## 2. Feature matrix against common products

Legend: ✅ built and tested · 🟡 partial · ❌ not built.

| Capability | Common in market | EduPro |
|---|---|---|
| Multi-school and multi-tenant data isolation | PowerSchool, Fedena, Classter | ✅ out-of-scope records return 404 |
| Role-based access (admin, principal/HOD, teacher, parent) | all | ✅ plus permissions admins can grant per user |
| Student profiles: academics, attendance, parents, fees, address, medical | all | ✅ |
| Student and staff photos (self-edit; teacher or parent edits a student's photo) | Teachmint, Fedena | ✅ |
| Global search with autocomplete | PowerSchool, Classter | ✅ |
| Online admission form to enrolment workflow | Fedena, OpenSIS | ✅ |
| Aadhaar-assisted prefill (offline e-KYC XML / QR) | Indian ERPs | 🟡 offline XML/QR works; a live UIDAI or DigiLocker connection needs a licence |
| CSV bulk import of students (dry-run, row errors) | all | ✅ admin, or a teacher an admin enables |
| Cross-school record sharing (request, approve, scoped, expiring) | rare (transfer workflows) | ✅ academic, attendance, personal or fees scopes; read-only |
| Daily attendance and class register | all | ✅ |
| Absence alerts to parents | all | ✅ in-app notifications |
| Homework and assignments | Teachmint, Gibbon | ✅ including online hand-in, late flag, marking and return for redo |
| Class timetable with clash detection (class, teacher, room) | Fedena, Gibbon | ✅ |
| Announcements and notice board (by school, class or role) | all | ✅ |
| Leave requests (parent applies, teacher or principal decides) | Teachmint, Fedena | ✅ approval marks the days as leave in attendance |
| Exam results: draft, then publish | PowerSchool, Fedena | ✅ published results are locked; parents see published only |
| Printable report card | all | ✅ |
| Year-end promotion of a class | Fedena, OpenSIS | ✅ |
| Fee records and payment status | all | ✅ records and payments in the school's currency; no online gateway |
| Reports for teachers, principal/HOD and management, with CSV export | all | ✅ |
| Audit log of sensitive actions | PowerSchool, Classter | ✅ retained for 365 days |
| Mobile-app style UI (bottom tabs, phone layout) | Teachmint, Classter | ✅ per-role themes |
| Email, SMS or WhatsApp delivery | all | ❌ in-app only |
| Online fee payment gateway | most | ❌ |
| Student logins | most | ✅ single or whole-class creation |
| Library (catalogue, lending, fines) | Fedena, Classter | ✅ |
| Transport (routes, stops, riders, capacity) | Fedena, Classter | ✅ no GPS tracking |
| Hostel, inventory | Fedena, Classter | ❌ |
| Payroll and HR | Fedena, Classter | ❌ |
| Exam scheduling and seating plans | Fedena | ❌ |
| Certificates (TC, bonafide, character, study) | Indian ERPs | ✅ with public verification code |
| ID cards | Indian ERPs | ❌ |
| Email-based password reset | all | ❌ admins reset passwords |
| Per-school currency, time zone and grading settings | PowerSchool, Classter | ✅ |
| Academic calendar (terms, holidays, weekly offs) | all | ✅ calendar page; drives leave and register |

## 3. Modules added in this round

| Module | API | UI | Who |
|---|---|---|---|
| Notifications (bell, unread count, mark read) | `/api/notifications` | bell in the app bar | everyone |
| Announcements | `/api/announcements` | `/announcements` | principal and admin post; everyone reads |
| Homework | `/api/homework` | `/homework` | teachers post; parents see their children's classes |
| Timetable | `/api/timetable` | `/timetable` | principal and admin edit; teachers and parents view |
| Leave requests | `/api/leave` | `/leave` | parent applies; teacher or principal decides |
| Result publishing | `/api/results/status`, `/api/results/publish` | `/results` | principal and admin |
| Report card | `/api/students/:id/report-card` | `/students/:id/report-card` (print) | staff and parents |
| Promotion | `/api/promotion` | `/students/promote` | principal and admin |
| Audit log | `/api/audit` | `/audit` | admin |

## 4. QA scenarios run

Each scenario is covered by automated tests. **I** = integration, **F** = frontend, **E** = end-to-end.

| # | Scenario | Expected | Layer | Result |
|---|---|---|---|---|
| 1 | Teacher posts homework for their own class | Created; parents of that class are notified | I, E | ✅ |
| 2 | Teacher posts homework for a class they don't teach | 403 | I | ✅ |
| 3 | Parent lists homework | Only their children's classes | I, E | ✅ |
| 4 | Timetable: same teacher in two classes in one period | 409 with a clash message | I | ✅ |
| 5 | Timetable: same room double-booked | 409 | I | ✅ |
| 6 | Parent applies for leave; teacher approves | Mon–Sat days marked "leave"; holidays kept; parent notified | I, E | ✅ |
| 7 | Parent applies for another family's child | 404 | I | ✅ |
| 8 | Principal publishes Term 1 | Results locked; parents notified | I, E | ✅ |
| 9 | Teacher edits a published result | 403 (locked) | I | ✅ |
| 10 | Parent views draft results | Hidden; only published results appear | I, E | ✅ |
| 11 | Shared-record viewer from another school | Sees published results only, read-only | I, E | ✅ |
| 12 | Report card prints with marks, attendance % and remarks | Rendered | F, E | ✅ |
| 13 | Teacher marks a student absent | Parent receives an absence notification (once per new absence) | I | ✅ |
| 14 | Promotion of 7A to 8A | Students moved; graduates handled; audited | I | ✅ |
| 15 | Admin opens the audit log | Sign-ins, publishes and promotions listed once each | I | ✅ |
| 16 | Non-admin opens the audit log | 403 | I | ✅ |
| 17 | Announcement aimed at "parents" | Not shown to teachers | I | ✅ |
| 18 | The notification API fails | Page still renders (the bell fails safely) | F | ✅ |
| 19 | Phone viewport (390px) across new pages | No horizontal overflow; bottom tabs filtered by role | E | ✅ |
| 20 | Full school week across 4 roles (principal, teacher, parent, admin) | All steps pass | E | ✅ |
| 21 | Earlier scenarios (admissions, CRUD, search, register, reports, import, sharing, Aadhaar, roles, auth, edge cases) | Unchanged | I, F, E | ✅ |

## 5. Defects found and fixed during QA

| Defect | Cause | Fix |
|---|---|---|
| Audit events were missing after sign-in | pino child loggers inherited the "already wrapped" marker, so they were never wrapped | Check an own property, and store each event exactly once |
| 13 frontend tests crashed | The notification bell threw when API mocks lacked notifications | Made the bell fail safely |
| Shared viewers could see draft marks | No published filter on the share path | Shared viewers and parents get published results only |
| An e2e leave step passed without checking anything | Weak assertion | Now asserts the day is recorded as leave |
| The phone-tabs check ran on the print page, which has no layout | Wrong page | Moved the check to a page with the layout |
| The Docker build failed on an apt step in a restricted network | Optional fonts package | Removed it; the image builds and runs |
| Lint error in JSX | Unescaped apostrophe | Escaped |

Earlier rounds fixed:

- A temporal-dead-zone crash on the profile page.
- Feb 31 dates rolling over silently.
- `medicalNotes` leaking into list responses.
- Subdocument payment deletes.
- Tailwind content scanning.
- daisyUI hover colours.
- Slow tests caused by the auth rate limiter.

## 6. Security checks

- Sessions are server-side; only a SHA-256 hash of the token is stored.
- The session cookie is httpOnly and SameSite=Strict.
- JSON-only writes, plus an `X-Requested-With` header on multipart uploads, protect against CSRF.
- Sign-in is rate limited, and helmet sets security headers.
- Records outside the user's scope return 404, so their existence isn't revealed.
- Aadhaar numbers and files are never stored; only the last 4 digits are shown.
- Secrets come from the environment; `.env` is git-ignored.
- ⚠️ **Action required:** an old MongoDB Atlas password was committed in an early commit of this
  repository. Rotate it in Atlas before any real deployment.

## 7. Deployment status

- **Verified here:** the production image (API and web in one container, `deploy/start.sh`) was
  built and run again after round 3, against the seeded demo database.
- **Not live yet:** no public deployment was made. Publishing needs the owner's Render account
  (or another host) and a MongoDB Atlas cluster. A Render API key wasn't provided, so this
  session can't publish on the owner's behalf.
- **One-click route:** follow `docs/DEPLOY-RENDER.md`. In Render, choose New → Blueprint, pick
  this repository and `render.yaml` is used. Then set `MONGODB_URI` and run the seed once.

## 8. Recommended next steps

1. Email or SMS delivery for notifications, through a provider such as SES, Twilio or MSG91.
2. An online fee payment gateway (Razorpay or Stripe) with receipts.
3. File uploads for homework (photos of notebook work, PDFs).
4. Hostel, inventory, ID cards, and exam timetables with seating plans.
5. Live bus tracking (GPS) and automatic transport fees on the fee ledger.

## 9. Round 3: student logins, homework hand-in, transport, library, certificates, settings

### What was built

| Module | API | UI | Who |
|---|---|---|---|
| Student logins | `/api/users` (role `student`), `/api/users/student-logins` | Users → Students, "Logins for a class"; student home; violet theme | admin creates; student signs in |
| Online homework | `/api/homework/:id/submission`, `/submissions`, `/review` | Homework page: hand-in form, Submissions dialog | student hands in; teacher marks or returns; family notified |
| School settings | `/api/schools/:id/settings` | `/settings` | admin, principal of the school |
| Calendar | `/api/schools/:id/calendar` | `/calendar` | everyone in the school |
| Transport | `/api/transport/*` | `/transport`; profile "Bus & library" tab | admin, principal, granted teachers; families view |
| Library | `/api/library/*` | `/library` (catalogue, loans) | admin, principal, granted teacher (librarian); families browse |
| Certificates | `/api/certificates/*` | `/certificates`, `/certificates/:id` (print), `/verify/:code` (public) | admin, principal; families view their own |

Where the settings are used: grades and pass/fail on results, report cards and the exam reports; fee
amounts and messages; "today" for attendance, the teacher's class summary and late homework; leave
approval (skips weekly offs and holidays); the register's holiday warning; library fines, loan period
and book limit; whether late homework is accepted; the report card's attendance period.

### QA scenarios run (round 3)

| # | Scenario | Expected | Layer | Result |
|---|---|---|---|---|
| 22 | Student login without a linked record, a second login for the same student, a teacher with a student link | 400, 409, 400 | I | ✅ |
| 23 | Student lists students, opens a classmate, opens fees, edits own record | Only self; 404; 403; 403 | I, E | ✅ |
| 24 | Student sees results before and after publishing | Hidden, then shown; notified | I | ✅ |
| 25 | Announcement for "students" | Students see it, parents don't | I | ✅ |
| 26 | Whole-class logins; second run | New logins for those without; nothing on the second run; login works with the returned password; principal → 403 | I | ✅ |
| 27 | Student in another section / parent / empty answer / `javascript:` link | 404 / 403 / 400 / 400 | I | ✅ |
| 28 | Hand in → teacher roster → mark above max / without marks / valid | Roster counts right; 400; 400; 200 and family notified | I, F, E | ✅ |
| 29 | Re-submit after marking; return for redo then re-submit | 409; allowed | I | ✅ |
| 30 | Paper homework submitted online | 400 | I | ✅ |
| 31 | Late hand-in; school refuses late work | Flagged late; 400 | I | ✅ |
| 32 | Parent reads settings of another school; teacher or other principal edits | 404; 403; 404 | I, F | ✅ |
| 33 | Bad time zone, currency, grading scale without 0%, 30 February | 400 each | I | ✅ |
| 34 | Custom grading scale and pass mark | Results, report card and exam report use them | I | ✅ |
| 35 | USD currency | Fee summary and messages show $; profile shows $1,500 | I, E | ✅ |
| 36 | Leave over a holiday; register on a holiday; calendar | Holiday skipped; `offDay` warning; holiday listed | I, E | ✅ |
| 37 | Route: teacher without grant, other principal, duplicate stop names, duplicate route | 403, 404, 400, 409 | I | ✅ |
| 38 | Assign: wrong stop, full bus, other school's student | 400, 409, 404 | I | ✅ |
| 39 | Remove a stop in use, delete a route with riders | 400, 409 | I | ✅ |
| 40 | Parent sees bus details; riders list has a parent phone | Shown | I, E | ✅ |
| 41 | Admin grants transport to a teacher | Teacher can create routes | I | ✅ |
| 42 | Lend last copy, then again | Second → "No copies are available" | I | ✅ |
| 43 | Lend to another school's student; reduce copies below loans | 400; 400 | I | ✅ |
| 44 | Return 5 days late at 5/day; return twice | Fine 25 due; 409 | I | ✅ |
| 45 | New loan with unpaid fine; after collecting | 409; allowed | I | ✅ |
| 46 | Book limit 1 | Second loan → 409 with the limit in the message | I | ✅ |
| 47 | Student browses the catalogue; another school's parent | Own school only; empty | I, F | ✅ |
| 48 | Bonafide without purpose; teacher issues; other principal issues | 400, 403, 404 | I | ✅ |
| 49 | Family views own certificate; another parent; another principal | 200; 404; 404 | I | ✅ |
| 50 | Public verification; wrong code; snapshot not exposed | Genuine; 404; no private fields | I, F, E | ✅ |
| 51 | TC with dues → confirm; second TC; bonafide after TC | 409 then 201 and student transferred; 409; 400 | I, F, E | ✅ |
| 52 | Cancel a TC | Student back on the roll; verification shows cancelled | I | ✅ |
| 53 | Student on a phone: home, homework, calendar, library | No horizontal overflow; bottom tabs Home/Homework/Timetable/Calendar/Account | E, manual screenshots | ✅ |

### Defects found and fixed in round 3

| Defect | Cause | Fix |
|---|---|---|
| Parents' home card showed the latest result even when it was a draft | `/me/children` didn't filter by status | Families now get published results only |
| Transport and certificate notifications were silently dropped | Notification type list didn't include them | Added `transport`, `library`, `certificate` |
| A grade name like "Distinction" was rejected | 10-character limit | Raised to 20 |
| Library fine one day short | Due date compared with a time-of-day | Compare dates only |
| Fee messages always said ₹ | Hard-coded symbol | Formatted with the school's currency and locale |
| Student home and other new cards were wider than a phone screen | Grid without an explicit single column let long titles widen it | `grid-cols-1` on phones |
| Due-date badge wrapped on phones | No `nowrap` | Fixed |

### Known gaps after round 3

- Homework hand-in accepts text and links, not file uploads.
- A librarian or transport teacher can only search students in their own classes (search follows class scope); principals and admins can search the whole school.
- Transport has no GPS tracking, and the per-stop fee isn't added to the fee ledger automatically.
- Certificates have no digital signature; verification is by the random code on the page.
