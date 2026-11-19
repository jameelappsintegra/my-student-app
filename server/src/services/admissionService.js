const mongoose = require("mongoose");
const Admission = require("../models/Admission");
const Student = require("../models/Student");
const Counter = require("../models/Counter");
const { buildDedupeKey } = require("../models/common");
const ApiError = require("../utils/ApiError");
const { buildPagination, parseSort, searchFilter } = require("../utils/query");
const { toPublic } = require("../utils/serialize");
const { ADMISSION_TRANSITIONS } = require("../constants");
const { nextAdmissionNumber } = require("./admissionNumbers");
const { requireActiveSchool } = require("./schoolService");

const pad = (n) => String(n).padStart(5, "0");
const startYear = (academicYear) => academicYear.slice(0, 4);

async function createAdmission(input) {
  const { saveAsDraft, ...fields } = input;
  const dedupeKey = buildDedupeKey(fields);
  await requireActiveSchool(fields.school);

  const existingStudent = await Student.findOne({ dedupeKey, deletedAt: null })
    .select("admissionNumber")
    .lean();
  if (existingStudent) {
    throw ApiError.conflict(
      `This child is already enrolled (admission number ${existingStudent.admissionNumber}).`
    );
  }

  const openApplication = await Admission.findOne({
    dedupeKey,
    academicYear: fields.academicYear,
    isActiveApplication: true,
  })
    .select("applicationNumber")
    .lean();
  if (openApplication) {
    throw ApiError.conflict(
      `An application for this child is already open (${openApplication.applicationNumber}).`
    );
  }

  const year = startYear(fields.academicYear);
  const seq = await Counter.next(`application:${year}`);
  const status = saveAsDraft ? "draft" : "submitted";

  try {
    return await Admission.create({
      ...fields,
      applicationNumber: `APP-${year}-${pad(seq)}`,
      status,
      statusHistory: [{ status }],
    });
  } catch (err) {
    // Lost a race with a concurrent identical submission.
    if (err.code === 11000) {
      throw ApiError.conflict(
        "An application for this child is already open for this academic year."
      );
    }
    throw err;
  }
}

async function listAdmissions(q) {
  const filter = {};
  if (q.school) filter.school = q.school;
  if (q.status) filter.status = q.status;
  if (q.classApplied) filter.classApplied = q.classApplied;
  if (q.academicYear) filter.academicYear = q.academicYear;
  if (q.search) Object.assign(filter, searchFilter(q.search));

  const [items, total] = await Promise.all([
    Admission.find(filter)
      .select(
        "applicationNumber school firstName middleName lastName dateOfBirth gender classApplied academicYear status createdAt student"
      )
      .populate("school", "name code")
      .sort(parseSort(q.sort))
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Admission.countDocuments(filter),
  ]);
  return {
    items: items.map((a) => ({ ...toPublic(a), school: schoolRef(a.school) })),
    pagination: buildPagination(q.page, q.limit, total),
  };
}

function schoolRef(s) {
  return s && s.name ? { id: String(s._id), name: s.name, code: s.code } : s;
}

async function getAdmission(id) {
  const admission = await Admission.findById(id).populate("school", "name code");
  if (!admission) throw ApiError.notFound("Admission not found");
  return admission;
}

async function updateStatus(id, { status, note }) {
  const admission = await Admission.findById(id);
  if (!admission) throw ApiError.notFound("Admission not found");
  if (status === "enrolled") {
    throw ApiError.badRequest(
      "Use the enrol action to enrol an approved application."
    );
  }
  const allowed = ADMISSION_TRANSITIONS[admission.status];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(
      `Cannot change status from ${admission.status} to ${status}.`
    );
  }
  admission.status = status;
  admission.statusHistory.push({ status, note });
  if (status === "rejected") admission.isActiveApplication = false;
  await admission.save();
  return getAdmission(id);
}

// Creates the student and marks the admission enrolled atomically.
// Requires MongoDB running as a replica set (Atlas always is).
async function enroll(id, { section, rollNumber, admissionDate }) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const admission = await Admission.findById(id).session(session);
      if (!admission) throw ApiError.notFound("Admission not found");
      if (admission.status !== "approved") {
        throw ApiError.badRequest(
          `Only approved applications can be enrolled (current status: ${admission.status}).`
        );
      }

      const duplicate = await Student.findOne({
        dedupeKey: admission.dedupeKey,
        deletedAt: null,
      }).session(session);
      if (duplicate) {
        throw ApiError.conflict(
          `This child is already enrolled (admission number ${duplicate.admissionNumber}).`
        );
      }

      const school = await requireActiveSchool(admission.school, session);
      const admissionNumber = await nextAdmissionNumber(school, admission.academicYear, session);
      const personal = admission.toObject();
      const [student] = await Student.create(
        [
          {
            admissionNumber,
            school: admission.school,
            firstName: personal.firstName,
            middleName: personal.middleName,
            lastName: personal.lastName,
            dateOfBirth: personal.dateOfBirth,
            gender: personal.gender,
            bloodGroup: personal.bloodGroup,
            nationality: personal.nationality,
            address: personal.address,
            previousSchool: personal.previousSchool,
            father: personal.father,
            mother: personal.mother,
            guardian: personal.guardian,
            emergencyContact: personal.emergencyContact,
            academicYear: personal.academicYear,
            className: personal.classApplied,
            section,
            rollNumber,
            admissionDate: admissionDate || new Date(),
            admission: admission._id,
          },
        ],
        { session }
      );

      admission.status = "enrolled";
      admission.student = student._id;
      admission.isActiveApplication = false;
      admission.statusHistory.push({
        status: "enrolled",
        note: `Enrolled as ${student.admissionNumber}`,
      });
      await admission.save({ session });
      result = { admission, student };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  createAdmission,
  listAdmissions,
  getAdmission,
  updateStatus,
  enroll,
};
