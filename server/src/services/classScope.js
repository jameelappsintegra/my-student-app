// Which classes a user may read or post to, as Mongo filters over
// { school, className, section } documents (homework, announcements, timetable).
const mongoose = require("mongoose");
const Student = require("../models/Student");
const { schoolIds, familyIds, isFamily } = require("../middleware/authorize");

const oid = (x) => new mongoose.Types.ObjectId(String(x._id || x));

// Filter over class-level documents the user may see, or null for "all".
async function classFilter(user) {
  if (user.role === "admin") return null;
  if (user.role === "principal" || user.role === "librarian") return { school: { $in: schoolIds(user).map(oid) } };
  if (user.role === "teacher") {
    const list = user.assignments || [];
    if (!list.length) return { _id: { $in: [] } };
    return {
      $or: list.map((a) => ({
        school: oid(a.school),
        className: a.className,
        ...(a.section ? { section: { $in: [a.section, "", null] } } : {}),
      })),
    };
  }
  if (isFamily(user)) {
    const kids = await Student.find({ _id: { $in: familyIds(user).map(oid) }, deletedAt: null }).select("school className section").lean();
    if (!kids.length) return { _id: { $in: [] } };
    return { $or: kids.map((k) => ({ school: k.school, className: k.className, section: { $in: [k.section || "", "", null] } })) };
  }
  return { _id: { $in: [] } };
}

// Schools a user may read settings and calendars for, or null for all.
async function visibleSchoolIds(user) {
  if (user.role === "admin") return null;
  if (isFamily(user)) {
    const kids = await Student.find({ _id: { $in: familyIds(user).map(oid) }, deletedAt: null }).select("school").lean();
    return [...new Set(kids.map((k) => String(k.school)))];
  }
  return schoolIds(user);
}

module.exports = { classFilter, visibleSchoolIds, oid };
