// Read-only summaries for the Progress, Fees and Class insights pages.
const mongoose = require("mongoose");
const Student = require("../models/Student");
const Attendance = require("../models/Attendance");
const ExamResult = require("../models/ExamResult");
const FeeInvoice = require("../models/FeeInvoice");
const Homework = require("../models/Homework");
const HomeworkSubmission = require("../models/HomeworkSubmission");
const BookIssue = require("../models/BookIssue");
const School = require("../models/School");
const ApiError = require("../utils/ApiError");
const settingsSvc = require("./schoolSettings");
const records = require("./recordsService");

const DAY = 86400000;
const toDay = (s) => new Date(`${s}T00:00:00.000Z`);
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const round1 = (n) => Math.round(n * 10) / 10;
const pct = (attended, days) => (days ? round1((attended / days) * 100) : null);
const attendedOf = (c) => (c.present || 0) + (c.late || 0) + (c.half_day || 0) * 0.5;
const daysOf = (c) => (c.present || 0) + (c.late || 0) + (c.half_day || 0) + (c.absent || 0) + (c.leave || 0);

// The school's academic year up to today, in its own time zone.
function yearRange(settings) {
  const to = settingsSvc.todayIn(settings.timezone);
  return { from: settingsSvc.academicYearStart(settings, toDay(to)), to };
}

// Homework for a student's class with that student's hand-in status.
async function homeworkFor(student, { from, to }) {
  const list = await Homework.find({
    school: student.school,
    className: student.className,
    section: { $in: [student.section || "", "", null] },
    dueDate: { $gte: toDay(from) },
  }).sort({ dueDate: -1 }).lean();
  const subs = await HomeworkSubmission.find({ student: student._id, homework: { $in: list.map((h) => h._id) } }).lean();
  const byHw = new Map(subs.map((s) => [String(s.homework), s]));
  const s = { total: list.length, online: 0, handedIn: 0, late: 0, marked: 0, returned: 0, missing: 0, pending: 0, averageMarkPercent: null };
  const marks = [];
  for (const h of list) {
    if (!h.onlineSubmission) continue;
    s.online += 1;
    const sub = byHw.get(String(h._id));
    if (!sub) {
      if (iso(h.dueDate) < to) s.missing += 1;
      else s.pending += 1;
      continue;
    }
    s.handedIn += 1;
    if (sub.late) s.late += 1;
    if (sub.status === "returned") s.returned += 1;
    if (sub.status === "graded") {
      s.marked += 1;
      if (h.maxMarks && sub.marks != null) marks.push((sub.marks / h.maxMarks) * 100);
    }
  }
  if (marks.length) s.averageMarkPercent = round1(marks.reduce((a, b) => a + b, 0) / marks.length);
  s.handInRate = s.online - s.pending ? round1((s.handedIn / (s.online - s.pending)) * 100) : null;
  const recent = list.slice(0, 6).map((h) => {
    const sub = byHw.get(String(h._id));
    return { id: String(h._id), subject: h.subject, title: h.title, dueDate: iso(h.dueDate), online: Boolean(h.onlineSubmission), status: !h.onlineSubmission ? "paper" : sub ? sub.status : iso(h.dueDate) < to ? "missing" : "pending", marks: sub?.marks, maxMarks: h.maxMarks, late: sub?.late || false };
  });
  return { summary: s, recent };
}

// One student's progress over the school's academic year.
async function studentProgress(studentId, { publishedOnly, withFees }) {
  const student = await Student.findOne({ _id: studentId, deletedAt: null }).lean();
  if (!student) throw ApiError.notFound("Student not found");
  const settings = await settingsSvc.getSettings(student.school);
  const range = yearRange(settings);

  // Exams in date order, graded on the school's scale.
  const results = (await records.listResults(student._id, { publishedOnly }))
    .slice()
    .sort((a, b) => (a.academicYear.localeCompare(b.academicYear)) || String(a.examDate || a.createdAt).localeCompare(String(b.examDate || b.createdAt)));
  const exams = results.map((r) => ({ exam: r.exam, academicYear: r.academicYear, examDate: r.examDate, percentage: r.percentage, grade: r.grade, passed: r.passed, status: r.status }));
  const latest = results[results.length - 1] || null;
  const previous = results[results.length - 2] || null;
  const subjects = latest
    ? latest.subjects.map((s) => {
      const before = previous?.subjects.find((p) => p.subject.toLowerCase() === s.subject.toLowerCase());
      return { subject: s.subject, percentage: s.percentage, grade: s.grade, passed: s.passed, previous: before ? before.percentage : null, change: before ? round1(s.percentage - before.percentage) : null };
    })
    : [];

  // Attendance per month.
  const rows = await Attendance.aggregate([
    { $match: { student: student._id, date: { $gte: toDay(range.from), $lte: toDay(range.to) } } },
    { $group: { _id: { m: { $dateToString: { format: "%Y-%m", date: "$date" } }, s: "$status" }, n: { $sum: 1 } } },
  ]);
  const months = new Map();
  for (const r of rows) {
    const m = months.get(r._id.m) || {};
    m[r._id.s] = r.n;
    months.set(r._id.m, m);
  }
  const monthly = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, c]) => ({ month, schoolDays: daysOf(c), present: c.present || 0, late: c.late || 0, halfDay: c.half_day || 0, absent: c.absent || 0, leave: c.leave || 0, percentage: pct(attendedOf(c), daysOf(c)) }));
  const total = monthly.reduce((a, m) => ({ attended: a.attended + m.present + m.late + m.halfDay * 0.5, days: a.days + m.schoolDays, absent: a.absent + m.absent }), { attended: 0, days: 0, absent: 0 });

  const homework = await homeworkFor(student, range);
  const loans = await BookIssue.find({ student: student._id, returnedAt: null }).select("dueAt").lean();
  const fees = withFees ? (await records.listFees(student._id)).summary : null;
  const school = await School.findById(student.school).select("name code").lean();

  return {
    student: { id: String(student._id), name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" "), className: student.className, section: student.section, admissionNumber: student.admissionNumber, school: { id: String(school._id), name: school.name, code: school.code } },
    range,
    grading: { passPercentage: settings.passPercentage },
    results: { exams, subjects, latest: latest ? { exam: latest.exam, percentage: latest.percentage, grade: latest.grade, passed: latest.passed } : null, change: latest && previous ? round1(latest.percentage - previous.percentage) : null },
    attendance: { percentage: pct(total.attended, total.days), schoolDays: total.days, absent: total.absent, monthly },
    homework,
    library: { onLoan: loans.length, overdue: loans.filter((l) => iso(l.dueAt) < range.to).length },
    fees,
  };
}

// A class at a glance for its teacher or principal.
async function classInsights({ school, className, section }, { withFees }) {
  const sid = new mongoose.Types.ObjectId(school);
  const schoolDoc = await School.findById(sid).select("name code").lean();
  if (!schoolDoc) throw ApiError.notFound("School not found");
  const settings = await settingsSvc.getSettings(sid);
  const range = yearRange(settings);
  const kids = await Student.find({ school: sid, className, ...(section ? { section } : {}), deletedAt: null, status: "active" })
    .select("firstName lastName rollNumber section admissionNumber photo school className").sort({ section: 1, rollNumber: 1, firstName: 1 }).lean();
  const ids = kids.map((k) => k._id);

  // Attendance this year per student, and the class's last 14 marked days.
  const att = await Attendance.aggregate([
    { $match: { student: { $in: ids }, date: { $gte: toDay(range.from), $lte: toDay(range.to) } } },
    { $group: { _id: { st: "$student", s: "$status" }, n: { $sum: 1 } } },
  ]);
  const perStudent = new Map();
  for (const a of att) {
    const k = String(a._id.st);
    const c = perStudent.get(k) || {};
    c[a._id.s] = a.n;
    perStudent.set(k, c);
  }
  const since = iso(Math.max(toDay(range.from).getTime(), toDay(range.to).getTime() - 30 * DAY));
  const daily = await Attendance.aggregate([
    { $match: { student: { $in: ids }, date: { $gte: toDay(since), $lte: toDay(range.to) }, status: { $ne: "holiday" } } },
    { $group: { _id: "$date", present: { $sum: { $cond: [{ $in: ["$status", ["present", "late"]] }, 1, { $cond: [{ $eq: ["$status", "half_day"] }, 0.5, 0] }] } }, marked: { $sum: 1 }, absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } } } },
    { $sort: { _id: -1 } },
    { $limit: 14 },
  ]);

  // Latest exam per student (staff see drafts too).
  const results = await ExamResult.find({ student: { $in: ids } }).sort({ academicYear: 1, examDate: 1, createdAt: 1 }).lean();
  const latest = new Map();
  for (const r of results) latest.set(String(r.student), require("../models/ExamResult").withScores({ ...r, subjects: r.subjects.map((s) => ({ ...s })) }, settings));

  // Online homework hand-in per student.
  const hw = await Homework.find({ school: sid, className, ...(section ? { section: { $in: [section, "", null] } } : {}), onlineSubmission: true, dueDate: { $gte: toDay(range.from), $lt: toDay(range.to) } }).select("_id section").lean();
  const subs = await HomeworkSubmission.aggregate([{ $match: { homework: { $in: hw.map((h) => h._id) }, student: { $in: ids } } }, { $group: { _id: "$student", n: { $sum: 1 } } }]);
  const handed = new Map(subs.map((s) => [String(s._id), s.n]));
  const dueFor = (k) => hw.filter((h) => !h.section || h.section === k.section).length;

  let fees = new Map();
  if (withFees) {
    const inv = (await FeeInvoice.find({ student: { $in: ids } })).map((i) => i.toJSON());
    for (const i of inv) {
      const f = fees.get(String(i.student)) || { balance: 0, overdue: 0 };
      f.balance += i.balance;
      if (i.overdue) f.overdue += i.balance;
      fees.set(String(i.student), f);
    }
  } else fees = null;

  const { studentPublic } = require("../models/Student");
  const { toPublic } = require("../utils/serialize");
  const rows = kids.map((k) => {
    const id = String(k._id);
    const c = perStudent.get(id) || {};
    const r = latest.get(id);
    const due = dueFor(k);
    const flags = [];
    const attendance = pct(attendedOf(c), daysOf(c));
    if (attendance != null && attendance < 75) flags.push("low_attendance");
    if (r && !r.passed) flags.push("failing");
    if (due && due - (handed.get(id) || 0) >= 2) flags.push("missing_homework");
    if (fees && fees.get(id)?.overdue > 0) flags.push("fees_overdue");
    const pub = studentPublic(toPublic({ ...k }));
    return {
      student: { id, name: `${k.firstName} ${k.lastName}`, rollNumber: k.rollNumber, section: k.section, admissionNumber: k.admissionNumber, photoUrl: pub.photoUrl },
      attendance: { percentage: attendance, absent: c.absent || 0, schoolDays: daysOf(c) },
      latestResult: r ? { exam: r.exam, percentage: r.percentage, grade: r.grade, passed: r.passed, status: r.status } : null,
      homework: { due, handedIn: handed.get(id) || 0 },
      fees: fees ? { balance: fees.get(id)?.balance || 0, overdue: fees.get(id)?.overdue || 0 } : undefined,
      flags,
    };
  });
  const withAtt = rows.filter((r) => r.attendance.percentage != null);
  const withRes = rows.filter((r) => r.latestResult);
  const hwDue = rows.reduce((a, r) => a + r.homework.due, 0);
  return {
    school: { id: String(schoolDoc._id), name: schoolDoc.name, code: schoolDoc.code },
    className,
    section: section || null,
    range,
    currency: settings.currency,
    locale: settings.locale,
    summary: {
      students: rows.length,
      averageAttendance: withAtt.length ? round1(withAtt.reduce((a, r) => a + r.attendance.percentage, 0) / withAtt.length) : null,
      averageResult: withRes.length ? round1(withRes.reduce((a, r) => a + r.latestResult.percentage, 0) / withRes.length) : null,
      passRate: withRes.length ? round1((withRes.filter((r) => r.latestResult.passed).length / withRes.length) * 100) : null,
      homeworkHandInRate: hwDue ? round1((rows.reduce((a, r) => a + Math.min(r.homework.handedIn, r.homework.due), 0) / hwDue) * 100) : null,
      needsAttention: rows.filter((r) => r.flags.length).length,
      feesOverdue: fees ? rows.reduce((a, r) => a + (r.fees.overdue || 0), 0) : undefined,
    },
    daily: daily.reverse().map((d) => ({ date: iso(d._id), percentage: pct(d.present, d.marked), absent: d.absent, marked: d.marked })),
    rows,
  };
}

// Data for a printable fee receipt.
async function receipt(studentId, invoiceId, paymentId) {
  const student = await Student.findOne({ _id: studentId, deletedAt: null }).lean();
  if (!student) throw ApiError.notFound("Student not found");
  const inv = await FeeInvoice.findOne({ _id: invoiceId, student: student._id });
  if (!inv) throw ApiError.notFound("Fee not found");
  const p = inv.payments.id(paymentId);
  if (!p) throw ApiError.notFound("Payment not found");
  const json = inv.toJSON();
  const paidUpTo = inv.payments.filter((x) => x.paidAt <= p.paidAt).reduce((a, x) => a + x.amount, 0);
  const school = await School.findById(student.school).select("name code address city phone email board principalName").lean();
  const settings = await settingsSvc.getSettings(student.school);
  return {
    receiptNumber: p.receiptNumber,
    paidAt: p.paidAt,
    amount: p.amount,
    amountText: settingsSvc.money(settings, p.amount),
    method: p.method,
    reference: p.reference,
    invoice: { id: json.id, title: json.title, academicYear: json.academicYear, amount: json.amount, dueDate: json.dueDate, balanceAfter: Math.max(0, json.amount - paidUpTo), balanceNow: json.balance },
    student: { id: String(student._id), name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" "), admissionNumber: student.admissionNumber, className: student.className, section: student.section, father: student.father?.name },
    school: { name: school.name, code: school.code, address: school.address, city: school.city, phone: school.phone, email: school.email, board: school.board },
    currency: settings.currency,
    locale: settings.locale,
  };
}

module.exports = { studentProgress, classInsights, receipt };
