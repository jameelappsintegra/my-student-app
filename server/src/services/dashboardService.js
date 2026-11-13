const Student = require("../models/Student");
const Admission = require("../models/Admission");
const { PENDING_ADMISSION_STATUSES } = require("../constants");

async function getSummary() {
  const [
    totalStudents,
    pendingAdmissions,
    approvedAwaitingEnrolment,
    studentsByClass,
    recentAdmissions,
  ] = await Promise.all([
    Student.countDocuments({ deletedAt: null, status: "active" }),
    Admission.countDocuments({ status: { $in: PENDING_ADMISSION_STATUSES } }),
    Admission.countDocuments({ status: "approved" }),
    Student.aggregate([
      { $match: { deletedAt: null, status: "active" } },
      { $group: { _id: "$className", count: { $sum: 1 } } },
    ]),
    Admission.find()
      .select("applicationNumber firstName lastName classApplied status createdAt")
      .sort({ createdAt: -1 })
      .limit(5),
  ]);

  return {
    totalStudents,
    pendingAdmissions,
    approvedAwaitingEnrolment,
    studentsByClass: studentsByClass.map((r) => ({
      className: r._id,
      count: r.count,
    })),
    recentAdmissions,
  };
}

module.exports = { getSummary };
