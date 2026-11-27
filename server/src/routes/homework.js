const router = require("express").Router();
const { z } = require("zod");
const Homework = require("../models/Homework");
const Student = require("../models/Student");
const { validate, validateId } = require("../middleware/validate");
const { requirePermission: perm, canTeach, schoolIds } = require("../middleware/authorize");
const { objectId, classCode } = require("../validators/common");
const { classFilter, oid } = require("../services/classScope");
const { notify, parentsOf } = require("../services/notificationService");
const ApiError = require("../utils/ApiError");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const { toPublic } = require("../utils/serialize");

const section = z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toUpperCase().regex(/^[A-Z]{1,5}$/).optional());

router.get("/", validate(z.object({ school: objectId.optional(), className: classCode.optional(), section, upcoming: z.enum(["true", "false"]).optional() }).strict(), "query"), h(async (req, res) => {
  const q = req.valid.query;
  const scope = await classFilter(req.user);
  const filter = { ...(q.school ? { school: oid(q.school) } : {}), ...(q.className ? { className: q.className } : {}), ...(q.section ? { section: { $in: [q.section, "", null] } } : {}) };
  if (q.upcoming === "true") filter.dueDate = { $gte: new Date(Date.now() - 86400000) };
  const rows = await Homework.find(scope ? { $and: [filter, scope] } : filter)
    .sort({ dueDate: -1 })
    .limit(200)
    .populate("author", "name")
    .populate("school", "name code")
    .lean();
  sendSuccess(res, { message: "Homework", data: rows.map((x) => ({ ...toPublic(x), author: x.author?.name, school: x.school ? { id: String(x.school._id), name: x.school.name, code: x.school.code } : null })) });
}));

router.post(
  "/",
  perm("homework.manage"),
  validate(z.object({
    school: objectId,
    className: classCode,
    section,
    subject: z.string().trim().min(1, "Enter the subject").max(60),
    title: z.string().trim().min(3, "Enter a title").max(160),
    details: z.string().trim().max(4000).optional(),
    dueDate: z.coerce.date({ invalid_type_error: "Enter a due date" }),
  }).strict()),
  h(async (req, res) => {
    const b = req.valid.body;
    if (!canTeach(req.user, b)) throw new ApiError(403, "You are not assigned to this class.");
    const hw = await Homework.create({ ...b, author: req.user._id });
    const kids = await Student.find({ school: oid(b.school), className: b.className, ...(b.section ? { section: b.section } : {}), deletedAt: null, status: "active" }).select("_id").lean();
    const parents = await parentsOf(kids.map((k) => k._id));
    await notify(parents.map((p) => p._id), { type: "homework", title: `Homework: ${b.subject}`, body: `${b.title} (due ${b.dueDate.toISOString().slice(0, 10)})`, link: "/homework" });
    req.log.info({ event: "homework.create", homeworkId: hw.id, className: b.className, section: b.section }, "Homework posted");
    sendSuccess(res, { status: 201, message: `Homework posted to ${kids.length} students' parents.`, data: hw });
  })
);

router.delete("/:id", validateId, perm("homework.manage"), h(async (req, res) => {
  const hw = await Homework.findById(req.params.id);
  const allowed = schoolIds(req.user);
  const mine = hw && String(hw.author) === String(req.user._id);
  if (!hw || (!mine && allowed && !(req.user.role === "principal" && allowed.includes(String(hw.school))))) throw ApiError.notFound("Homework not found");
  await hw.deleteOne();
  req.log.info({ event: "homework.delete", homeworkId: req.params.id }, "Homework deleted");
  sendSuccess(res, { message: "Homework deleted" });
}));

module.exports = router;
