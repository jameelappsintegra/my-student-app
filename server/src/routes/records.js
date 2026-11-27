// Mounted at /api/students/:id — attendance, results and fees of one student.
const router = require("express").Router({ mergeParams: true });
const r = require("../services/recordsService");
const v = require("../validators/records");
const { validate, validateId } = require("../middleware/validate");
const h = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { sendSuccess } = require("../utils/response");
const { requirePermission: perm, requireStudentAccess, shareAllows } = require("../middleware/authorize");

const idParam = (name) => (req, _res, next) =>
  /^[a-f0-9]{24}$/i.test(req.params[name]) ? next() : next(ApiError.badRequest("Invalid id"));
const dateParam = (req, _res, next) => {
  const parsed = v.attendanceDate.safeParse(req.params.date);
  if (!parsed.success) return next(ApiError.badRequest(parsed.error.issues[0].message));
  return next();
};
const audit = (req, event, extra) => req.log.info({ event, studentId: req.params.id, ...extra }, event);

router.use(validateId, perm("students.view"), requireStudentAccess);

router.get("/attendance", shareAllows("attendance"), validate(v.attendanceRange, "query"), h(async (req, res) => {
  sendSuccess(res, { message: "Attendance", data: await r.getAttendance(req.params.id, req.valid.query) });
}));
router.put("/attendance/:date", perm("attendance.mark"), dateParam, validate(v.markAttendance), h(async (req, res) => {
  const data = await r.markAttendance(req.params.id, req.params.date, req.valid.body);
  audit(req, "attendance.mark", { date: req.params.date, status: data.status });
  sendSuccess(res, { message: `Marked ${data.status.replace("_", " ")} for ${req.params.date}`, data });
}));
router.delete("/attendance/:date", perm("attendance.mark"), dateParam, h(async (req, res) => {
  await r.clearAttendance(req.params.id, req.params.date);
  audit(req, "attendance.clear", { date: req.params.date });
  sendSuccess(res, { message: "Attendance entry removed" });
}));

router.get("/results", shareAllows("academic"), h(async (req, res) => {
  // Parents, and other schools under a share, see published results only.
  const publishedOnly = ["parent", "student"].includes(req.user.role) || Boolean(req.share);
  sendSuccess(res, { message: "Results", data: await r.listResults(req.params.id, { publishedOnly }) });
}));
router.post("/results", perm("results.manage"), validate(v.createResult), h(async (req, res) => {
  const data = await r.createResult(req.params.id, req.valid.body);
  audit(req, "result.create", { resultId: data.id });
  sendSuccess(res, { status: 201, message: `${data.exam} marks saved`, data });
}));
router.put("/results/:resultId", perm("results.manage"), idParam("resultId"), validate(v.updateResult), h(async (req, res) => {
  const data = await r.updateResult(req.params.id, req.params.resultId, req.valid.body, req.user);
  audit(req, "result.update", { resultId: data.id });
  sendSuccess(res, { message: `${data.exam} marks updated`, data });
}));
router.delete("/results/:resultId", perm("results.manage"), idParam("resultId"), h(async (req, res) => {
  await r.deleteResult(req.params.id, req.params.resultId, req.user);
  audit(req, "result.delete", { resultId: req.params.resultId });
  sendSuccess(res, { message: "Result deleted" });
}));

// Report card data for one academic year (printable page in the web app).
router.get("/report-card", shareAllows("academic"), h(async (req, res) => {
  const Student = require("../models/Student");
  const year = typeof req.query.academicYear === "string" && /^\d{4}-\d{4}$/.test(req.query.academicYear) ? req.query.academicYear : null;
  const student = await Student.findById(req.params.id).populate("school", "name code address city phone principalName board").lean();
  const academicYear = year || student.academicYear;
  const publishedOnly = ["parent", "student"].includes(req.user.role) || Boolean(req.share);
  const results = (await r.listResults(req.params.id, { publishedOnly })).filter((x) => x.academicYear === academicYear);
  const [y1] = academicYear.split("-").map(Number);
  const settings = await require("../services/schoolSettings").getSettings(student.school._id);
  const m = settings.academicYearStartMonth;
  const start = `${y1}-${String(m).padStart(2, "0")}-01`;
  const yearEnd = new Date(Date.UTC(y1 + 1, m - 1, 0)).toISOString().slice(0, 10);
  const today = require("../services/schoolSettings").todayIn(settings.timezone);
  const attendance = await r.getAttendance(req.params.id, { from: start, to: today < yearEnd ? today : yearEnd });
  sendSuccess(res, {
    message: "Report card",
    data: {
      academicYear,
      student: { id: String(student._id), name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" "), admissionNumber: student.admissionNumber, className: student.className, section: student.section, rollNumber: student.rollNumber, dateOfBirth: student.dateOfBirth, father: student.father?.name, mother: student.mother?.name },
      school: student.school,
      results,
      attendance: attendance.summary,
      grading: { scale: settings.gradingScale, passPercentage: settings.passPercentage },
      terms: settings.terms,
      generatedAt: new Date(),
      includesDrafts: results.some((x) => x.status !== "published"),
    },
  });
}));

router.get("/fees", shareAllows("fees"), (req, res, next) => (req.share ? next() : perm("fees.view")(req, res, next)), h(async (req, res) => {
  sendSuccess(res, { message: "Fees", data: await r.listFees(req.params.id) });
}));
router.post("/fees", perm("fees.manage"), validate(v.createInvoice), h(async (req, res) => {
  const data = await r.createInvoice(req.params.id, req.valid.body);
  audit(req, "fee.create", { invoiceId: data.id });
  sendSuccess(res, { status: 201, message: `${data.title} added`, data });
}));
router.put("/fees/:invoiceId", perm("fees.manage"), idParam("invoiceId"), validate(v.updateInvoice), h(async (req, res) => {
  const data = await r.updateInvoice(req.params.id, req.params.invoiceId, req.valid.body);
  audit(req, "fee.update", { invoiceId: data.id });
  sendSuccess(res, { message: `${data.title} updated`, data });
}));
router.delete("/fees/:invoiceId", perm("fees.manage"), idParam("invoiceId"), h(async (req, res) => {
  await r.deleteInvoice(req.params.id, req.params.invoiceId);
  audit(req, "fee.delete", { invoiceId: req.params.invoiceId });
  sendSuccess(res, { message: "Fee deleted" });
}));
router.post("/fees/:invoiceId/payments", perm("fees.manage"), idParam("invoiceId"), validate(v.recordPayment), h(async (req, res) => {
  const data = await r.recordPayment(req.params.id, req.params.invoiceId, req.valid.body);
  const p = data.payments[data.payments.length - 1];
  audit(req, "fee.payment", { invoiceId: data.id, amount: p.amount, receipt: p.receiptNumber });
  const money = require("../services/schoolSettings").money(await require("../services/schoolSettings").getSettings(data.school), p.amount);
  sendSuccess(res, { status: 201, message: `${money} recorded. Receipt ${p.receiptNumber}`, data });
}));
router.delete("/fees/:invoiceId/payments/:paymentId", perm("fees.manage"), idParam("invoiceId"), idParam("paymentId"), h(async (req, res) => {
  const data = await r.removePayment(req.params.id, req.params.invoiceId, req.params.paymentId);
  audit(req, "fee.payment.remove", { invoiceId: data.id, paymentId: req.params.paymentId });
  sendSuccess(res, { message: "Payment removed", data });
}));

// Progress over the academic year: exams, subjects, attendance by month,
// homework hand-in, library and (for those who may see them) fees.
router.get("/progress", h(async (req, res) => {
  if (req.share) throw new ApiError(403, "Shared records don't include the progress summary.");
  const { can } = require("../constants/permissions");
  const data = await require("../services/progressService").studentProgress(req.params.id, {
    publishedOnly: ["parent", "student"].includes(req.user.role),
    withFees: can(req.user, "fees.view"),
  });
  sendSuccess(res, { message: "Progress", data });
}));

// A printable receipt for one payment.
router.get("/fees/:invoiceId/payments/:paymentId/receipt", perm("fees.view"), idParam("invoiceId"), idParam("paymentId"), h(async (req, res) => {
  if (req.share) throw new ApiError(403, "Shared records don't include receipts.");
  sendSuccess(res, { message: "Receipt", data: await require("../services/progressService").receipt(req.params.id, req.params.invoiceId, req.params.paymentId) });
}));

// Transport, library loans and certificates for one student.
router.get("/services", h(async (req, res) => {
  if (req.share) throw new ApiError(403, "Shared records don't include school services.");
  const Student = require("../models/Student");
  const TransportRoute = require("../models/TransportRoute");
  const BookIssue = require("../models/BookIssue");
  const Certificate = require("../models/Certificate");
  const settingsSvc = require("../services/schoolSettings");
  const s = await Student.findById(req.params.id).select("school transportRoute transportStop transport").lean();
  const settings = await settingsSvc.getSettings(s.school);
  const route = s.transportRoute ? await TransportRoute.findById(s.transportRoute).lean() : null;
  const stop = route?.stops.find((x) => x.name === s.transportStop);
  const loans = await BookIssue.find({ student: s._id }).sort({ returnedAt: 1, issuedAt: -1 }).limit(30).populate("book", "title author").lean();
  const certs = await Certificate.find({ student: s._id }).sort({ issuedAt: -1 }).select("type serialNumber issuedAt status").lean();
  const today = settingsSvc.todayIn(settings.timezone);
  const { present } = require("./library");
  sendSuccess(res, {
    message: "Services",
    data: {
      currency: settings.currency,
      locale: settings.locale,
      transport: route
        ? { route: { id: String(route._id), name: route.name, vehicleNumber: route.vehicleNumber, driverName: route.driverName, driverPhone: route.driverPhone, attendantName: route.attendantName, attendantPhone: route.attendantPhone }, stop: stop || { name: s.transportStop } }
        : { mode: s.transport || null },
      library: loans.map((x) => present(x, today)),
      certificates: certs.map((c) => ({ id: String(c._id), type: c.type, serialNumber: c.serialNumber, issuedAt: c.issuedAt, status: c.status })),
    },
  });
}));

module.exports = router;
