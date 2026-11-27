const router = require("express").Router();
const { z } = require("zod");
const Homework = require("../models/Homework");
const Student = require("../models/Student");
const HomeworkSubmission = require("../models/HomeworkSubmission");
const { getSettings, todayIn } = require("../services/schoolSettings");
const { validate, validateId } = require("../middleware/validate");
const { requirePermission: perm, canTeach, schoolIds, familyIds, isFamily } = require("../middleware/authorize");
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
  const data = rows.map((x) => ({ ...toPublic(x), author: x.author?.name, school: x.school ? { id: String(x.school._id), name: x.school.name, code: x.school.code } : null }));
  const ids = rows.map((x) => x._id);
  if (isFamily(req.user)) {
    // Each child's own submission, so parents and students see what's due.
    const kids = familyIds(req.user);
    const subs = await HomeworkSubmission.find({ homework: { $in: ids }, student: { $in: kids.map(oid) } }).lean();
    const byHw = new Map();
    for (const sub of subs) byHw.set(String(sub.homework), [...(byHw.get(String(sub.homework)) || []), toPublic(sub)]);
    for (const d of data) d.submissions = byHw.get(d.id) || [];
  } else if (ids.length) {
    const counts = await HomeworkSubmission.aggregate([{ $match: { homework: { $in: ids } } }, { $group: { _id: "$homework", submitted: { $sum: 1 }, graded: { $sum: { $cond: [{ $eq: ["$status", "graded"] }, 1, 0] } } } }]);
    const byHw = new Map(counts.map((c) => [String(c._id), c]));
    for (const d of data) d.submissionCounts = { submitted: byHw.get(d.id)?.submitted || 0, graded: byHw.get(d.id)?.graded || 0 };
  }
  sendSuccess(res, { message: "Homework", data });
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
    maxMarks: z.coerce.number().int().min(1).max(1000).optional(),
    onlineSubmission: z.boolean().optional(),
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

// ---------- Submissions ----------
const loadHomework = async (id) => {
  const hw = await Homework.findById(id).lean();
  if (!hw) throw ApiError.notFound("Homework not found");
  return hw;
};
const inClass = (hw, k) => String(k.school) === String(hw.school) && k.className === hw.className && (!hw.section || k.section === hw.section);

// A student hands in (or re-submits) their work.
router.put(
  "/:id/submission",
  validateId,
  perm("homework.submit"),
  validate(z.object({
    text: z.string().trim().max(8000).optional(),
    link: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().url("Enter a full link starting with https://").max(500).refine((u) => /^https?:\/\//i.test(u), "Links must start with http:// or https://").optional()),
  }).strict().refine((d) => d.text || d.link, "Write your answer or add a link")),
  h(async (req, res) => {
    const hw = await loadHomework(req.params.id);
    const student = await Student.findOne({ _id: req.user.student, deletedAt: null }).select("school className section").lean();
    if (!student || !inClass(hw, student)) throw ApiError.notFound("Homework not found");
    if (!hw.onlineSubmission) throw ApiError.badRequest("This homework is handed in on paper, not online.");
    const existing = await HomeworkSubmission.findOne({ homework: hw._id, student: student._id });
    if (existing?.status === "graded") throw ApiError.conflict("Your teacher has already marked this. Ask them to return it if you need to change it.");
    const now = new Date();
    // Late = after the due date in the school's own time zone.
    const settings = await getSettings(hw.school);
    const late = todayIn(settings.timezone, now) > new Date(hw.dueDate).toISOString().slice(0, 10);
    if (late && !settings.homework.allowLate) throw ApiError.badRequest("The due date has passed and this school doesn't accept late work.");
    const b = req.valid.body;
    const sub = existing || new HomeworkSubmission({ homework: hw._id, student: student._id, school: hw.school });
    sub.set({ text: b.text, link: b.link, submittedBy: req.user._id, submittedAt: now, late, status: "submitted" });
    await sub.save();
    await notify([hw.author], { type: "homework", title: `Submitted: ${hw.title}`, body: `${req.user.name || "A student"} handed in ${hw.subject} homework${late ? " (late)" : ""}.`, link: `/homework?review=${hw._id}` });
    req.log.info({ event: "homework.submit", homeworkId: String(hw._id), studentId: String(student._id), late }, "Homework submitted");
    sendSuccess(res, { status: existing ? 200 : 201, message: late ? "Handed in (after the due date)." : "Handed in. Your teacher will see it.", data: sub });
  })
);

// Class roster with each student's submission, for the teacher.
router.get("/:id/submissions", validateId, perm("homework.manage"), h(async (req, res) => {
  const hw = await loadHomework(req.params.id);
  if (!canTeach(req.user, { school: hw.school, className: hw.className, section: hw.section || "" }) && String(hw.author) !== String(req.user._id)) throw ApiError.notFound("Homework not found");
  const kids = await Student.find({ school: hw.school, className: hw.className, ...(hw.section ? { section: hw.section } : {}), deletedAt: null, status: "active" })
    .select("firstName lastName rollNumber section admissionNumber").sort({ section: 1, rollNumber: 1, firstName: 1 }).lean();
  const subs = await HomeworkSubmission.find({ homework: hw._id }).lean();
  const byStudent = new Map(subs.map((x) => [String(x.student), toPublic(x)]));
  const rows = kids.map((k) => ({ student: { id: String(k._id), name: `${k.firstName} ${k.lastName}`, rollNumber: k.rollNumber, section: k.section, admissionNumber: k.admissionNumber }, submission: byStudent.get(String(k._id)) || null }));
  const summary = { students: kids.length, submitted: subs.length, late: subs.filter((x) => x.late).length, graded: subs.filter((x) => x.status === "graded").length, missing: kids.length - rows.filter((r) => r.submission).length };
  sendSuccess(res, { message: "Submissions", data: { homework: toPublic(hw), summary, rows } });
}));

// Mark a submission, or return it for a redo.
router.post(
  "/:id/submissions/:subId/review",
  validateId,
  perm("homework.manage"),
  validate(z.object({ action: z.enum(["grade", "return"]), marks: z.coerce.number().min(0).max(1000).optional(), feedback: z.string().trim().max(2000).optional() }).strict()),
  h(async (req, res) => {
    if (!/^[a-f0-9]{24}$/i.test(req.params.subId)) throw ApiError.badRequest("Invalid id");
    const hw = await loadHomework(req.params.id);
    if (!canTeach(req.user, { school: hw.school, className: hw.className, section: hw.section || "" }) && String(hw.author) !== String(req.user._id)) throw ApiError.notFound("Homework not found");
    const sub = await HomeworkSubmission.findOne({ _id: req.params.subId, homework: hw._id });
    if (!sub) throw ApiError.notFound("Submission not found");
    const b = req.valid.body;
    if (b.action === "grade" && hw.maxMarks && b.marks === undefined) throw ApiError.badRequest(`Enter marks out of ${hw.maxMarks}.`);
    if (b.marks !== undefined && hw.maxMarks && b.marks > hw.maxMarks) throw ApiError.badRequest(`Marks can't be more than ${hw.maxMarks}.`);
    if (b.action === "return" && !b.feedback) throw ApiError.badRequest("Tell the student what to change.");
    sub.set({ status: b.action === "grade" ? "graded" : "returned", marks: b.action === "grade" ? b.marks : undefined, feedback: b.feedback, gradedBy: req.user._id, gradedAt: new Date() });
    await sub.save();
    const family = await parentsOf([sub.student]);
    await notify(family.map((u) => u._id), {
      type: "homework",
      title: b.action === "grade" ? `Marked: ${hw.title}` : `Returned for changes: ${hw.title}`,
      body: b.action === "grade" ? `${b.marks !== undefined ? `${b.marks}${hw.maxMarks ? `/${hw.maxMarks}` : ""}. ` : ""}${b.feedback || ""}`.trim() : b.feedback,
      link: "/homework",
    });
    req.log.info({ event: `homework.${b.action}`, homeworkId: String(hw._id), submissionId: sub.id }, "Submission reviewed");
    sendSuccess(res, { message: b.action === "grade" ? "Marked. The student and parents can see it." : "Returned to the student.", data: sub });
  })
);

module.exports = router;
