const router = require("express").Router();
const { z } = require("zod");
const TimetableEntry = require("../models/TimetableEntry");
const User = require("../models/User");
const { validate } = require("../middleware/validate");
const { requirePermission: perm, schoolIds } = require("../middleware/authorize");
const { objectId, classCode } = require("../validators/common");
const { classFilter, oid } = require("../services/classScope");
const ApiError = require("../utils/ApiError");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const { toPublic } = require("../utils/serialize");

const section = z.preprocess((v) => (v === undefined || v === null ? "" : v), z.string().trim().toUpperCase().regex(/^[A-Z]{0,5}$/));
const slot = { school: objectId, className: classCode, section, day: z.coerce.number().int().min(1).max(6), period: z.coerce.number().int().min(1).max(12) };
const present = (e) => ({ ...toPublic(e), teacher: e.teacher ? { id: String(e.teacher._id), name: e.teacher.name } : null });

// A class's week. Anyone who can see the class (staff of it, its parents).
router.get("/", validate(z.object({ school: objectId, className: classCode, section }).strict(), "query"), h(async (req, res) => {
  const q = req.valid.query;
  const scope = await classFilter(req.user);
  const filter = { school: oid(q.school), className: q.className, section: { $in: [q.section, ""] } };
  const rows = await TimetableEntry.find(scope ? { $and: [filter, scope] } : filter).populate("teacher", "name").sort({ day: 1, period: 1 }).lean();
  sendSuccess(res, { message: "Timetable", data: rows.map(present) });
}));

// The signed-in teacher's own week across classes.
router.get("/mine", h(async (req, res) => {
  const rows = await TimetableEntry.find({ teacher: req.user._id }).populate("teacher", "name").populate("school", "name code").sort({ day: 1, period: 1 }).lean();
  sendSuccess(res, { message: "Your timetable", data: rows.map((e) => ({ ...present(e), school: e.school ? { id: String(e.school._id), code: e.school.code } : null })) });
}));

router.put(
  "/slot",
  perm("timetable.manage"),
  validate(z.object({ ...slot, subject: z.string().trim().min(1, "Enter the subject").max(60), teacher: objectId.optional(), room: z.string().trim().max(30).optional() }).strict()),
  h(async (req, res) => {
    const b = req.valid.body;
    const allowed = schoolIds(req.user);
    if (allowed && !allowed.includes(b.school)) throw new ApiError(403, "Choose one of your own schools.");
    if (b.teacher && !(await User.exists({ _id: b.teacher, role: "teacher", active: true }))) {
      throw ApiError.badRequest("Validation failed", [{ field: "teacher", message: "Choose an active teacher" }]);
    }
    const key = { school: oid(b.school), className: b.className, section: b.section, day: b.day, period: b.period };
    // Clear, specific clash messages before the unique indexes catch races.
    if (b.teacher) {
      const busy = await TimetableEntry.findOne({ teacher: oid(b.teacher), day: b.day, period: b.period, $nor: [key] }).lean();
      if (busy) throw ApiError.conflict(`That teacher already has Class ${busy.className}${busy.section ? ` ${busy.section}` : ""} in this period.`);
    }
    if (b.room) {
      const used = await TimetableEntry.findOne({ school: oid(b.school), room: b.room, day: b.day, period: b.period, $nor: [key] }).lean();
      if (used) throw ApiError.conflict(`Room ${b.room} is already used by Class ${used.className}${used.section ? ` ${used.section}` : ""} in this period.`);
    }
    const update = { subject: b.subject, ...(b.teacher ? { teacher: oid(b.teacher) } : {}), ...(b.room ? { room: b.room } : {}) };
    const unset = { ...(b.teacher ? {} : { teacher: 1 }), ...(b.room ? {} : { room: 1 }) };
    try {
      const e = await TimetableEntry.findOneAndUpdate(key, { $set: { ...key, ...update }, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { upsert: true, new: true, runValidators: true }).populate("teacher", "name");
      req.log.info({ event: "timetable.set", className: b.className, section: b.section, day: b.day, period: b.period }, "Timetable slot set");
      sendSuccess(res, { message: "Period saved", data: present(e.toObject()) });
    } catch (err) {
      if (err.code === 11000) throw ApiError.conflict("That teacher or room is already booked in this period.");
      throw err;
    }
  })
);

router.delete("/slot", perm("timetable.manage"), validate(z.object(slot).strict(), "query"), h(async (req, res) => {
  const q = req.valid.query;
  const allowed = schoolIds(req.user);
  if (allowed && !allowed.includes(q.school)) throw new ApiError(403, "Choose one of your own schools.");
  const { deletedCount } = await TimetableEntry.deleteOne({ school: oid(q.school), className: q.className, section: q.section, day: q.day, period: q.period });
  if (!deletedCount) throw ApiError.notFound("Nothing is set for that period");
  sendSuccess(res, { message: "Period cleared" });
}));

module.exports = router;
