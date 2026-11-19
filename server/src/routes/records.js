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
  sendSuccess(res, { message: "Results", data: await r.listResults(req.params.id) });
}));
router.post("/results", perm("results.manage"), validate(v.createResult), h(async (req, res) => {
  const data = await r.createResult(req.params.id, req.valid.body);
  audit(req, "result.create", { resultId: data.id });
  sendSuccess(res, { status: 201, message: `${data.exam} marks saved`, data });
}));
router.put("/results/:resultId", perm("results.manage"), idParam("resultId"), validate(v.updateResult), h(async (req, res) => {
  const data = await r.updateResult(req.params.id, req.params.resultId, req.valid.body);
  audit(req, "result.update", { resultId: data.id });
  sendSuccess(res, { message: `${data.exam} marks updated`, data });
}));
router.delete("/results/:resultId", perm("results.manage"), idParam("resultId"), h(async (req, res) => {
  await r.deleteResult(req.params.id, req.params.resultId);
  audit(req, "result.delete", { resultId: req.params.resultId });
  sendSuccess(res, { message: "Result deleted" });
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
  sendSuccess(res, { status: 201, message: `₹${p.amount} recorded. Receipt ${p.receiptNumber}`, data });
}));
router.delete("/fees/:invoiceId/payments/:paymentId", perm("fees.manage"), idParam("invoiceId"), idParam("paymentId"), h(async (req, res) => {
  const data = await r.removePayment(req.params.id, req.params.invoiceId, req.params.paymentId);
  audit(req, "fee.payment.remove", { invoiceId: data.id, paymentId: req.params.paymentId });
  sendSuccess(res, { message: "Payment removed", data });
}));

module.exports = router;
