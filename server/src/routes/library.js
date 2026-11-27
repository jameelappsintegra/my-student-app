// Library catalogue, lending and late fines.
const router = require("express").Router();
const { z } = require("zod");
const Book = require("../models/Book");
const BookIssue = require("../models/BookIssue");
const Student = require("../models/Student");
const { validate, validateId } = require("../middleware/validate");
const { requirePermission: perm, isFamily } = require("../middleware/authorize");
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
  sendSuccess(res, { message: "Books", data: rows.map((b) => b.toJSON()) });
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
  const took = await Book.findOneAndUpdate({ _id: book._id, $expr: { $lt: ["$issued", "$copies"] } }, { $inc: { issued: 1 } });
  if (!took) throw ApiError.conflict("No copies are available right now.");
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
    { $set: { returnedAt: new Date(), returnedTo: req.user._id, fine, fineStatus: fine === 0 ? "none" : choice === "collect" ? "paid" : choice === "waive" ? "waived" : "due" } },
    { new: true }
  );
  if (!updated) throw ApiError.conflict("This book was already returned.");
  await Book.updateOne({ _id: issue.book, issued: { $gt: 0 } }, { $inc: { issued: -1 } });
  req.log.info({ event: "library.return", issueId: issue.id, daysLate, fine }, "Book returned");
  const msg = fine ? `Returned ${daysLate} days late. Fine ${money(settings, fine)} ${updated.fineStatus === "paid" ? "collected" : updated.fineStatus === "waived" ? "waived" : "is due"}.` : "Returned on time.";
  sendSuccess(res, { message: msg, data: updated });
}));

router.post("/issues/:id/fine", validateId, perm("library.manage"), validate(z.object({ action: z.enum(["collect", "waive"]) }).strict()), h(async (req, res) => {
  const issue = await BookIssue.findById(req.params.id);
  if (!issue) throw ApiError.notFound("Loan not found");
  assertSchool(req.user, issue.school, "loan");
  if (issue.fineStatus !== "due") throw ApiError.badRequest("There is no unpaid fine on this loan.");
  issue.fineStatus = req.valid.body.action === "collect" ? "paid" : "waived";
  await issue.save();
  req.log.info({ event: `library.fine.${req.valid.body.action}`, issueId: issue.id, fine: issue.fine }, "Library fine settled");
  sendSuccess(res, { message: issue.fineStatus === "paid" ? "Fine collected." : "Fine waived.", data: issue });
}));

module.exports = router;
module.exports.present = present;
