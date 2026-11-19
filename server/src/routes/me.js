// The signed-in teacher's classes and parent's children.
const router = require("express").Router();
const Student = require("../models/Student");
const { studentPublic } = require("../models/Student");
const School = require("../models/School");
const Attendance = require("../models/Attendance");
const records = require("../services/recordsService");
const { toPublic } = require("../utils/serialize");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const { photoUpload } = require("../middleware/upload");
const userPhotos = require("../services/userPhotoService");

// Everyone can set or remove their own profile photo.
router.put("/photo", photoUpload, h(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Choose a photo to upload (form field "photo").' });
  const user = await userPhotos.setUserPhoto(req.user._id, req.file.buffer);
  req.log.info({ event: "user.photo.set", userId: user.id }, "Profile photo updated");
  return sendSuccess(res, { message: "Your photo was updated", data: user });
}));
router.delete("/photo", h(async (req, res) => {
  const user = await userPhotos.removeUserPhoto(req.user._id);
  sendSuccess(res, { message: "Your photo was removed", data: user });
}));

const today = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

router.get("/classes", h(async (req, res) => {
  const list = req.user.role === "teacher" ? req.user.assignments || [] : [];
  const schools = await School.find({ _id: { $in: list.map((a) => a.school) } }).select("name code").lean();
  const byId = new Map(schools.map((s) => [String(s._id), s]));
  const data = await Promise.all(
    list.map(async (a) => {
      const filter = { school: a.school, className: a.className, deletedAt: null, status: "active", ...(a.section ? { section: a.section } : {}) };
      const ids = (await Student.find(filter).select("_id").lean()).map((s) => s._id);
      const marked = await Attendance.countDocuments({ student: { $in: ids }, date: today() });
      const s = byId.get(String(a.school));
      return { school: { id: String(a.school), name: s?.name, code: s?.code }, className: a.className, section: a.section || null, students: ids.length, markedToday: marked };
    })
  );
  sendSuccess(res, { message: "Your classes", data });
}));

router.get("/shared", h(async (req, res) => {
  const AccessShare = require("../models/AccessShare");
  const rows = await AccessShare.find({ requester: req.user._id, status: "approved", expiresAt: { $gt: new Date() } })
    .populate({ path: "student", match: { deletedAt: null }, select: "admissionNumber firstName lastName className section photo school", populate: { path: "school", select: "name code" } })
    .sort({ expiresAt: 1 })
    .lean();
  const data = rows.filter((r) => r.student).map((r) => ({
    ...studentPublic(toPublic(r.student)),
    shareId: String(r._id),
    scopes: r.scopes,
    expiresAt: r.expiresAt,
  }));
  sendSuccess(res, { message: "Shared with you", data });
}));

router.get("/children", h(async (req, res) => {
  const ids = req.user.role === "parent" ? req.user.children || [] : [];
  const kids = await Student.find({ _id: { $in: ids }, deletedAt: null })
    .select("admissionNumber firstName middleName lastName className section rollNumber school photo status")
    .populate("school", "name code")
    .lean();
  const data = await Promise.all(
    kids.map(async (k) => {
      const [attendance, results, fees] = await Promise.all([
        records.getAttendance(k._id, {}),
        records.listResults(k._id),
        records.listFees(k._id),
      ]);
      return {
        ...studentPublic(toPublic(k)),
        attendance: attendance.summary,
        latestResult: results[0] ? { exam: results[0].exam, percentage: results[0].percentage, grade: results[0].grade } : null,
        fees: fees.summary,
      };
    })
  );
  sendSuccess(res, { message: "Your children", data });
}));

module.exports = router;
