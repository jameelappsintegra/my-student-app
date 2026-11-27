// Year-end promotion: move a class to the next class for the new year.
const router = require("express").Router();
const mongoose = require("mongoose");
const { z } = require("zod");
const Student = require("../models/Student");
const { validate } = require("../middleware/validate");
const { canTeach } = require("../middleware/authorize");
const { objectId, classCode, academicYear } = require("../validators/common");
const { CLASS_CODES } = require("../constants");
const ApiError = require("../utils/ApiError");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const nextClass = (c) => CLASS_CODES[CLASS_CODES.indexOf(c) + 1] || null; // null after 12 → graduates

router.post("/", validate(z.object({
  school: objectId,
  className: classCode,
  section: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toUpperCase().regex(/^[A-Z]{1,5}$/).optional()),
  fromYear: academicYear,
  toYear: academicYear,
  // Students to keep in the same class (repeating the year).
  keep: z.array(objectId).max(500).default([]),
  dryRun: z.boolean().default(true),
}).strict().refine((b) => Number(b.toYear.slice(0, 4)) === Number(b.fromYear.slice(0, 4)) + 1, { message: "The new year must follow the current one", path: ["toYear"] })), h(async (req, res) => {
  const b = req.valid.body;
  if (!canTeach(req.user, b)) throw new ApiError(403, "This class isn't in your school.");
  const filter = { school: b.school, className: b.className, academicYear: b.fromYear, deletedAt: null, status: "active", ...(b.section ? { section: b.section } : {}) };
  const list = await Student.find(filter).select("firstName lastName admissionNumber rollNumber").sort({ rollNumber: 1, lastName: 1 }).lean();
  const keep = new Set(b.keep);
  const to = nextClass(b.className);
  const plan = list.map((s) => ({ id: String(s._id), name: `${s.firstName} ${s.lastName}`, admissionNumber: s.admissionNumber, action: keep.has(String(s._id)) ? "repeat" : to ? "promote" : "graduate" }));
  const counts = plan.reduce((a, p) => ({ ...a, [p.action]: (a[p.action] || 0) + 1 }), {});
  if (b.dryRun || !list.length) {
    return sendSuccess(res, { message: list.length ? "Preview" : "No active students in that class for that year.", data: { toClass: to, plan, counts } });
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const ids = (a) => plan.filter((p) => p.action === a).map((p) => new mongoose.Types.ObjectId(p.id));
      // Roll numbers are per class, so they're cleared for re-numbering.
      if (to) await Student.updateMany({ _id: { $in: ids("promote") } }, { $set: { className: to, academicYear: b.toYear }, $unset: { rollNumber: 1 } }, { session });
      await Student.updateMany({ _id: { $in: ids("graduate") } }, { $set: { status: "graduated" }, $unset: { rollNumber: 1 } }, { session });
      await Student.updateMany({ _id: { $in: ids("repeat") } }, { $set: { academicYear: b.toYear }, $unset: { rollNumber: 1 } }, { session });
    });
  } finally {
    await session.endSession();
  }
  req.log.info({ event: "students.promote", className: b.className, section: b.section, toYear: b.toYear, counts }, "Promotion");
  return sendSuccess(res, { message: `Done: ${counts.promote || 0} promoted${to ? ` to class ${to}` : ""}, ${counts.graduate || 0} graduated, ${counts.repeat || 0} repeating.`, data: { toClass: to, plan, counts } });
}));

module.exports = router;
