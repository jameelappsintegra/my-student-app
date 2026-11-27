// Per-school settings and the school calendar. Mounted at /api/schools/:id.
const router = require("express").Router({ mergeParams: true });
const { z } = require("zod");
const School = require("../models/School");
const Announcement = require("../models/Announcement");
const Homework = require("../models/Homework");
const { validate, validateId } = require("../middleware/validate");
const { requirePermission: perm } = require("../middleware/authorize");
const { inSchool } = require("../services/schoolAccess");
const { visibleSchoolIds, classFilter, oid } = require("../services/classScope");
const { resolve, isValidTimezone, DEFAULTS } = require("../services/schoolSettings");
const ApiError = require("../utils/ApiError");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-25").refine((s) => new Date(`${s}T00:00:00.000Z`).toISOString().slice(0, 10) === s, "That date doesn't exist");
const settingsBody = z.object({
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code like INR or USD").refine((c) => { try { new Intl.NumberFormat("en", { style: "currency", currency: c }); return true; } catch { return false; } }, "Unknown currency").optional(),
  locale: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Use a locale like en-IN").optional(),
  timezone: z.string().trim().refine(isValidTimezone, "Unknown time zone (use a name like Asia/Kolkata)").optional(),
  academicYearStartMonth: z.coerce.number().int().min(1).max(12).optional(),
  weeklyOffs: z.array(z.coerce.number().int().min(0).max(6)).max(3, "At most 3 weekly off days").optional(),
  passPercentage: z.coerce.number().min(0).max(100).optional(),
  gradingScale: z.array(z.object({ min: z.coerce.number().min(0).max(100), grade: z.string().trim().min(1, "Name the grade").max(20), remark: z.string().trim().max(40).optional() }).strict()).min(2, "Add at least two grades").max(15).optional()
    .superRefine((v, ctx) => {
      if (!v) return;
      if (!v.some((b) => b.min === 0)) ctx.addIssue({ code: "custom", message: "One grade must start at 0%" });
      if (new Set(v.map((b) => b.min)).size !== v.length) ctx.addIssue({ code: "custom", message: "Two grades start at the same percentage" });
      if (new Set(v.map((b) => b.grade)).size !== v.length) ctx.addIssue({ code: "custom", message: "Each grade needs a different name" });
    }),
  terms: z.array(z.object({ name: z.string().trim().min(1).max(40), start: isoDay, end: isoDay }).strict().refine((t) => t.end >= t.start, "A term must end after it starts")).max(6).optional(),
  holidays: z.array(z.object({ date: isoDay, name: z.string().trim().min(1, "Name the holiday").max(80) }).strict()).max(120).optional()
    .refine((v) => !v || new Set(v.map((x) => x.date)).size === v.length, "A date is listed twice"),
  library: z.object({ finePerDay: z.coerce.number().min(0).max(1000).optional(), loanDays: z.coerce.number().int().min(1).max(90).optional(), maxBooks: z.coerce.number().int().min(1).max(20).optional() }).strict().optional(),
  homework: z.object({ allowLate: z.boolean().optional() }).strict().optional(),
}).strict();

async function canSee(user, id) {
  const ids = await visibleSchoolIds(user);
  return ids === null || ids.includes(String(id));
}

router.get("/settings", validateId, h(async (req, res) => {
  if (!(await canSee(req.user, req.params.id))) throw ApiError.notFound("School not found");
  const school = await School.findById(req.params.id).select("name code settings").lean();
  if (!school) throw ApiError.notFound("School not found");
  sendSuccess(res, { message: "Settings", data: { school: { id: String(school._id), name: school.name, code: school.code }, settings: resolve(school.settings), defaults: DEFAULTS } });
}));

router.put("/settings", validateId, perm("settings.manage"), validate(settingsBody), h(async (req, res) => {
  if (!inSchool(req.user, req.params.id)) throw ApiError.notFound("School not found");
  const school = await School.findById(req.params.id);
  if (!school) throw ApiError.notFound("School not found");
  const b = req.valid.body;
  const toDate = (s) => new Date(`${s}T00:00:00.000Z`);
  const next = { ...(school.settings?.toObject?.() || {}) };
  for (const [k, v] of Object.entries(b)) {
    if (k === "terms") next.terms = v.map((t) => ({ name: t.name, start: toDate(t.start), end: toDate(t.end) }));
    else if (k === "holidays") next.holidays = v.map((x) => ({ date: toDate(x.date), name: x.name }));
    else if (k === "library" || k === "homework") next[k] = { ...(next[k] || {}), ...v };
    else next[k] = v;
  }
  school.settings = next;
  await school.save();
  req.log.info({ event: "school.settings.update", schoolId: school.id, fields: Object.keys(b) }, "School settings updated");
  sendSuccess(res, { message: `${school.name} settings saved`, data: { settings: resolve(school.settings) } });
}));

// Holidays, terms, events and homework due dates in a range.
router.get("/calendar", validateId, validate(z.object({ from: isoDay.optional(), to: isoDay.optional() }).strict(), "query"), h(async (req, res) => {
  if (!(await canSee(req.user, req.params.id))) throw ApiError.notFound("School not found");
  const school = await School.findById(req.params.id).select("name settings").lean();
  if (!school) throw ApiError.notFound("School not found");
  const s = resolve(school.settings);
  const now = new Date();
  const from = req.valid.query.from || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const to = req.valid.query.to || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  if (to < from) throw ApiError.badRequest("The end date must be after the start date.");
  if ((new Date(to) - new Date(from)) / 86400000 > 400) throw ApiError.badRequest("Choose a range of at most 400 days");
  const range = { $gte: new Date(`${from}T00:00:00.000Z`), $lte: new Date(`${to}T23:59:59.999Z`) };
  const sid = oid(req.params.id);
  const events = await Announcement.find({ eventDate: range, $or: [{ school: sid }, { school: null }, { school: { $exists: false } }] }).select("title eventDate audience className").lean();
  const scope = await classFilter(req.user);
  const hwFilter = { school: sid, dueDate: range };
  const homework = await Homework.find(scope ? { $and: [hwFilter, scope] } : hwFilter).select("title subject className section dueDate").limit(300).lean();
  const audienceOk = (a) => a.audience === "everyone" || (["parent"].includes(req.user.role) ? a.audience === "parents" : req.user.role === "student" ? a.audience === "students" : a.audience === "staff");
  sendSuccess(res, {
    message: "Calendar",
    data: {
      school: { id: req.params.id, name: school.name },
      from,
      to,
      weeklyOffs: s.weeklyOffs,
      terms: s.terms.filter((t) => t.end >= from && t.start <= to),
      holidays: s.holidays.filter((x) => x.date >= from && x.date <= to),
      events: events.filter(audienceOk).map((e) => ({ id: String(e._id), title: e.title, date: e.eventDate.toISOString().slice(0, 10) })),
      homework: homework.map((x) => ({ id: String(x._id), title: x.title, subject: x.subject, className: x.className, section: x.section, date: x.dueDate.toISOString().slice(0, 10) })),
    },
  });
}));

module.exports = router;
