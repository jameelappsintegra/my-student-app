// Library catalogue, lending and late fines.
const router = require("express").Router();
const { z } = require("zod");
const Book = require("../models/Book");
const BookIssue = require("../models/BookIssue");
const BookReservation = require("../models/BookReservation");
const { notify, parentsOf } = require("../services/notificationService");
const { fileUpload } = require("../middleware/upload");
const Student = require("../models/Student");
const { validate, validateId } = require("../middleware/validate");
const { requirePermission: perm, isFamily, familyIds } = require("../middleware/authorize");
const { can } = require("../constants/permissions");
const { objectId, optionalText } = require("../validators/common");
const { assertSchool, schoolFilter } = require("../services/schoolAccess");
const { visibleSchoolIds, oid } = require("../services/classScope");
const { getSettings, money, todayIn } = require("../services/schoolSettings");
const { escapeRegex } = require("../utils/query");
const ApiError = require("../utils/ApiError");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const { toPublic } = require("../utils/serialize");

const DAY = 86400000;
const day = (s) => new Date(`${s}T00:00:00.000Z`);
const isoDay = /^\d{4}-\d{2}-\d{2}$/;

const HOLD_DAYS = 3;

// Ready holds past their pick-up date expire, and the next waiting
// reservation moves up. Returns the number of copies now held.
async function refreshHolds(bookId, settings) {
  const today = day(todayIn(settings.timezone));
  await BookReservation.updateMany({ book: bookId, status: "ready", readyUntil: { $lt: today } }, { $set: { status: "expired" } });
  const book = await Book.findById(bookId).lean();
  if (!book) return 0;
  let held = await BookReservation.countDocuments({ book: bookId, status: "ready" });
  // Each free copy goes to the next student in the queue.
  while (book.copies - book.issued - held > 0) {
    const next = await BookReservation.findOneAndUpdate(
      { book: bookId, status: "waiting" },
      { $set: { status: "ready", readyAt: new Date(), readyUntil: new Date(today.getTime() + HOLD_DAYS * DAY) } },
      { sort: { createdAt: 1 }, new: true }
    );
    if (!next) break;
    held += 1;
    const family = await parentsOf([next.student]);
    await notify(family.map((u) => u._id), { type: "library", title: `Ready to collect: ${book.title}`, body: `Your reserved book is kept at the library until ${next.readyUntil.toISOString().slice(0, 10)}.`, link: "/library" });
  }
  return held;
}

const bookBody = z.object({
  school: objectId,
  title: z.string().trim().min(1, "Enter the title").max(200),
  author: optionalText(120),
  isbn: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().regex(/^[0-9X-]{10,17}$/i, "ISBN is 10 or 13 digits").optional()),
  category: optionalText(60),
  publisher: optionalText(120),
  shelf: optionalText(30),
  copies: z.coerce.number().int().min(1, "At least one copy").max(1000),
}).strict();

// Catalogue: staff see their schools; students and parents can browse
// their own school's books.
router.get("/books", validate(z.object({ school: objectId.optional(), search: optionalText(80), available: z.enum(["true", "false"]).optional() }).strict(), "query"), h(async (req, res) => {
  const q = req.valid.query;
  let filter;
  if (isFamily(req.user)) {
    const ids = await visibleSchoolIds(req.user);
    filter = { school: { $in: (q.school ? ids.filter((x) => x === q.school) : ids).map(oid) } };
  } else filter = schoolFilter(req.user, q.school);
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), "i");
    filter = { $and: [filter, { $or: [{ title: rx }, { author: rx }, { isbn: rx }, { category: rx }] }] };
  }
  if (q.available === "true") filter = { $and: [filter, { $expr: { $lt: ["$issued", "$copies"] } }] };
  const rows = await Book.find(filter).sort({ title: 1 }).limit(300);
  const holds = await BookReservation.aggregate([
    { $match: { book: { $in: rows.map((b) => b._id) }, status: { $in: ["waiting", "ready"] } } },
    { $group: { _id: { b: "$book", s: "$status" }, n: { $sum: 1 } } },
  ]);
  const count = (b, st) => holds.find((x) => String(x._id.b) === String(b._id) && x._id.s === st)?.n || 0;
  // Families also see whether they've reserved each book.
  const mine = isFamily(req.user)
    ? new Map((await BookReservation.find({ book: { $in: rows.map((b) => b._id) }, student: { $in: familyIds(req.user).map(oid) }, status: { $in: ["waiting", "ready"] } }).lean()).map((r) => [String(r.book), r]))
    : null;
  sendSuccess(res, {
    message: "Books",
    data: rows.map((b) => {
      const j = b.toJSON();
      const onHold = count(b, "ready");
      return { ...j, onHold, waiting: count(b, "waiting"), available: Math.max(0, j.copies - j.issued - onHold), ...(mine ? { myReservation: mine.get(String(b._id)) ? { id: String(mine.get(String(b._id))._id), status: mine.get(String(b._id)).status, readyUntil: mine.get(String(b._id)).readyUntil } : null } : {}) };
    }),
  });
}));

router.post("/books", perm("library.manage"), validate(bookBody), h(async (req, res) => {
  assertSchool(req.user, req.valid.body.school);
  const b = await Book.create(req.valid.body);
  req.log.info({ event: "library.book.create", bookId: b.id }, "Book added");
  sendSuccess(res, { status: 201, message: `${b.title} added`, data: b });
}));

const loadBook = async (user, id) => {
  const b = await Book.findById(id);
  if (!b) throw ApiError.notFound("Book not found");
  assertSchool(user, b.school, "book");
  return b;
};

router.put("/books/:id", validateId, perm("library.manage"), validate(bookBody), h(async (req, res) => {
  const b = await loadBook(req.user, req.params.id);
  if (String(req.valid.body.school) !== String(b.school)) throw ApiError.badRequest("A book can't move to another school.");
  if (req.valid.body.copies < b.issued) throw ApiError.badRequest(`${b.issued} copies are out on loan; copies can't be lower.`);
  b.set(req.valid.body);
  await b.save();
  sendSuccess(res, { message: `${b.title} updated`, data: b });
}));

router.delete("/books/:id", validateId, perm("library.manage"), h(async (req, res) => {
  const b = await loadBook(req.user, req.params.id);
  if (b.issued > 0) throw ApiError.conflict("Copies of this book are still out on loan.");
  await BookIssue.deleteMany({ book: b._id });
  await b.deleteOne();
  req.log.info({ event: "library.book.delete", bookId: req.params.id }, "Book removed");
  sendSuccess(res, { message: "Book removed" });
}));

const present = (x, today) => ({
  ...toPublic(x),
  book: x.book?.title ? { id: String(x.book._id), title: x.book.title, author: x.book.author } : x.book,
  student: x.student?.firstName ? { id: String(x.student._id), name: `${x.student.firstName} ${x.student.lastName}`, className: x.student.className, section: x.student.section, admissionNumber: x.student.admissionNumber } : x.student,
  overdue: !x.returnedAt && x.dueAt.toISOString().slice(0, 10) < today,
});

router.get("/issues", perm("library.manage"), validate(z.object({ school: objectId.optional(), status: z.enum(["open", "overdue", "returned", "fines"]).optional(), student: objectId.optional() }).strict(), "query"), h(async (req, res) => {
  const q = req.valid.query;
  const filter = { ...schoolFilter(req.user, q.school), ...(q.student ? { student: oid(q.student) } : {}) };
  const today = todayIn((await getSettings(q.school)).timezone);
  if (q.status === "open") filter.returnedAt = null;
  if (q.status === "overdue") Object.assign(filter, { returnedAt: null, dueAt: { $lt: day(today) } });
  if (q.status === "returned") filter.returnedAt = { $ne: null };
  if (q.status === "fines") filter.fineStatus = "due";
  const rows = await BookIssue.find(filter).sort({ returnedAt: 1, dueAt: 1 }).limit(300)
    .populate("book", "title author").populate("student", "firstName lastName className section admissionNumber").lean();
  sendSuccess(res, { message: "Loans", data: rows.map((x) => present(x, today)) });
}));

// Lend a book. The copy count is checked and taken in one atomic update so
// two librarians can't lend the last copy twice.
router.post("/issues", perm("library.manage"), validate(z.object({ book: objectId, student: objectId, dueDate: z.string().regex(isoDay, "Use a date like 2026-12-10").optional() }).strict()), h(async (req, res) => {
  const b = req.valid.body;
  const book = await loadBook(req.user, b.book);
  const student = await Student.findOne({ _id: b.student, deletedAt: null, status: "active" }).select("school firstName lastName").lean();
  if (!student) throw ApiError.notFound("Student not found");
  if (String(student.school) !== String(book.school)) throw ApiError.badRequest("This book belongs to another school's library.");
  const settings = await getSettings(book.school);
  const open = await BookIssue.countDocuments({ student: student._id, returnedAt: null });
  if (open >= settings.library.maxBooks) throw ApiError.conflict(`${student.firstName} already has ${open} books out (the limit is ${settings.library.maxBooks}).`);
  if (await BookIssue.exists({ student: student._id, book: book._id, returnedAt: null })) throw ApiError.conflict(`${student.firstName} already has a copy of this book.`);
  const unpaid = await BookIssue.exists({ student: student._id, fineStatus: "due" });
  if (unpaid) throw ApiError.conflict(`${student.firstName} has an unpaid library fine. Collect it first.`);
  const today = todayIn(settings.timezone);
  const due = b.dueDate ? day(b.dueDate) : new Date(day(today).getTime() + settings.library.loanDays * DAY);
  if (due < day(today)) throw ApiError.badRequest("The return date can't be in the past.");
  // Copies kept for students who reserved the book can only go to them.
  const held = await refreshHolds(book._id, settings);
  const ownHold = await BookReservation.findOne({ book: book._id, student: student._id, status: "ready" });
  const fresh = await Book.findById(book._id).lean();
  if (!ownHold && fresh.copies - fresh.issued - held <= 0) {
    throw ApiError.conflict(held ? "The free copies are kept for students who reserved this book." : "No copies are available right now.");
  }
  const took = await Book.findOneAndUpdate({ _id: book._id, $expr: { $lt: ["$issued", "$copies"] } }, { $inc: { issued: 1 } });
  if (!took) throw ApiError.conflict("No copies are available right now.");
  if (ownHold) await BookReservation.updateOne({ _id: ownHold._id }, { $set: { status: "fulfilled" } });
  await BookReservation.updateOne({ book: book._id, student: student._id, status: "waiting" }, { $set: { status: "fulfilled" } });
  const issue = await BookIssue.create({ school: book.school, book: book._id, student: student._id, issuedAt: new Date(), dueAt: due, issuedBy: req.user._id });
  req.log.info({ event: "library.issue", issueId: issue.id, bookId: String(book._id), studentId: b.student }, "Book issued");
  sendSuccess(res, { status: 201, message: `${book.title} lent to ${student.firstName}. Due back ${due.toISOString().slice(0, 10)}.`, data: issue });
}));

router.post("/issues/:id/return", validateId, perm("library.manage"), validate(z.object({ fine: z.enum(["collect", "waive", "later"]).optional() }).strict()), h(async (req, res) => {
  const issue = await BookIssue.findById(req.params.id);
  if (!issue) throw ApiError.notFound("Loan not found");
  assertSchool(req.user, issue.school, "loan");
  if (issue.returnedAt) throw ApiError.conflict("This book was already returned.");
  const settings = await getSettings(issue.school);
  const today = day(todayIn(settings.timezone));
  const dueDay = day(issue.dueAt.toISOString().slice(0, 10));
  const daysLate = Math.max(0, Math.round((today - dueDay) / DAY));
  const fine = daysLate * settings.library.finePerDay;
  const choice = req.valid.body.fine || "later";
  // Mark returned first (atomic on returnedAt) so a double click can't
  // return the copy to the shelf twice.
  const updated = await BookIssue.findOneAndUpdate(
    { _id: issue._id, returnedAt: null },
    { $set: { returnedAt: new Date(), returnedTo: req.user._id, fine, fineStatus: fine === 0 ? "none" : choice === "collect" ? "paid" : choice === "waive" ? "waived" : "due", ...(fine && choice !== "later" ? { fineSettledAt: new Date() } : {}) } },
    { new: true }
  );
  if (!updated) throw ApiError.conflict("This book was already returned.");
  await Book.updateOne({ _id: issue.book, issued: { $gt: 0 } }, { $inc: { issued: -1 } });
  const before = await BookReservation.countDocuments({ book: issue.book, status: "ready" });
  const held = await refreshHolds(issue.book, settings);
  req.log.info({ event: "library.return", issueId: issue.id, daysLate, fine }, "Book returned");
  const hold = held > before ? " Keep this copy aside: it's reserved for the next student, who has been told." : "";
  const msg = (fine ? `Returned ${daysLate} days late. Fine ${money(settings, fine)} ${updated.fineStatus === "paid" ? "collected" : updated.fineStatus === "waived" ? "waived" : "is due"}.` : "Returned on time.") + hold;
  sendSuccess(res, { message: msg, data: updated });
}));

router.post("/issues/:id/fine", validateId, perm("library.manage"), validate(z.object({ action: z.enum(["collect", "waive"]) }).strict()), h(async (req, res) => {
  const issue = await BookIssue.findById(req.params.id);
  if (!issue) throw ApiError.notFound("Loan not found");
  assertSchool(req.user, issue.school, "loan");
  if (issue.fineStatus !== "due") throw ApiError.badRequest("There is no unpaid fine on this loan.");
  issue.fineStatus = req.valid.body.action === "collect" ? "paid" : "waived";
  issue.fineSettledAt = new Date();
  await issue.save();
  req.log.info({ event: `library.fine.${req.valid.body.action}`, issueId: issue.id, fine: issue.fine }, "Library fine settled");
  sendSuccess(res, { message: issue.fineStatus === "paid" ? "Fine collected." : "Fine waived.", data: issue });
}));

// ---------- Renewals and reminders ----------
const MAX_RENEWALS = 2;

router.post("/issues/:id/renew", validateId, perm("library.manage"), h(async (req, res) => {
  const issue = await BookIssue.findById(req.params.id).populate("book", "title");
  if (!issue) throw ApiError.notFound("Loan not found");
  assertSchool(req.user, issue.school, "loan");
  if (issue.returnedAt) throw ApiError.conflict("This book was already returned.");
  const settings = await getSettings(issue.school);
  const today = todayIn(settings.timezone);
  if (issue.dueAt.toISOString().slice(0, 10) < today) throw ApiError.badRequest("This loan is overdue. Return it (and settle any fine) instead of renewing.");
  if (issue.renewals >= MAX_RENEWALS) throw ApiError.badRequest(`A loan can be renewed at most ${MAX_RENEWALS} times.`);
  if (await BookReservation.exists({ book: issue.book._id, status: "waiting" })) throw ApiError.conflict("Other students are waiting for this book, so it can't be renewed.");
  const base = issue.dueAt > day(today) ? issue.dueAt : day(today);
  issue.dueAt = new Date(base.getTime() + settings.library.loanDays * DAY);
  issue.renewals += 1;
  await issue.save();
  req.log.info({ event: "library.renew", issueId: issue.id, renewals: issue.renewals }, "Loan renewed");
  sendSuccess(res, { message: `Renewed. ${issue.book.title} is now due back ${issue.dueAt.toISOString().slice(0, 10)}.`, data: issue });
}));

async function remindOne(issue, settings) {
  const today = day(todayIn(settings.timezone));
  const daysLate = Math.max(0, Math.round((today - day(issue.dueAt.toISOString().slice(0, 10))) / DAY));
  const family = await parentsOf([issue.student._id || issue.student]);
  await notify(family.map((u) => u._id), {
    type: "library",
    title: `Library book overdue: ${issue.book.title}`,
    body: `Due back ${issue.dueAt.toISOString().slice(0, 10)} (${daysLate} day${daysLate === 1 ? "" : "s"} late). Fine so far ${money(settings, daysLate * settings.library.finePerDay)}. Please return it to the library.`,
    link: "/library",
  });
  await BookIssue.updateOne({ _id: issue._id }, { $set: { remindedAt: new Date() } });
  return family.length;
}

router.post("/issues/:id/remind", validateId, perm("library.manage"), h(async (req, res) => {
  const issue = await BookIssue.findById(req.params.id).populate("book", "title");
  if (!issue) throw ApiError.notFound("Loan not found");
  assertSchool(req.user, issue.school, "loan");
  const settings = await getSettings(issue.school);
  if (issue.returnedAt || issue.dueAt.toISOString().slice(0, 10) >= todayIn(settings.timezone)) throw ApiError.badRequest("Only overdue loans need a reminder.");
  const n = await remindOne(issue, settings);
  req.log.info({ event: "library.remind", issueId: issue.id }, "Overdue reminder sent");
  sendSuccess(res, { message: n ? `Reminder sent to ${n} family account${n === 1 ? "" : "s"}.` : "No parent or student login is linked to this student, so nobody could be told in the app." });
}));

// Remind everyone overdue at a school (skipping those reminded in the last 2 days).
router.post("/remind-overdue", perm("library.manage"), validate(z.object({ school: objectId }).strict()), h(async (req, res) => {
  assertSchool(req.user, req.valid.body.school);
  const settings = await getSettings(req.valid.body.school);
  const today = day(todayIn(settings.timezone));
  const list = await BookIssue.find({
    school: oid(req.valid.body.school), returnedAt: null, dueAt: { $lt: today },
    $or: [{ remindedAt: null }, { remindedAt: { $exists: false } }, { remindedAt: { $lt: new Date(Date.now() - 2 * DAY) } }],
  }).populate("book", "title");
  let sent = 0;
  for (const issue of list) if (await remindOne(issue, settings)) sent += 1;
  req.log.info({ event: "library.remind.bulk", loans: list.length, sent }, "Overdue reminders sent");
  sendSuccess(res, { message: list.length ? `Reminders sent for ${sent} of ${list.length} overdue loans.` : "Nothing to send: every overdue loan was reminded in the last 2 days.", data: { loans: list.length, sent } });
}));

// ---------- Reservations ----------
// Students reserve for themselves, parents for a child, library staff for anyone in their school.
router.post("/books/:id/reserve", validateId, validate(z.object({ student: objectId.optional() }).strict()), h(async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) throw ApiError.notFound("Book not found");
  let studentId = req.valid.body.student;
  if (req.user.role === "student") studentId = String(req.user.student);
  else if (req.user.role === "parent") {
    if (!studentId) studentId = familyIds(req.user)[0];
    if (!familyIds(req.user).includes(String(studentId))) throw ApiError.notFound("Student not found");
  } else if (!can(req.user, "library.manage")) throw new ApiError(403, "You don't have permission to do that.");
  else assertSchool(req.user, book.school, "book");
  if (!studentId) throw ApiError.badRequest("Choose the student.");
  const student = await Student.findOne({ _id: studentId, deletedAt: null, status: "active" }).select("school firstName").lean();
  if (!student || String(student.school) !== String(book.school)) throw ApiError.notFound("Book not found");
  const settings = await getSettings(book.school);
  const held = await refreshHolds(book._id, settings);
  if (book.copies - book.issued - held > 0) throw ApiError.badRequest("A copy is on the shelf now. Ask at the library desk.");
  if (await BookIssue.exists({ student: student._id, book: book._id, returnedAt: null })) throw ApiError.conflict(`${student.firstName} already has this book.`);
  if ((await BookReservation.countDocuments({ student: student._id, status: { $in: ["waiting", "ready"] } })) >= 3) throw ApiError.conflict("At most 3 reservations at a time.");
  try {
    const r = await BookReservation.create({ school: book.school, book: book._id, student: student._id, requestedBy: req.user._id });
    const place = await BookReservation.countDocuments({ book: book._id, status: "waiting", createdAt: { $lte: r.createdAt } });
    req.log.info({ event: "library.reserve", bookId: book.id, studentId: String(student._id) }, "Book reserved");
    sendSuccess(res, { status: 201, message: `Reserved. ${student.firstName} is number ${place} in the queue; you'll be told when it's ready to collect.`, data: { ...r.toJSON(), place } });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict(`${student.firstName} has already reserved this book.`);
    throw err;
  }
}));

router.get("/reservations", validate(z.object({ school: objectId.optional(), status: z.enum(["waiting", "ready", "open"]).optional() }).strict(), "query"), h(async (req, res) => {
  const q = req.valid.query;
  let filter;
  if (isFamily(req.user)) filter = { student: { $in: familyIds(req.user).map(oid) } };
  else if (can(req.user, "library.manage")) filter = schoolFilter(req.user, q.school);
  else throw new ApiError(403, "You don't have permission to do that.");
  filter.status = q.status && q.status !== "open" ? q.status : { $in: ["waiting", "ready"] };
  const rows = await BookReservation.find(filter).sort({ status: -1, createdAt: 1 }).limit(300)
    .populate("book", "title author").populate("student", "firstName lastName className section admissionNumber").lean();
  sendSuccess(res, {
    message: "Reservations",
    data: rows.map((r) => ({ ...toPublic(r), book: r.book ? { id: String(r.book._id), title: r.book.title, author: r.book.author } : null, student: r.student ? { id: String(r.student._id), name: `${r.student.firstName} ${r.student.lastName}`, className: r.student.className, section: r.student.section, admissionNumber: r.student.admissionNumber } : null })),
  });
}));

router.delete("/reservations/:id", validateId, h(async (req, res) => {
  const r = await BookReservation.findById(req.params.id);
  const mine = r && isFamily(req.user) && familyIds(req.user).includes(String(r.student));
  const staff = r && can(req.user, "library.manage") && require("../services/schoolAccess").inSchool(req.user, r.school);
  if (!r || (!mine && !staff)) throw ApiError.notFound("Reservation not found");
  if (!["waiting", "ready"].includes(r.status)) throw ApiError.badRequest(`This reservation is already ${r.status}.`);
  r.status = "cancelled";
  await r.save();
  await refreshHolds(r.book, await getSettings(r.school));
  sendSuccess(res, { message: "Reservation cancelled." });
}));

// ---------- Book import (CSV) ----------
const COLUMNS = ["title", "author", "isbn", "category", "publisher", "shelf", "copies"];

router.post("/books/import", perm("library.manage"), fileUpload, h(async (req, res) => {
  const school = req.body?.school;
  if (!school || !/^[a-f0-9]{24}$/i.test(school)) throw ApiError.badRequest("Choose the school.");
  assertSchool(req.user, school);
  if (!req.file) throw ApiError.badRequest('Choose a CSV file (form field "file").');
  const dryRun = req.query.dryRun === "true";
  let rows;
  try {
    rows = require("csv-parse/sync").parse(req.file.buffer, { columns: (h) => h.map((x) => x.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
  } catch {
    throw ApiError.badRequest("That file isn't a readable CSV.");
  }
  if (!rows.length) throw ApiError.badRequest("The file has no rows.");
  if (rows.length > 2000) throw ApiError.badRequest("Import at most 2000 books at a time.");
  if (!("title" in rows[0])) throw ApiError.badRequest(`The first row must name the columns: ${COLUMNS.join(", ")}.`);
  const errors = [];
  const good = [];
  rows.forEach((r, i) => {
    const parsed = bookBody.safeParse({ school, ...Object.fromEntries(COLUMNS.map((c) => [c, r[c] === undefined || r[c] === "" ? (c === "copies" ? 1 : undefined) : r[c]])) });
    if (parsed.success) good.push({ row: i + 2, data: parsed.data });
    else errors.push(...parsed.error.issues.map((e) => ({ row: i + 2, field: e.path.join("."), message: e.message })));
  });
  // Same ISBN (or same title and author) as a book already in the library adds copies.
  const existing = await Book.find({ school: oid(school) }).select("title author isbn").lean();
  const keyOf = (b) => (b.isbn ? `isbn:${b.isbn.replace(/-/g, "")}` : `t:${b.title.toLowerCase()}|${(b.author || "").toLowerCase()}`);
  const byKey = new Map(existing.map((b) => [keyOf(b), b]));
  const plan = good.map((g) => ({ ...g, match: byKey.get(keyOf(g.data)) }));
  const summary = { rows: rows.length, newBooks: plan.filter((p) => !p.match).length, addedCopiesTo: plan.filter((p) => p.match).length, copies: plan.reduce((a, p) => a + p.data.copies, 0), errors };
  if (errors.length) return res.status(dryRun ? 200 : 400).json({ success: !dryRun ? false : true, message: dryRun ? `${errors.length} problems to fix before importing.` : "Nothing was imported: fix the problems and upload again.", data: summary, errors });
  if (dryRun) return sendSuccess(res, { message: `Ready to import ${summary.newBooks} new books and add copies to ${summary.addedCopiesTo}.`, data: summary });
  for (const p of plan) {
    if (p.match) await Book.updateOne({ _id: p.match._id }, { $inc: { copies: p.data.copies } });
    else {
      const created = await Book.create(p.data);
      byKey.set(keyOf(p.data), created);
    }
  }
  req.log.info({ event: "library.import", school, newBooks: summary.newBooks, addedCopiesTo: summary.addedCopiesTo }, "Books imported");
  sendSuccess(res, { status: 201, message: `Imported ${summary.newBooks} new books and added copies to ${summary.addedCopiesTo}.`, data: summary });
}));

router.get("/books/import/template", perm("library.manage"), (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="library-books-template.csv"');
  res.send(`\uFEFF${COLUMNS.join(",")}\nWings of Fire,A. P. J. Abdul Kalam,978-8173711466,Biography,Universities Press,B-2,3\nMalgudi Days,R. K. Narayan,,Fiction,,A-1,2\n`);
});

// ---------- Dashboard ----------
router.get("/dashboard", perm("library.manage"), validate(z.object({ school: objectId.optional() }).strict(), "query"), h(async (req, res) => {
  const f = schoolFilter(req.user, req.valid.query.school);
  const settings = await getSettings(req.valid.query.school || (await Book.findOne(f).select("school").lean())?.school);
  const todayIso = todayIn(settings.timezone);
  const today = day(todayIso);
  const monthStart = day(`${todayIso.slice(0, 8)}01`);
  const [books] = await Book.aggregate([{ $match: f }, { $group: { _id: null, titles: { $sum: 1 }, copies: { $sum: "$copies" }, issued: { $sum: "$issued" } } }]);
  const open = { ...f, returnedAt: null };
  const [onLoan, overdue, dueToday, loansThisMonth, returnsThisMonth] = await Promise.all([
    BookIssue.countDocuments(open),
    BookIssue.countDocuments({ ...open, dueAt: { $lt: today } }),
    BookIssue.countDocuments({ ...open, dueAt: today }),
    BookIssue.countDocuments({ ...f, issuedAt: { $gte: monthStart } }),
    BookIssue.countDocuments({ ...f, returnedAt: { $gte: monthStart } }),
  ]);
  const [fines] = await BookIssue.aggregate([
    { $match: { ...f, fine: { $gt: 0 } } },
    { $group: { _id: null, due: { $sum: { $cond: [{ $eq: ["$fineStatus", "due"] }, "$fine", 0] } }, collectedThisMonth: { $sum: { $cond: [{ $and: [{ $eq: ["$fineStatus", "paid"] }, { $gte: ["$fineSettledAt", monthStart] }] }, "$fine", 0] } }, waivedThisMonth: { $sum: { $cond: [{ $and: [{ $eq: ["$fineStatus", "waived"] }, { $gte: ["$fineSettledAt", monthStart] }] }, "$fine", 0] } } } },
  ]);
  const popular = await BookIssue.aggregate([
    { $match: { ...f, issuedAt: { $gte: new Date(today.getTime() - 90 * DAY) } } },
    { $group: { _id: "$book", loans: { $sum: 1 } } }, { $sort: { loans: -1 } }, { $limit: 5 },
    { $lookup: { from: "books", localField: "_id", foreignField: "_id", as: "b" } }, { $unwind: "$b" },
    { $project: { _id: 0, id: { $toString: "$_id" }, title: "$b.title", author: "$b.author", loans: 1 } },
  ]);
  const overdueList = await BookIssue.find({ ...open, dueAt: { $lt: today } }).sort({ dueAt: 1 }).limit(10)
    .populate("book", "title author").populate("student", "firstName lastName className section admissionNumber").lean();
  const holds = await BookReservation.aggregate([{ $match: { ...f, status: { $in: ["waiting", "ready"] } } }, { $group: { _id: "$status", n: { $sum: 1 } } }]);
  sendSuccess(res, {
    message: "Library dashboard",
    data: {
      currency: settings.currency,
      locale: settings.locale,
      books: { titles: books?.titles || 0, copies: books?.copies || 0, onShelf: Math.max(0, (books?.copies || 0) - (books?.issued || 0)) },
      loans: { onLoan, overdue, dueToday, thisMonth: loansThisMonth, returnsThisMonth },
      fines: { due: fines?.due || 0, collectedThisMonth: fines?.collectedThisMonth || 0, waivedThisMonth: fines?.waivedThisMonth || 0, finePerDay: settings.library.finePerDay },
      reservations: { waiting: holds.find((x) => x._id === "waiting")?.n || 0, ready: holds.find((x) => x._id === "ready")?.n || 0 },
      popular,
      overdue: overdueList.map((x) => ({ ...present(x, todayIso), daysLate: Math.round((today - day(x.dueAt.toISOString().slice(0, 10))) / DAY), remindedAt: x.remindedAt })),
    },
  });
}));

module.exports = router;
module.exports.present = present;
