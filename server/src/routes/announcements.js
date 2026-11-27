const router = require("express").Router();
const { z } = require("zod");
const Announcement = require("../models/Announcement");
const Student = require("../models/Student");
const User = require("../models/User");
const { validate, validateId } = require("../middleware/validate");
const { requirePermission: perm, schoolIds } = require("../middleware/authorize");
const { objectId, classCode, optionalText } = require("../validators/common");
const { notify, parentsOf } = require("../services/notificationService");
const { oid } = require("../services/classScope");
const ApiError = require("../utils/ApiError");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const { toPublic } = require("../utils/serialize");

async function visibleFilter(user) {
  const now = new Date();
  const base = { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] };
  if (user.role === "admin") return base;
  let schools;
  let classes = null;
  let audiences;
  if (user.role === "parent") {
    const kids = await Student.find({ _id: { $in: (user.children || []).map(oid) } }).select("school className").lean();
    schools = kids.map((k) => k.school);
    classes = kids.map((k) => k.className);
    audiences = ["everyone", "parents"];
  } else {
    schools = (schoolIds(user) || []).map(oid);
    if (user.role === "teacher") classes = (user.assignments || []).map((a) => a.className);
    audiences = ["everyone", "staff"];
  }
  return {
    $and: [
      base,
      { audience: { $in: audiences } },
      { $or: [{ school: null }, { school: { $exists: false } }, { school: { $in: schools } }] },
      classes ? { $or: [{ className: null }, { className: { $exists: false } }, { className: { $in: classes } }] } : {},
    ],
  };
}

router.get("/", h(async (req, res) => {
  const rows = await Announcement.find(await visibleFilter(req.user))
    .sort({ pinned: -1, createdAt: -1 })
    .limit(100)
    .populate("author", "name role")
    .populate("school", "name code")
    .lean();
  sendSuccess(res, {
    message: "Announcements",
    data: rows.map((a) => ({ ...toPublic(a), author: a.author ? { name: a.author.name, role: a.author.role } : null, school: a.school ? { id: String(a.school._id), name: a.school.name } : null })),
  });
}));

router.post(
  "/",
  perm("announcements.manage"),
  validate(z.object({
    title: z.string().trim().min(3, "Enter a title").max(160),
    body: z.string().trim().min(1, "Write the announcement").max(4000),
    school: objectId.optional(),
    className: classCode.optional(),
    audience: z.enum(Announcement.AUDIENCES).default("everyone"),
    pinned: z.boolean().optional(),
    eventDate: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
    notify: z.boolean().default(true),
  }).strict()),
  h(async (req, res) => {
    const b = req.valid.body;
    const allowed = schoolIds(req.user);
    if (allowed && (!b.school || !allowed.includes(b.school))) throw new ApiError(403, "Choose one of your own schools.");
    const { notify: send, ...doc } = b;
    const a = await Announcement.create({ ...doc, author: req.user._id });
    let sent = 0;
    if (send) {
      const studentFilter = { deletedAt: null, status: "active", ...(b.school ? { school: oid(b.school) } : {}), ...(b.className ? { className: b.className } : {}) };
      const users = [];
      if (b.audience !== "staff") {
        const kids = await Student.find(studentFilter).select("_id").lean();
        users.push(...(await parentsOf(kids.map((k) => k._id))).map((p) => p._id));
      }
      if (b.audience !== "parents") {
        const staffFilter = b.school
          ? { active: true, $or: [{ role: "principal", schools: oid(b.school) }, { role: "teacher", "assignments.school": oid(b.school) }, { role: "admin" }] }
          : { active: true, role: { $in: ["admin", "principal", "teacher"] } };
        users.push(...(await User.find(staffFilter).select("_id").lean()).map((u) => u._id));
      }
      sent = await notify(users.filter((u) => String(u) !== String(req.user._id)), { type: "announcement", title: b.title, body: b.body.slice(0, 300), link: "/announcements" });
    }
    req.log.info({ event: "announcement.create", announcementId: a.id, school: b.school, notified: sent }, "Announcement posted");
    sendSuccess(res, { status: 201, message: `Announcement posted${sent ? ` and sent to ${sent} people` : ""}.`, data: a });
  })
);

router.delete("/:id", validateId, perm("announcements.manage"), h(async (req, res) => {
  const a = await Announcement.findById(req.params.id);
  const allowed = schoolIds(req.user);
  if (!a || (allowed && !allowed.includes(String(a.school)))) throw ApiError.notFound("Announcement not found");
  await a.deleteOne();
  req.log.info({ event: "announcement.delete", announcementId: req.params.id }, "Announcement deleted");
  sendSuccess(res, { message: "Announcement deleted" });
}));

module.exports = router;
