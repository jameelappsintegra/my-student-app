const Student = require("../models/Student");
const ApiError = require("../utils/ApiError");
const { escapeRegex, buildPagination, parseSort } = require("../utils/query");

const notDeleted = { deletedAt: null };

async function listStudents(q) {
  const filter = { ...notDeleted };
  if (q.className) filter.className = q.className;
  if (q.section) filter.section = q.section.toUpperCase();
  if (q.status) filter.status = q.status;
  if (q.academicYear) filter.academicYear = q.academicYear;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ firstName: rx }, { lastName: rx }, { admissionNumber: rx }];
  }

  const [items, total] = await Promise.all([
    Student.find(filter)
      .select(
        "admissionNumber firstName middleName lastName gender dateOfBirth className section rollNumber academicYear status"
      )
      .sort(parseSort(q.sort))
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    Student.countDocuments(filter),
  ]);
  return { items, pagination: buildPagination(q.page, q.limit, total) };
}

async function getStudent(id) {
  const student = await Student.findOne({ _id: id, ...notDeleted });
  if (!student) throw ApiError.notFound("Student not found");
  return student;
}

async function updateStudent(id, changes) {
  const student = await getStudent(id);
  student.set(changes);
  await student.save();
  return student;
}

async function updateStatus(id, status) {
  const student = await getStudent(id);
  student.status = status;
  await student.save();
  return student;
}

// Soft delete: the record is kept for history but hidden from the API.
async function deleteStudent(id) {
  const student = await getStudent(id);
  student.deletedAt = new Date();
  student.status = "inactive";
  await student.save();
}

module.exports = {
  listStudents,
  getStudent,
  updateStudent,
  updateStatus,
  deleteStudent,
};
