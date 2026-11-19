const School = require("../models/School");
const Student = require("../models/Student");
const Admission = require("../models/Admission");
const ApiError = require("../utils/ApiError");
const { buildPagination, escapeRegex } = require("../utils/query");
const { toPublic } = require("../utils/serialize");

async function listSchools(q, user) {
  // Teachers see only the schools they teach in.
  const filter = user ? { ...require("../middleware/authorize").schoolScope(user) } : {};
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ name: rx }, { code: rx }, { city: rx }];
  }
  const [items, total, counts] = await Promise.all([
    School.find(filter).sort({ name: 1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    School.countDocuments(filter),
    Student.aggregate([
      { $match: { deletedAt: null, status: "active" } },
      { $group: { _id: "$school", count: { $sum: 1 } } },
    ]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.count]));
  return {
    items: items.map((s) => ({ ...toPublic(s), activeStudents: byId.get(String(s._id)) || 0 })),
    pagination: buildPagination(q.page, q.limit, total),
  };
}

async function getSchool(id) {
  const school = await School.findById(id);
  if (!school) throw ApiError.notFound("School not found");
  return school;
}

// Used by admissions and students: the school must exist and be open.
async function requireActiveSchool(id, session) {
  const school = await School.findById(id).session(session || null);
  if (!school) throw ApiError.badRequest("Validation failed", [{ field: "school", message: "Select a school" }]);
  if (!school.active) {
    throw ApiError.badRequest("Validation failed", [
      { field: "school", message: `${school.name} is not accepting new students` },
    ]);
  }
  return school;
}

async function createSchool(input) {
  try {
    return await School.create(input);
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict(`A school with code ${input.code} already exists.`);
    throw err;
  }
}

async function updateSchool(id, changes) {
  const school = await getSchool(id);
  if (changes.code && changes.code !== school.code) {
    const used = await Student.exists({ school: school._id });
    if (used) {
      throw ApiError.conflict("The code is part of existing admission numbers and can't be changed.");
    }
  }
  school.set(changes);
  try {
    await school.save();
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict(`A school with code ${changes.code} already exists.`);
    throw err;
  }
  return school;
}

// Only schools with no records can be deleted; otherwise mark them inactive.
async function deleteSchool(id) {
  const school = await getSchool(id);
  const [students, admissions] = await Promise.all([
    Student.countDocuments({ school: school._id }),
    Admission.countDocuments({ school: school._id }),
  ]);
  if (students || admissions) {
    throw ApiError.conflict(
      `${school.name} has ${students} student and ${admissions} admission records. Mark it inactive instead.`
    );
  }
  await school.deleteOne();
}

module.exports = { listSchools, getSchool, requireActiveSchool, createSchool, updateSchool, deleteSchool };
