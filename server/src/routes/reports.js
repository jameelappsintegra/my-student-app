// Report catalogue. Each report declares the permission it needs; the data
// itself is always limited to the requesting user's students.
const router = require("express").Router();
const { z } = require("zod");
const { validate } = require("../middleware/validate");
const { objectId, classCode, academicYear } = require("../validators/common");
const reports = require("../services/reportService");
const h = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { sendSuccess } = require("../utils/response");
const { sendCsv } = require("../utils/csv");
const { can } = require("../constants/permissions");
const { schoolIds } = require("../middleware/authorize");

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-18");
const base = {
  school: objectId.optional(),
  className: classCode.optional(),
  section: z.string().trim().regex(/^[A-Za-z]{1,5}$/).optional(),
  format: z.enum(["json", "csv"]).default("json"),
};
const range = { from: isoDay.optional(), to: isoDay.optional() };
const threshold = { threshold: z.coerce.number().min(1).max(100).default(75) };
const exam = { exam: z.string().trim().max(60).optional(), academicYear: academicYear.optional() };

const studentCols = [
  ["Admission no.", "admissionNumber"], ["Name", "name"], ["School", "school"], ["Class", "className"],
  ["Section", "section"], ["Roll", "rollNumber"], ["Parent", "parent"], ["Parent phone", "parentPhone"],
];
const classCols = [["School", "school"], ["Class", "className"], ["Section", "section"]];

const CATALOGUE = {
  students: {
    title: "Student list", group: "Students", perm: "students.view", params: {},
    run: reports.studentList,
    columns: [...studentCols, ["Gender", "gender"], ["Date of birth", "dateOfBirth"], ["Address", "address"], ["Transport", "transport"], ["Bus route", "busRoute"]],
  },
  strength: {
    title: "Class strength", group: "Students", perm: "students.view", params: {},
    run: reports.strength,
    columns: [...classCols, ["Students", "total"], ["Girls", "girls"], ["Boys", "boys"], ["Other", "other"]],
  },
  "daily-attendance": {
    title: "Daily attendance", group: "Attendance", perm: "attendance.mark", params: { date: isoDay.optional() },
    run: reports.dailyAttendance,
    columns: [["Date", "date"], ...classCols, ["Students", "students"], ["Marked", "marked"], ["Present", "present"], ["Absent", "absent"], ["Late", "late"], ["Leave", "leave"], ["Not marked", "notMarked"]],
  },
  "class-attendance": {
    title: "Class attendance summary", group: "Attendance", perm: "students.view", params: { ...range, ...threshold },
    run: reports.classAttendance,
    columns: [...classCols, ["Students", "students"], ["With records", "recorded"], ["Average %", "averagePercentage"], ["Below threshold", "belowThreshold"]],
  },
  "low-attendance": {
    title: "Low attendance", group: "Attendance", perm: "students.view", params: { ...range, ...threshold },
    run: reports.lowAttendance,
    columns: [...studentCols, ["School days", "days"], ["Absent", "absent"], ["Attendance %", "percentage"]],
  },
  "exam-performance": {
    title: "Exam performance by class", group: "Results", perm: "students.view", params: exam,
    run: reports.examPerformance,
    columns: [...classCols, ["Year", "academicYear"], ["Exam", "exam"], ["Students", "students"], ["Average %", "averagePercentage"], ["Average grade", "averageGrade"], ["Pass rate %", "passRate"], ["Highest %", "highest"], ["Topper", "topper"]],
  },
  "subject-performance": {
    title: "Subject performance", group: "Results", perm: "students.view", params: exam,
    run: reports.subjectPerformance,
    columns: [...classCols, ["Exam", "exam"], ["Subject", "subject"], ["Students", "students"], ["Average %", "averagePercentage"], ["Highest %", "highest"], ["Lowest %", "lowest"], ["Pass rate %", "passRate"]],
  },
  toppers: {
    title: "Class toppers", group: "Results", perm: "students.view", params: { ...exam, top: z.coerce.number().int().min(1).max(10).default(3) },
    run: reports.toppers,
    columns: [["Exam", "exam"], ["Rank", "rank"], ...studentCols.slice(0, 6), ["Percentage", "percentage"], ["Grade", "grade"]],
  },
  "fee-defaulters": {
    title: "Fee defaulters", group: "Fees", perm: "fees.view", params: {},
    run: reports.feeDefaulters,
    columns: [...studentCols, ["Overdue (INR)", "overdue"], ["Total balance (INR)", "balance"], ["Overdue bills", "overdueBills"], ["Oldest due date", "oldestDue"]],
  },
  "fee-collection": {
    title: "Fee collection", group: "Fees", perm: "fees.view", params: range,
    run: reports.feeCollection,
    columns: [["Date", "date"], ["School", "school"], ["Method", "method"], ["Payments", "payments"], ["Amount (INR)", "amount"]],
  },
  admissions: {
    title: "Admissions by status", group: "Admissions", perm: "dashboard.view", params: {},
    run: reports.admissions,
    columns: [["School", "school"], ["Total", "total"], ["Submitted", "submitted"], ["Under review", "under_review"], ["Documents required", "documents_required"], ["Approved", "approved"], ["Rejected", "rejected"], ["Enrolled", "enrolled"]],
  },
};

// Which reports this user can run (drives the Reports page).
router.get("/", (req, res) => {
  const list = Object.entries(CATALOGUE)
    .filter(([, r]) => can(req.user, r.perm))
    .map(([id, r]) => ({ id, title: r.title, group: r.group, params: Object.keys(r.params) }));
  sendSuccess(res, { message: "Reports", data: list });
});

for (const [id, r] of Object.entries(CATALOGUE)) {
  router.get(
    `/${id}`,
    (req, _res, next) => (can(req.user, r.perm) ? next() : next(new ApiError(403, "You don't have access to this report."))),
    validate(z.object({ ...base, ...r.params }).strict(), "query"),
    (req, _res, next) => {
      // A school outside the user's scope returns nothing rather than leaking.
      const allowed = schoolIds(req.user);
      if (allowed && req.valid.query.school && !allowed.includes(req.valid.query.school)) return next(new ApiError(403, "That school isn't yours."));
      return next();
    },
    h(async (req, res) => {
      const rows = await r.run(req.valid.query, req.user);
      req.log.info({ event: "report.view", report: id, format: req.valid.query.format, rows: rows.length }, "Report");
      const columns = r.columns.map(([label, value]) => ({ label, value }));
      if (req.valid.query.format === "csv") {
        return sendCsv(res, `edupro-${id}-${new Date().toISOString().slice(0, 10)}.csv`, columns, rows);
      }
      const extra = id === "fee-defaulters" ? { overdue: rows.reduce((a, x) => a + x.overdue, 0) } : id === "fee-collection" ? { collected: rows.reduce((a, x) => a + x.amount, 0) } : {};
      return sendSuccess(res, { message: r.title, data: { rows, total: rows.length, columns: r.columns.map(([label, key]) => ({ label, key })), ...extra } });
    })
  );
}

module.exports = router;
