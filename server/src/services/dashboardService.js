const Student = require("../models/Student");
const Admission = require("../models/Admission");
const { PENDING_ADMISSION_STATUSES } = require("../constants");
const { toPublic } = require("../utils/serialize");
const School = require("../models/School");
const mongoose = require("mongoose");
const Attendance = require("../models/Attendance");
const FeeInvoice = require("../models/FeeInvoice");

async function attendanceOn(day, scope) {
  const rows = await Attendance.aggregate([
    { $match: { ...scope, date: day } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const c = Object.fromEntries(rows.map((r) => [r._id, r.count]));
  const marked = rows.reduce((a, r) => a + r.count, 0) - (c.holiday || 0);
  const attended = (c.present || 0) + (c.late || 0) + (c.half_day || 0) * 0.5;
  return {
    date: day.toISOString().slice(0, 10),
    marked,
    present: (c.present || 0) + (c.late || 0) + (c.half_day || 0),
    absent: (c.absent || 0) + (c.leave || 0),
    percentage: marked ? Math.round((attended / marked) * 1000) / 10 : null,
  };
}

async function feeTotals(scope) {
  const [row] = await FeeInvoice.aggregate([
    { $match: scope },
    {
      $project: {
        amount: 1,
        dueDate: 1,
        paid: { $sum: "$payments.amount" },
      },
    },
    {
      $group: {
        _id: null,
        billed: { $sum: "$amount" },
        collected: { $sum: "$paid" },
        overdueAmount: {
          $sum: { $cond: [{ $lt: ["$dueDate", new Date()] }, { $max: [0, { $subtract: ["$amount", "$paid"] }] }, 0] },
        },
        overdueInvoices: {
          $sum: { $cond: [{ $and: [{ $lt: ["$dueDate", new Date()] }, { $lt: ["$paid", "$amount"] }] }, 1, 0] },
        },
      },
    },
  ]);
  const r = row || { billed: 0, collected: 0, overdueAmount: 0, overdueInvoices: 0 };
  return { billed: r.billed, collected: r.collected, outstanding: r.billed - r.collected, overdue: r.overdueAmount, overdueInvoices: r.overdueInvoices };
}

async function getSummary({ school } = {}) {
  const schoolId = school ? new mongoose.Types.ObjectId(school) : undefined;
  const scope = schoolId ? { school: schoolId } : {};
  const [
    totalStudents,
    pendingAdmissions,
    approvedAwaitingEnrolment,
    studentsByClass,
    recentAdmissions,
  ] = await Promise.all([
    Student.countDocuments({ ...scope, deletedAt: null, status: "active" }),
    Admission.countDocuments({ ...scope, status: { $in: PENDING_ADMISSION_STATUSES } }),
    Admission.countDocuments({ ...scope, status: "approved" }),
    Student.aggregate([
      { $match: { ...scope, deletedAt: null, status: "active" } },
      { $group: { _id: "$className", count: { $sum: 1 } } },
    ]),
    Admission.find(scope)
      .select("applicationNumber firstName lastName classApplied status createdAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ]);

  // Latest day with attendance marked (today on a school day).
  const latest = await Attendance.findOne({ ...scope, status: { $ne: "holiday" } }).sort({ date: -1 }).select("date").lean();
  const [schools, bySchool, attendance, fees] = await Promise.all([
    School.find().select("name code active").sort({ name: 1 }).lean(),
    Student.aggregate([
      { $match: { deletedAt: null, status: "active" } },
      { $group: { _id: "$school", count: { $sum: 1 } } },
    ]),
    latest ? attendanceOn(latest.date, scope) : null,
    feeTotals(scope),
  ]);
  const counts = new Map(bySchool.map((r) => [String(r._id), r.count]));

  return {
    studentsBySchool: schools.map((s) => ({
      id: String(s._id),
      name: s.name,
      code: s.code,
      active: s.active,
      count: counts.get(String(s._id)) || 0,
    })),
    attendance,
    fees,
    totalStudents,
    pendingAdmissions,
    approvedAwaitingEnrolment,
    studentsByClass: studentsByClass.map((r) => ({
      className: r._id,
      count: r.count,
    })),
    recentAdmissions: recentAdmissions.map(toPublic),
  };
}

module.exports = { getSummary };
