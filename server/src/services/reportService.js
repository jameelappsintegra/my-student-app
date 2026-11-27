// Reports. Every query starts from the students the requesting user may see
// (scoped()), so teachers get their classes and principals their schools.
const mongoose = require("mongoose");
const Student = require("../models/Student");
const Attendance = require("../models/Attendance");
const FeeInvoice = require("../models/FeeInvoice");
const ExamResult = require("../models/ExamResult");
const Admission = require("../models/Admission");
const School = require("../models/School");
const { academicYearStart } = require("./recordsService");
const { scoped, schoolIds } = require("../middleware/authorize");
const { getSettings, gradeFor: gradeOn } = require("./schoolSettings");

const oid = (id) => new mongoose.Types.ObjectId(id);
const round1 = (n) => Math.round(n * 10) / 10;
const day = (s) => new Date(`${s}T00:00:00Z`);
const todayIso = () => new Date().toISOString().slice(0, 10);

function studentFilter(q, user, { includeInactive = false } = {}) {
  const m = { deletedAt: null, ...(includeInactive ? {} : { status: "active" }) };
  if (q.school) m.school = oid(q.school);
  if (q.className) m.className = q.className;
  if (q.section) m.section = q.section.toUpperCase();
  return scoped(user, m);
}
const parentPhone = (s) => s.father?.phone || s.mother?.phone || s.guardian?.phone || s.emergencyContact?.phone || "";
const parentName = (s) => s.father?.name || s.mother?.name || s.guardian?.name || "";

async function students(q, user, opts) {
  return Student.find(studentFilter(q, user, opts))
    .select("admissionNumber firstName middleName lastName className section rollNumber gender dateOfBirth school father mother guardian emergencyContact address transport busRoute status")
    .populate("school", "name code")
    .sort({ className: 1, section: 1, rollNumber: 1, lastName: 1 })
    .lean();
}
const classKey = (s) => `${String(s.school?._id || s.school)}|${s.className}|${s.section || ""}`;
function studentRow(s) {
  return {
    id: String(s._id),
    admissionNumber: s.admissionNumber,
    name: [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" "),
    school: s.school?.name,
    schoolCode: s.school?.code,
    className: s.className,
    section: s.section || "",
    rollNumber: s.rollNumber || "",
    parent: parentName(s),
    parentPhone: parentPhone(s),
  };
}
const CLASS_ORDER = ["LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const byClass = (a, b) =>
  (a.school || "").localeCompare(b.school || "") || CLASS_ORDER.indexOf(a.className) - CLASS_ORDER.indexOf(b.className) || (a.section || "").localeCompare(b.section || "");

// ---------- Students ----------
async function studentList(q, user) {
  return (await students(q, user)).map((s) => ({
    ...studentRow(s),
    gender: s.gender,
    dateOfBirth: s.dateOfBirth,
    address: s.address,
    transport: s.transport || "",
    busRoute: s.busRoute || "",
  }));
}

// Class strength by gender.
async function strength(q, user) {
  const list = await students(q, user);
  const groups = new Map();
  for (const s of list) {
    const k = classKey(s);
    const g = groups.get(k) || { school: s.school?.name, schoolCode: s.school?.code, className: s.className, section: s.section || "", total: 0, girls: 0, boys: 0, other: 0 };
    g.total += 1;
    if (s.gender === "female") g.girls += 1;
    else if (s.gender === "male") g.boys += 1;
    else g.other += 1;
    groups.set(k, g);
  }
  return [...groups.values()].sort(byClass);
}

// ---------- Attendance ----------
function attendedExpr() {
  return { $switch: { branches: [{ case: { $in: ["$status", ["present", "late"]] }, then: 1 }, { case: { $eq: ["$status", "half_day"] }, then: 0.5 }], default: 0 } };
}

async function perStudentAttendance(list, from, to) {
  if (!list.length) return new Map();
  const rows = await Attendance.aggregate([
    { $match: { student: { $in: list.map((s) => s._id) }, date: { $gte: day(from), $lte: day(to) }, status: { $ne: "holiday" } } },
    { $group: { _id: "$student", days: { $sum: 1 }, attended: { $sum: attendedExpr() }, absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

async function lowAttendance(q, user) {
  const list = await students(q, user);
  const stats = await perStudentAttendance(list, q.from || academicYearStart(), q.to || todayIso());
  return list
    .filter((s) => stats.has(String(s._id)))
    .map((s) => {
      const r = stats.get(String(s._id));
      return { ...studentRow(s), days: r.days, absent: r.absent, percentage: round1((r.attended / r.days) * 100) };
    })
    .filter((r) => r.percentage < q.threshold)
    .sort((a, b) => a.percentage - b.percentage);
}

// Per class: average attendance and how many are below the threshold.
async function classAttendance(q, user) {
  const list = await students(q, user);
  const stats = await perStudentAttendance(list, q.from || academicYearStart(), q.to || todayIso());
  const groups = new Map();
  for (const s of list) {
    const k = classKey(s);
    const g = groups.get(k) || { school: s.school?.name, schoolCode: s.school?.code, className: s.className, section: s.section || "", students: 0, recorded: 0, sum: 0, below: 0 };
    g.students += 1;
    const r = stats.get(String(s._id));
    if (r) {
      const pct = (r.attended / r.days) * 100;
      g.recorded += 1;
      g.sum += pct;
      if (pct < q.threshold) g.below += 1;
    }
    groups.set(k, g);
  }
  return [...groups.values()]
    .map(({ sum, ...g }) => ({ ...g, averagePercentage: g.recorded ? round1(sum / g.recorded) : null, belowThreshold: g.below }))
    .map(({ below, ...g }) => g)
    .sort(byClass);
}

// One day, per class: how many are marked, present, absent.
async function dailyAttendance(q, user) {
  const list = await students(q, user);
  const date = q.date || todayIso();
  const marks = await Attendance.find({ student: { $in: list.map((s) => s._id) }, date: day(date) }).select("student status").lean();
  const byStudent = new Map(marks.map((m) => [String(m.student), m.status]));
  const groups = new Map();
  for (const s of list) {
    const k = classKey(s);
    const g = groups.get(k) || { date, school: s.school?.name, schoolCode: s.school?.code, className: s.className, section: s.section || "", students: 0, marked: 0, present: 0, absent: 0, late: 0, leave: 0, notMarked: 0 };
    g.students += 1;
    const st = byStudent.get(String(s._id));
    if (!st) g.notMarked += 1;
    else {
      g.marked += 1;
      if (st === "present" || st === "half_day") g.present += 1;
      else if (st === "late") { g.present += 1; g.late += 1; }
      else if (st === "absent") g.absent += 1;
      else if (st === "leave") g.leave += 1;
    }
    groups.set(k, g);
  }
  return [...groups.values()].sort(byClass);
}

// ---------- Results ----------
async function examResults(q, user) {
  const list = await students(q, user);
  const match = { student: { $in: list.map((s) => s._id) } };
  if (q.exam) match.exam = q.exam;
  if (q.academicYear) match.academicYear = q.academicYear;
  const results = await ExamResult.find(match).lean();
  const byId = new Map(list.map((s) => [String(s._id), s]));
  // Each school's own grading scale and pass mark.
  const settings = new Map();
  for (const sid of new Set(results.map((r) => String(r.school)))) settings.set(sid, await getSettings(sid));
  return results.map((r) => {
    const s = byId.get(String(r.student));
    const st = settings.get(String(r.school));
    const total = r.subjects.reduce((a, x) => a + x.marks, 0);
    const max = r.subjects.reduce((a, x) => a + x.maxMarks, 0);
    const passed = r.subjects.every((x) => (x.marks / x.maxMarks) * 100 >= st.passPercentage);
    return { s, r, pct: max ? (total / max) * 100 : 0, passed, st };
  });
}

// Per class and exam: average, pass rate, highest, topper.
async function examPerformance(q, user) {
  const rows = await examResults(q, user);
  const groups = new Map();
  for (const x of rows) {
    const k = `${classKey(x.s)}|${x.r.academicYear}|${x.r.exam}`;
    const g = groups.get(k) || { st: x.st, school: x.s.school?.name, schoolCode: x.s.school?.code, className: x.s.className, section: x.s.section || "", academicYear: x.r.academicYear, exam: x.r.exam, students: 0, sum: 0, passed: 0, highest: -1, topper: "" };
    g.students += 1;
    g.sum += x.pct;
    if (x.passed) g.passed += 1;
    if (x.pct > g.highest) {
      g.highest = x.pct;
      g.topper = studentRow(x.s).name;
    }
    groups.set(k, g);
  }
  return [...groups.values()]
    .map(({ sum, st, ...g }) => ({ ...g, averagePercentage: round1(sum / g.students), averageGrade: gradeOn(st, sum / g.students), passRate: round1((g.passed / g.students) * 100), highest: round1(g.highest) }))
    .sort((a, b) => byClass(a, b) || a.exam.localeCompare(b.exam));
}

// Per class, exam and subject: average, highest, lowest, pass rate.
async function subjectPerformance(q, user) {
  const rows = await examResults(q, user);
  const groups = new Map();
  for (const x of rows) {
    for (const sub of x.r.subjects) {
      const k = `${classKey(x.s)}|${x.r.exam}|${sub.subject}`;
      const pct = (sub.marks / sub.maxMarks) * 100;
      const g = groups.get(k) || { school: x.s.school?.name, className: x.s.className, section: x.s.section || "", exam: x.r.exam, subject: sub.subject, students: 0, sum: 0, highest: 0, lowest: 100, passed: 0 };
      const passMark = x.st.passPercentage;
      g.students += 1;
      g.sum += pct;
      g.highest = Math.max(g.highest, pct);
      g.lowest = Math.min(g.lowest, pct);
      if (pct >= passMark) g.passed += 1;
      groups.set(k, g);
    }
  }
  return [...groups.values()]
    .map(({ sum, ...g }) => ({ ...g, averagePercentage: round1(sum / g.students), highest: round1(g.highest), lowest: round1(g.lowest), passRate: round1((g.passed / g.students) * 100) }))
    .sort((a, b) => byClass(a, b) || a.exam.localeCompare(b.exam) || a.subject.localeCompare(b.subject));
}

// Top N students per class for an exam.
async function toppers(q, user) {
  const rows = await examResults(q, user);
  const groups = new Map();
  for (const x of rows) {
    const k = `${classKey(x.s)}|${x.r.exam}`;
    groups.set(k, [...(groups.get(k) || []), x]);
  }
  const out = [];
  for (const list of groups.values()) {
    list.sort((a, b) => b.pct - a.pct);
    list.slice(0, q.top).forEach((x, i) => out.push({ ...studentRow(x.s), exam: x.r.exam, rank: i + 1, percentage: round1(x.pct), grade: gradeOn(x.st, x.pct) }));
  }
  return out.sort((a, b) => byClass(a, b) || a.exam.localeCompare(b.exam) || a.rank - b.rank);
}

// ---------- Fees ----------
async function feeDefaulters(q, user) {
  const list = await students(q, user);
  if (!list.length) return [];
  const now = new Date();
  const rows = await FeeInvoice.aggregate([
    { $match: { student: { $in: list.map((s) => s._id) } } },
    { $project: { student: 1, dueDate: 1, balance: { $max: [0, { $subtract: ["$amount", { $sum: "$payments.amount" }] }] } } },
    { $match: { balance: { $gt: 0 } } },
    {
      $group: {
        _id: "$student",
        balance: { $sum: "$balance" },
        overdue: { $sum: { $cond: [{ $lt: ["$dueDate", now] }, "$balance", 0] } },
        overdueBills: { $sum: { $cond: [{ $lt: ["$dueDate", now] }, 1, 0] } },
        oldestDue: { $min: { $cond: [{ $lt: ["$dueDate", now] }, "$dueDate", null] } },
      },
    },
    { $match: { overdue: { $gt: 0 } } },
  ]);
  const byId = new Map(list.map((s) => [String(s._id), s]));
  return rows
    .map((r) => ({ ...studentRow(byId.get(String(r._id))), overdue: r.overdue, balance: r.balance, overdueBills: r.overdueBills, oldestDue: r.oldestDue }))
    .sort((a, b) => b.overdue - a.overdue);
}

// Money received per day and payment method in a date range.
async function feeCollection(q, user) {
  const list = await students(q, user, { includeInactive: true });
  if (!list.length) return [];
  const from = day(q.from || academicYearStart());
  const to = new Date(day(q.to || todayIso()).getTime() + 86399999);
  const rows = await FeeInvoice.aggregate([
    { $match: { student: { $in: list.map((s) => s._id) } } },
    { $unwind: "$payments" },
    { $match: { "payments.paidAt": { $gte: from, $lte: to } } },
    {
      $group: {
        _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$payments.paidAt" } }, method: "$payments.method", school: "$school" },
        amount: { $sum: "$payments.amount" },
        payments: { $sum: 1 },
      },
    },
  ]);
  const schools = new Map((await School.find({ _id: { $in: [...new Set(rows.map((r) => String(r._id.school)))] } }).select("name").lean()).map((s) => [String(s._id), s.name]));
  return rows
    .map((r) => ({ date: r._id.day, school: schools.get(String(r._id.school)), method: r._id.method, payments: r.payments, amount: r.amount }))
    .sort((a, b) => b.date.localeCompare(a.date) || (a.school || "").localeCompare(b.school || ""));
}

// ---------- Admissions ----------
async function admissions(q, user) {
  const match = {};
  const allowed = schoolIds(user);
  if (q.school) match.school = oid(q.school);
  else if (allowed) match.school = { $in: allowed.map(oid) };
  if (q.className) match.classApplied = q.className;
  const rows = await Admission.aggregate([{ $match: match }, { $group: { _id: { school: "$school", status: "$status" }, count: { $sum: 1 } } }]);
  const schools = new Map((await School.find({ _id: { $in: [...new Set(rows.map((r) => String(r._id.school)))] } }).select("name").lean()).map((s) => [String(s._id), s.name]));
  const bySchool = new Map();
  for (const r of rows) {
    const k = String(r._id.school);
    const g = bySchool.get(k) || { school: schools.get(k), total: 0, submitted: 0, under_review: 0, documents_required: 0, approved: 0, rejected: 0, enrolled: 0, draft: 0 };
    g[r._id.status] += r.count;
    g.total += r.count;
    bySchool.set(k, g);
  }
  return [...bySchool.values()].sort((a, b) => (a.school || "").localeCompare(b.school || ""));
}

module.exports = {
  studentList, strength, lowAttendance, classAttendance, dailyAttendance,
  examPerformance, subjectPerformance, toppers, feeDefaulters, feeCollection, admissions,
};
