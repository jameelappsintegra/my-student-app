const router = require("express").Router();
const { z } = require("zod");
const LeaveRequest = require("../models/LeaveRequest");
const Student = require("../models/Student");
const Attendance = require("../models/Attendance");
const { validate, validateId } = require("../middleware/validate");
const { requirePermission: perm, scoped } = require("../middleware/authorize");
const { objectId, optionalText } = require("../validators/common");
const { notify, staffFor } = require("../services/notificationService");
const { can } = require("../constants/permissions");
const ApiError = require("../utils/ApiError");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const { toPublic } = require("../utils/serialize");

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-18");
const day = (s) => new Date(`${s}T00:00:00.000Z`);
const DAY = 86400000;

const { getSettings, isSchoolDay } = require("../services/schoolSettings");

// School days in a range: skips the school's weekly offs and holidays.
function schoolDays(from, to, settings) {
  const out = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY) {
    const d = new Date(t);
    if (isSchoolDay(settings, d)) out.push(d);
  }
  return out;
}

const present = (r) => ({
  ...toPublic(r),
  student: r.student?.firstName ? { id: String(r.student._id), name: `${r.student.firstName} ${r.student.lastName}`, className: r.student.className, section: r.student.section } : r.student,
  requestedBy: r.requestedBy?.name || undefined,
  decidedBy: r.decidedBy?.name || undefined,
});

router.get("/", validate(z.object({ status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional() }).strict(), "query"), h(async (req, res) => {
  const filter = { ...(req.valid.query.status ? { status: req.valid.query.status } : {}) };
  if (req.user.role === "parent") filter.requestedBy = req.user._id;
  else if (!can(req.user, "leave.decide")) throw new ApiError(403, "You don't have permission to do that.");
  else if (req.user.role !== "admin") {
    const ids = (await Student.find(scoped(req.user, { deletedAt: null })).select("_id").lean()).map((s) => s._id);
    filter.student = { $in: ids };
  }
  const rows = await LeaveRequest.find(filter).sort({ status: 1, from: -1 }).limit(200)
    .populate("student", "firstName lastName className section").populate("requestedBy", "name").populate("decidedBy", "name").lean();
  sendSuccess(res, { message: "Leave requests", data: rows.map(present) });
}));

router.post(
  "/",
  perm("leave.request"),
  validate(z.object({ student: objectId, from: isoDay, to: isoDay, reason: z.string().trim().min(5, "Give a short reason").max(500) }).strict()),
  h(async (req, res) => {
    const b = req.valid.body;
    if (!(req.user.children || []).map(String).includes(b.student)) throw ApiError.notFound("Student not found");
    const from = day(b.from);
    const to = day(b.to);
    if (to < from) throw ApiError.badRequest("The last day must be on or after the first day.");
    if ((to - from) / DAY > 30) throw ApiError.badRequest("Ask for at most 31 days at a time.");
    if (from < new Date(Date.now() - 7 * DAY)) throw ApiError.badRequest("Leave can be requested up to 7 days after it was taken.");
    const student = await Student.findOne({ _id: b.student, deletedAt: null }).select("school className section firstName lastName").lean();
    if (!student) throw ApiError.notFound("Student not found");
    const overlap = await LeaveRequest.exists({ student: student._id, status: { $in: ["pending", "approved"] }, from: { $lte: to }, to: { $gte: from } });
    if (overlap) throw ApiError.conflict("There is already a leave request covering some of these days.");
    const r = await LeaveRequest.create({ student: student._id, school: student.school, from, to, reason: b.reason, requestedBy: req.user._id });
    await notify(await staffFor(student.school, student.className, student.section), {
      type: "leave", title: `Leave request: ${student.firstName} ${student.lastName}`, body: `${b.from} to ${b.to}: ${b.reason}`, link: "/leave",
    });
    req.log.info({ event: "leave.request", leaveId: r.id, studentId: b.student }, "Leave requested");
    sendSuccess(res, { status: 201, message: "Leave request sent to the class teacher.", data: r });
  })
);

router.post("/:id/decision", validateId, perm("leave.decide"), validate(z.object({ approve: z.boolean(), note: optionalText(300) }).strict()), h(async (req, res) => {
  const r = await LeaveRequest.findById(req.params.id);
  if (!r || !(await Student.exists(scoped(req.user, { _id: r.student, deletedAt: null })))) throw ApiError.notFound("Leave request not found");
  if (r.status !== "pending") throw ApiError.badRequest(`This request was already ${r.status}.`);
  r.status = req.valid.body.approve ? "approved" : "rejected";
  r.decidedBy = req.user._id;
  r.decidedAt = new Date();
  r.note = req.valid.body.note;
  await r.save();
  let marked = 0;
  if (r.status === "approved") {
    // Mark the days as leave, but never overwrite a holiday.
    const days = schoolDays(r.from, r.to, await getSettings(r.school));
    const holidays = new Set((await Attendance.find({ student: r.student, date: { $in: days }, status: "holiday" }).select("date").lean()).map((a) => a.date.getTime()));
    const ops = days.filter((d) => !holidays.has(d.getTime())).map((d) => ({
      updateOne: { filter: { student: r.student, date: d }, update: { $set: { status: "leave", note: `Approved leave: ${r.reason}`.slice(0, 200), school: r.school } }, upsert: true },
    }));
    if (ops.length) await Attendance.bulkWrite(ops);
    marked = ops.length;
  }
  await notify([r.requestedBy], {
    type: "leave",
    title: `Leave ${r.status}`,
    body: `${r.from.toISOString().slice(0, 10)} to ${r.to.toISOString().slice(0, 10)}${r.note ? `: ${r.note}` : ""}`,
    link: "/leave",
  });
  req.log.info({ event: "leave.decision", leaveId: r.id, status: r.status, days: marked }, "Leave decided");
  sendSuccess(res, { message: r.status === "approved" ? `Leave approved; ${marked} school days marked as leave.` : "Leave request rejected.", data: r });
}));

router.post("/:id/cancel", validateId, h(async (req, res) => {
  const r = await LeaveRequest.findById(req.params.id);
  if (!r || String(r.requestedBy) !== String(req.user._id)) throw ApiError.notFound("Leave request not found");
  if (r.status !== "pending") throw ApiError.badRequest("Only pending requests can be cancelled.");
  r.status = "cancelled";
  await r.save();
  sendSuccess(res, { message: "Leave request cancelled.", data: r });
}));

module.exports = router;
