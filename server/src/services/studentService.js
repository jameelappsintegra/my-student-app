const mongoose = require("mongoose");
const Student = require("../models/Student");
const { studentPublic } = require("../models/Student");
const { buildDedupeKey } = require("../models/common");
const ApiError = require("../utils/ApiError");
const { buildPagination, parseSort, searchFilter } = require("../utils/query");
const { toPublic } = require("../utils/serialize");
const { nextAdmissionNumber } = require("./admissionNumbers");
const { requireActiveSchool } = require("./schoolService");
const photos = require("./photoService");

const notDeleted = { deletedAt: null };
const LIST_FIELDS =
  "admissionNumber school firstName middleName lastName gender dateOfBirth className section rollNumber academicYear status photo";

async function listStudents(q) {
  const filter = { ...notDeleted };
  if (q.school) filter.school = q.school;
  if (q.className) filter.className = q.className;
  if (q.section) filter.section = q.section.toUpperCase();
  if (q.status) filter.status = q.status;
  if (q.academicYear) filter.academicYear = q.academicYear;
  if (q.search) Object.assign(filter, searchFilter(q.search));

  const [items, total] = await Promise.all([
    Student.find(filter)
      .select(LIST_FIELDS)
      .populate("school", "name code")
      .sort(parseSort(q.sort))
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Student.countDocuments(filter),
  ]);
  return {
    items: items.map((s) => studentPublic(toPublic(s))),
    pagination: buildPagination(q.page, q.limit, total),
  };
}

async function findStudent(id) {
  const student = await Student.findOne({ _id: id, ...notDeleted });
  if (!student) throw ApiError.notFound("Student not found");
  return student;
}

async function getStudent(id) {
  const student = await findStudent(id);
  await student.populate("school", "name code");
  return student;
}

async function assertNotDuplicate(fields, exceptId) {
  const dup = await Student.findOne({
    dedupeKey: buildDedupeKey(fields),
    ...notDeleted,
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  })
    .select("admissionNumber")
    .lean();
  if (dup) {
    throw ApiError.conflict(
      `A student with this name and date of birth already exists (${dup.admissionNumber}).`
    );
  }
}

// Registers an existing student directly; the admission number and the
// record are created in one transaction.
async function createStudent(input) {
  await assertNotDuplicate(input);
  const session = await mongoose.startSession();
  try {
    let created;
    await session.withTransaction(async () => {
      const school = await requireActiveSchool(input.school, session);
      const admissionNumber = await nextAdmissionNumber(school, input.academicYear, session);
      const [student] = await Student.create(
        [{ ...input, admissionNumber, admissionDate: input.admissionDate || new Date() }],
        { session }
      );
      created = student;
    });
    return getStudent(created._id);
  } finally {
    await session.endSession();
  }
}

async function updateStudent(id, changes) {
  const student = await findStudent(id);
  const next = { ...student.toObject(), ...changes };
  if (changes.firstName || changes.lastName || changes.dateOfBirth) {
    await assertNotDuplicate(next, student._id);
  }
  student.set(changes);
  await student.save();
  return getStudent(id);
}

async function updateStatus(id, status) {
  const student = await findStudent(id);
  student.status = status;
  await student.save();
  return getStudent(id);
}

// Soft delete: the record is kept for history but hidden from the API.
async function deleteStudent(id) {
  const student = await findStudent(id);
  student.deletedAt = new Date();
  student.status = "inactive";
  // Free the roll number for reuse in the section.
  student.rollNumber = undefined;
  await student.save();
}

async function setPhoto(id, buffer) {
  const student = await findStudent(id);
  const { fileId } = await photos.store(buffer, String(student._id));
  const previous = student.photo?.fileId;
  student.photo = { fileId, updatedAt: new Date() };
  try {
    await student.save();
  } catch (err) {
    await photos.remove(fileId);
    throw err;
  }
  await photos.remove(previous);
  return getStudent(id);
}

async function removePhoto(id) {
  const student = await findStudent(id);
  const previous = student.photo?.fileId;
  student.photo = undefined;
  await student.save();
  await photos.remove(previous);
  return getStudent(id);
}

async function photoFor(id) {
  const student = await Student.findOne({ _id: id, ...notDeleted }).select("photo").lean();
  if (!student?.photo?.fileId) throw ApiError.notFound("This student has no photo");
  return student.photo;
}

module.exports = {
  listStudents,
  getStudent,
  createStudent,
  updateStudent,
  updateStatus,
  deleteStudent,
  setPhoto,
  removePhoto,
  photoFor,
};
