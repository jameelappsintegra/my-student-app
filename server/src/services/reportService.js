const mongoose = require("mongoose");
const Student = require("../models/Student");
const Attendance = require("../models/Attendance");
const FeeInvoice = require("../models/FeeInvoice");
const { academicYearStart } = require("./recordsService");

const oid = (id) => new mongoose.Types.ObjectId(id);
const studentScope = (q) => {
  const m = { deletedAt: null, status: "active" };
  if (q.school) m.school = oid(q.school);
  if (q.className) m.className = q.className;
  if (q.section) m.section = q.section.toUpperCase();
  return m;
};
const parentPhone = (s) => s.father?.phone || s.mother?.phone || s.guardian?.phone || s.emergencyContact?.phone || "";
const parentName = (s) => s.father?.name || s.mother?.name || s.guardian?.name || "";

async function students(q) {
  return Student.find(studentScope(q))
    .select("admissionNumber firstName middleName lastName className section rollNumber gender dateOfBirth school father mother guardian emergencyContact address transport busRoute")
    .populate("school", "name code")
    .sort({ className: 1, section: 1, rollNumber: 1, lastName: 1 })
    .lean();
}

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

async function studentList(q) {
  return (await students(q)).map((s) => ({
    ...studentRow(s),
    gender: s.gender,
    dateOfBirth: s.dateOfBirth,
    address: s.address,
    transport: s.transport || "",
    busRoute: s.busRoute || "",
  }));
}

// Students owing money on bills whose due date has passed.
async function feeDefaulters(q) {
  const list = await students(q);
  if (!list.length) return [];
  const rows = await FeeInvoice.aggregate([
    { $match: { student: { $in: list.map((s) => s._id) } } },
    { $project: { student: 1, dueDate: 1, amount: 1, paid: { $sum: "$payments.amount" } } },
    { $project: { student: 1, dueDate: 1, balance: { $max: [0, { $subtract: ["$amount", "$paid"] }] } } },
    { $match: { balance: { $gt: 0 } } },
    {
      $group: {
        _id: "$student",
        balance: { $sum: "$balance" },
        overdue: { $sum: { $cond: [{ $lt: ["$dueDate", new Date()] }, "$balance", 0] } },
        overdueBills: { $sum: { $cond: [{ $lt: ["$dueDate", new Date()] }, 1, 0] } },
        oldestDue: { $min: { $cond: [{ $lt: ["$dueDate", new Date()] }, "$dueDate", null] } },
      },
    },
    { $match: { overdue: { $gt: 0 } } },
  ]);
  const byId = new Map(list.map((s) => [String(s._id), s]));
  return rows
    .map((r) => ({ ...studentRow(byId.get(String(r._id))), overdue: r.overdue, balance: r.balance, overdueBills: r.overdueBills, oldestDue: r.oldestDue }))
    .sort((a, b) => b.overdue - a.overdue);
}

// Students whose attendance in the range is below the threshold percentage.
async function lowAttendance(q) {
  const list = await students(q);
  if (!list.length) return [];
  const from = new Date(`${q.from || academicYearStart()}T00:00:00Z`);
  const to = new Date(`${q.to || new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const rows = await Attendance.aggregate([
    { $match: { student: { $in: list.map((s) => s._id) }, date: { $gte: from, $lte: to }, status: { $ne: "holiday" } } },
    {
      $group: {
        _id: "$student",
        days: { $sum: 1 },
        attended: {
          $sum: { $switch: { branches: [{ case: { $in: ["$status", ["present", "late"]] }, then: 1 }, { case: { $eq: ["$status", "half_day"] }, then: 0.5 }], default: 0 } },
        },
        absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
      },
    },
  ]);
  const byId = new Map(list.map((s) => [String(s._id), s]));
  return rows
    .map((r) => ({ ...studentRow(byId.get(String(r._id))), days: r.days, absent: r.absent, percentage: Math.round((r.attended / r.days) * 1000) / 10 }))
    .filter((r) => r.percentage < q.threshold)
    .sort((a, b) => a.percentage - b.percentage);
}

module.exports = { studentList, feeDefaulters, lowAttendance };
