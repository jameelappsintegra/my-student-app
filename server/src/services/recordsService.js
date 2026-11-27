// Attendance, exam results and fees for one student. Every function first
// loads the (non-deleted) student and scopes queries to it, so a record id
// from another student can never be read or changed through this URL.
const Student = require("../models/Student");
const Attendance = require("../models/Attendance");
const ExamResult = require("../models/ExamResult");
const FeeInvoice = require("../models/FeeInvoice");
const Counter = require("../models/Counter");
const School = require("../models/School");
const ApiError = require("../utils/ApiError");

const DAY = 86400000;
const toDay = (s) => new Date(`${s}T00:00:00.000Z`);
const isoDay = (d) => d.toISOString().slice(0, 10);

async function loadStudent(id) {
  const student = await Student.findOne({ _id: id, deletedAt: null }).select("school academicYear").lean();
  if (!student) throw ApiError.notFound("Student not found");
  return student;
}

function academicYearStart(today = new Date()) {
  const y = today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  return `${y}-04-01`;
}

// ---------- Attendance ----------
function summarise(records) {
  const counts = { present: 0, absent: 0, late: 0, half_day: 0, leave: 0, holiday: 0 };
  for (const r of records) counts[r.status] += 1;
  const workingDays = records.length - counts.holiday;
  const attended = counts.present + counts.late + counts.half_day * 0.5;
  return {
    ...counts,
    workingDays,
    percentage: workingDays ? Math.round((attended / workingDays) * 1000) / 10 : null,
  };
}

async function getAttendance(studentId, { from, to }) {
  const student = await loadStudent(studentId);
  const end = to || isoDay(new Date());
  const start = from || academicYearStart();
  if ((toDay(end) - toDay(start)) / DAY > 400) throw ApiError.badRequest("Choose a range of at most 400 days");
  const records = await Attendance.find({ student: student._id, date: { $gte: toDay(start), $lte: toDay(end) } })
    .sort({ date: -1 })
    .select("date status note")
    .lean();
  return {
    from: start,
    to: end,
    summary: summarise(records),
    records: records.map((r) => ({ date: isoDay(r.date), status: r.status, note: r.note })),
  };
}

// Marks or corrects one day (upsert keeps one record per student per day).
async function markAttendance(studentId, date, { status, note }) {
  const student = await loadStudent(studentId);
  const before = await Attendance.findOne({ student: student._id, date: toDay(date) }).select("status").lean();
  const record = await Attendance.findOneAndUpdate(
    { student: student._id, date: toDay(date) },
    note
      ? { $set: { status, note, school: student.school } }
      : { $set: { status, school: student.school }, $unset: { note: 1 } },
    { upsert: true, new: true, runValidators: true }
  ).lean();
  if (status === "absent" && before?.status !== "absent") await notifyAbsent([student._id], date);
  return { date, status: record.status, note: record.note || undefined };
}

// Tells parents when their child is newly marked absent.
async function notifyAbsent(studentIds, date) {
  const { notify, parentsOf } = require("./notificationService");
  const kids = await Student.find({ _id: { $in: studentIds } }).select("firstName lastName").lean();
  const names = new Map(kids.map((k) => [String(k._id), `${k.firstName} ${k.lastName}`]));
  for (const p of await parentsOf(studentIds)) {
    const mine = (p.children || []).map(String).filter((c) => names.has(c));
    for (const c of mine) {
      await notify([p._id], { type: "attendance", title: `${names.get(c)} was absent today`, body: `Marked absent on ${date}. Contact the school if this is a mistake.`, link: `/students/${c}?tab=attendance` });
    }
  }
}

async function clearAttendance(studentId, date) {
  const student = await loadStudent(studentId);
  const { deletedCount } = await Attendance.deleteOne({ student: student._id, date: toDay(date) });
  if (!deletedCount) throw ApiError.notFound("No attendance recorded for that day");
}

// ---------- Exam results ----------
async function listResults(studentId, { publishedOnly = false } = {}) {
  const student = await loadStudent(studentId);
  const results = await ExamResult.find({ student: student._id, ...(publishedOnly ? { status: "published" } : {}) }).sort({ academicYear: -1, examDate: -1, createdAt: -1 });
  return results.map((r) => r.toJSON());
}

async function findResult(studentId, resultId) {
  const student = await loadStudent(studentId);
  const result = await ExamResult.findOne({ _id: resultId, student: student._id });
  if (!result) throw ApiError.notFound("Result not found");
  return result;
}

const duplicateExam = (err, exam) => {
  if (err.code === 11000) return ApiError.conflict(`Marks for "${exam}" are already recorded for this year. Edit that result instead.`);
  return err;
};

async function createResult(studentId, input) {
  const student = await loadStudent(studentId);
  try {
    return (await ExamResult.create({ ...input, student: student._id, school: student.school })).toJSON();
  } catch (err) {
    throw duplicateExam(err, input.exam);
  }
}

// Published marks are locked unless the user may (un)publish results.
function assertEditable(result, user) {
  if (result.status === "published" && user && !require("../constants/permissions").can(user, "results.publish")) {
    throw new ApiError(403, "These results are published. Ask the principal to unpublish them before changing marks.");
  }
}

async function updateResult(studentId, resultId, changes, user) {
  const result = await findResult(studentId, resultId);
  assertEditable(result, user);
  result.set(changes);
  try {
    await result.save();
  } catch (err) {
    throw duplicateExam(err, changes.exam);
  }
  return result.toJSON();
}

async function deleteResult(studentId, resultId, user) {
  const result = await findResult(studentId, resultId);
  assertEditable(result, user);
  await result.deleteOne();
}

// ---------- Fees ----------
function feeSummary(invoices) {
  const s = { billed: 0, paid: 0, balance: 0, overdue: 0, overdueCount: 0 };
  for (const i of invoices) {
    s.billed += i.amount;
    s.paid += i.paid;
    s.balance += i.balance;
    if (i.overdue) {
      s.overdue += i.balance;
      s.overdueCount += 1;
    }
  }
  s.status = s.balance === 0 ? "paid" : s.overdueCount ? "overdue" : "due";
  return s;
}

async function listFees(studentId) {
  const student = await loadStudent(studentId);
  const invoices = (await FeeInvoice.find({ student: student._id }).sort({ dueDate: 1 })).map((i) => i.toJSON());
  return { summary: feeSummary(invoices), invoices };
}

async function findInvoice(studentId, invoiceId) {
  const student = await loadStudent(studentId);
  const invoice = await FeeInvoice.findOne({ _id: invoiceId, student: student._id });
  if (!invoice) throw ApiError.notFound("Fee not found");
  return invoice;
}

async function createInvoice(studentId, input) {
  const student = await loadStudent(studentId);
  return (await FeeInvoice.create({ ...input, student: student._id, school: student.school })).toJSON();
}

async function updateInvoice(studentId, invoiceId, changes) {
  const invoice = await findInvoice(studentId, invoiceId);
  const paid = invoice.payments.reduce((a, p) => a + p.amount, 0);
  if (changes.amount !== undefined && changes.amount < paid) {
    throw ApiError.badRequest(`The amount can't be less than the ₹${paid} already paid.`);
  }
  invoice.set(changes);
  await invoice.save();
  return invoice.toJSON();
}

async function deleteInvoice(studentId, invoiceId) {
  const invoice = await findInvoice(studentId, invoiceId);
  if (invoice.payments.length) throw ApiError.conflict("This fee has payments recorded. Remove the payments first.");
  await invoice.deleteOne();
}

async function recordPayment(studentId, invoiceId, { amount, method, paidAt, reference }) {
  const invoice = await findInvoice(studentId, invoiceId);
  const balance = invoice.amount - invoice.payments.reduce((a, p) => a + p.amount, 0);
  if (balance <= 0) throw ApiError.conflict("This fee is already fully paid.");
  if (amount > balance) throw ApiError.badRequest(`The payment is more than the ₹${balance} still due.`);
  const school = await School.findById(invoice.school).select("code").lean();
  const year = invoice.academicYear.slice(0, 4);
  const seq = await Counter.next(`receipt:${school.code}:${year}`);
  invoice.payments.push({
    amount,
    method,
    reference,
    paidAt: paidAt || new Date(),
    receiptNumber: `RCPT-${school.code}-${year}-${String(seq).padStart(5, "0")}`,
  });
  // optimisticConcurrency: two cashiers paying at once cannot overpay.
  await invoice.save();
  return invoice.toJSON();
}

async function removePayment(studentId, invoiceId, paymentId) {
  const invoice = await findInvoice(studentId, invoiceId);
  const payment = invoice.payments.id(paymentId);
  if (!payment) throw ApiError.notFound("Payment not found");
  invoice.payments.pull(payment._id);
  await invoice.save();
  return invoice.toJSON();
}

module.exports = {
  getAttendance,
  markAttendance,
  clearAttendance,
  summarise,
  listResults,
  createResult,
  updateResult,
  deleteResult,
  listFees,
  feeSummary,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  recordPayment,
  removePayment,
  academicYearStart,
  notifyAbsent,
};
