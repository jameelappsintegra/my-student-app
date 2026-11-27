// Publishing exam results for a whole class.
const router = require("express").Router();
const { z } = require("zod");
const ExamResult = require("../models/ExamResult");
const Student = require("../models/Student");
const { validate } = require("../middleware/validate");
const { requirePermission: perm, canTeach } = require("../middleware/authorize");
const { objectId, classCode, academicYear } = require("../validators/common");
const { notify, parentsOf } = require("../services/notificationService");
const { oid } = require("../services/classScope");
const ApiError = require("../utils/ApiError");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const where = {
  school: objectId,
  className: classCode,
  section: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toUpperCase().regex(/^[A-Z]{1,5}$/).optional()),
  academicYear,
  exam: z.string().trim().min(1).max(60),
};

// Status per exam for a class, to show what is published.
router.get("/status", perm("results.manage"), validate(z.object({ school: objectId, className: classCode, section: where.section, academicYear }).strict(), "query"), h(async (req, res) => {
  const q = req.valid.query;
  if (!canTeach(req.user, q)) throw new ApiError(403, "You are not assigned to this class.");
  const ids = (await Student.find({ school: oid(q.school), className: q.className, ...(q.section ? { section: q.section } : {}), deletedAt: null }).select("_id").lean()).map((s) => s._id);
  const rows = await ExamResult.aggregate([
    { $match: { student: { $in: ids }, academicYear: q.academicYear } },
    { $group: { _id: "$exam", results: { $sum: 1 }, published: { $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] } } } },
    { $sort: { _id: 1 } },
  ]);
  sendSuccess(res, { message: "Result status", data: { students: ids.length, exams: rows.map((r) => ({ exam: r._id, results: r.results, published: r.published })) } });
}));

router.post("/publish", perm("results.publish"), validate(z.object({ ...where, publish: z.boolean().default(true) }).strict()), h(async (req, res) => {
  const b = req.valid.body;
  if (!canTeach(req.user, b)) throw new ApiError(403, "This class isn't in your school.");
  const students = await Student.find({ school: oid(b.school), className: b.className, ...(b.section ? { section: b.section } : {}), deletedAt: null }).select("_id").lean();
  const filter = { student: { $in: students.map((s) => s._id) }, academicYear: b.academicYear, exam: b.exam };
  const update = b.publish
    ? { $set: { status: "published", publishedAt: new Date(), publishedBy: req.user._id } }
    : { $set: { status: "draft" }, $unset: { publishedAt: 1, publishedBy: 1 } };
  const { modifiedCount, matchedCount } = await ExamResult.updateMany(filter, update);
  if (!matchedCount) throw ApiError.notFound("No marks have been entered for that exam yet.");
  let sent = 0;
  if (b.publish && modifiedCount) {
    const withResults = await ExamResult.find(filter).select("student").lean();
    const parents = await parentsOf(withResults.map((r) => r.student));
    sent = await notify(parents.map((p) => p._id), { type: "result", title: `${b.exam} results published`, body: "Open your child's Academics tab to see the marks.", link: "/" });
  }
  req.log.info({ event: b.publish ? "results.publish" : "results.unpublish", className: b.className, section: b.section, exam: b.exam, count: matchedCount }, "Results publishing");
  sendSuccess(res, { message: b.publish ? `${matchedCount} results published${sent ? `; ${sent} parents notified` : ""}.` : `${matchedCount} results moved back to draft.`, data: { results: matchedCount } });
}));

module.exports = router;
