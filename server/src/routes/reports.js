const router = require("express").Router();
const { z } = require("zod");
const { validate } = require("../middleware/validate");
const { objectId, classCode } = require("../validators/common");
const reports = require("../services/reportService");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const { sendCsv } = require("../utils/csv");

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-18");
const scope = {
  school: objectId.optional(),
  className: classCode.optional(),
  section: z.string().trim().regex(/^[A-Za-z]{1,5}$/).optional(),
  format: z.enum(["json", "csv"]).default("json"),
};
const stamp = () => new Date().toISOString().slice(0, 10);
const base = [
  { label: "Admission no.", value: "admissionNumber" },
  { label: "Name", value: "name" },
  { label: "School", value: "school" },
  { label: "Class", value: "className" },
  { label: "Section", value: "section" },
  { label: "Roll", value: "rollNumber" },
  { label: "Parent", value: "parent" },
  { label: "Parent phone", value: "parentPhone" },
];

function respond(req, res, name, columns, rows, extra = {}) {
  req.log.info({ event: "report.view", report: name, format: req.valid.query.format, rows: rows.length }, "Report");
  if (req.valid.query.format === "csv") return sendCsv(res, `edupro-${name}-${stamp()}.csv`, columns, rows);
  return sendSuccess(res, { message: "Report", data: { rows, ...extra } });
}

router.get("/students", validate(z.object(scope).strict(), "query"), h(async (req, res) => {
  const rows = await reports.studentList(req.valid.query);
  respond(req, res, "students", [
    ...base,
    { label: "Gender", value: "gender" },
    { label: "Date of birth", value: "dateOfBirth" },
    { label: "Address", value: "address" },
    { label: "Transport", value: "transport" },
    { label: "Bus route", value: "busRoute" },
  ], rows, { total: rows.length });
}));

router.get("/fee-defaulters", validate(z.object(scope).strict(), "query"), h(async (req, res) => {
  const rows = await reports.feeDefaulters(req.valid.query);
  respond(req, res, "fee-defaulters", [
    ...base,
    { label: "Overdue (INR)", value: "overdue" },
    { label: "Total balance (INR)", value: "balance" },
    { label: "Overdue bills", value: "overdueBills" },
    { label: "Oldest due date", value: "oldestDue" },
  ], rows, { total: rows.length, overdue: rows.reduce((a, r) => a + r.overdue, 0) });
}));

router.get(
  "/low-attendance",
  validate(
    z
      .object({ ...scope, threshold: z.coerce.number().min(1).max(100).default(75), from: isoDay.optional(), to: isoDay.optional() })
      .strict(),
    "query"
  ),
  h(async (req, res) => {
    const rows = await reports.lowAttendance(req.valid.query);
    respond(req, res, "low-attendance", [
      ...base,
      { label: "School days", value: "days" },
      { label: "Absent", value: "absent" },
      { label: "Attendance %", value: "percentage" },
    ], rows, { total: rows.length, threshold: req.valid.query.threshold });
  })
);

module.exports = router;
