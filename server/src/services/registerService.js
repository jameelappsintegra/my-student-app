// Class attendance register: everyone in one school/class/section for a day.
const mongoose = require("mongoose");
const Student = require("../models/Student");
const { studentPublic } = require("../models/Student");
const Attendance = require("../models/Attendance");
const School = require("../models/School");
const ApiError = require("../utils/ApiError");
const { toPublic } = require("../utils/serialize");

const toDay = (s) => new Date(`${s}T00:00:00.000Z`);

function rosterFilter({ school, className, section }) {
  const filter = { school, className, deletedAt: null, status: "active" };
  if (section) filter.section = section.toUpperCase();
  return filter;
}

async function getRegister(q) {
  const school = await School.findById(q.school).select("name code").lean();
  if (!school) throw ApiError.notFound("School not found");
  const students = await Student.find(rosterFilter(q))
    .select("admissionNumber firstName middleName lastName rollNumber section className photo school")
    .sort({ rollNumber: 1, lastName: 1, firstName: 1 })
    .lean();
  const marks = await Attendance.find({ student: { $in: students.map((s) => s._id) }, date: toDay(q.date) })
    .select("student status note")
    .lean();
  const byStudent = new Map(marks.map((m) => [String(m.student), m]));
  return {
    school: { id: String(school._id), name: school.name, code: school.code },
    className: q.className,
    section: q.section ? q.section.toUpperCase() : null,
    date: q.date,
    marked: marks.length,
    students: students.map((s) => {
      const m = byStudent.get(String(s._id));
      return { ...studentPublic(toPublic(s)), attendance: m ? { status: m.status, note: m.note } : null };
    }),
  };
}

// Saves the whole register in one bulk write. Every student must belong to
// the register's class, so a crafted request can't mark other students.
async function saveRegister({ school, className, section, date, entries }) {
  const ids = entries.map((e) => e.student);
  if (new Set(ids).size !== ids.length) throw ApiError.badRequest("Each student can appear only once");
  const allowed = await Student.find({ ...rosterFilter({ school, className, section }), _id: { $in: ids } })
    .select("_id")
    .lean();
  if (allowed.length !== ids.length) {
    throw ApiError.badRequest("Some students are not in this class or are no longer active. Reload the register.");
  }
  const day = toDay(date);
  const schoolId = new mongoose.Types.ObjectId(school);
  const ops = entries.map((e) => ({
    updateOne: {
      filter: { student: new mongoose.Types.ObjectId(e.student), date: day },
      update: e.note
        ? { $set: { status: e.status, note: e.note, school: schoolId } }
        : { $set: { status: e.status, school: schoolId }, $unset: { note: 1 } },
      upsert: true,
    },
  }));
  await Attendance.bulkWrite(ops, { ordered: false });
  const counts = {};
  for (const e of entries) counts[e.status] = (counts[e.status] || 0) + 1;
  return { date, saved: entries.length, counts };
}

module.exports = { getRegister, saveRegister };
