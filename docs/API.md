# EduPro API reference

Base URL: `http://<host>:<PORT>/api`. All bodies are JSON, with a 100 kB limit.

> No authentication yet. Every endpoint is open. See README → Known limitations.

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
