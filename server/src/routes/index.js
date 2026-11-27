const express = require("express");
const { CLASSES } = require("../constants");
const { summary } = require("../controllers/dashboardController");
const h = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { requirePermission: perm } = require("../middleware/authorize");

function apiRouter(options = {}) {
  const router = express.Router();
  // Public routes.
  router.use(require("./health"));
  router.use("/auth", require("./auth")(options));
  router.use(require("./certificates").verifyRouter);

  router.get("/meta/classes", (_req, res) => {
    res.json({ success: true, message: "Classes", data: CLASSES });
  });

  // Everything below requires a signed-in user.
  router.use(requireAuth);
  router.use("/me", require("./me"));
  router.get("/dashboard", perm("dashboard.view"), h(summary));
  router.use("/admissions", perm("admissions.manage"), require("./admissions"));
  router.use("/students", require("./students"));
router.use("/schools", require("./schools"));
router.use("/search", perm("students.search"), require("./search"));
router.use("/attendance", perm("attendance.mark"), require("./attendance"));
router.use("/reports", perm("reports.view"), require("./reports"));
// Profile photos are viewable by any signed-in user (with limits, see
// userPhotoService); everything else under /users is admin-only.
router.get("/users/:id/photo", h(async (req, res, next) => {
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ success: false, message: "Invalid id" });
  const photo = await require("../services/userPhotoService").viewablePhoto(req.user, req.params.id);
  return require("../services/photoService").sendPhoto(req, res, next, photo, "userPhotos");
}));
router.use("/users", perm("users.manage"), require("./users"));
router.use("/shares", require("./shares"));
router.use("/notifications", require("./notifications"));
router.use("/announcements", require("./announcements"));
router.use("/homework", require("./homework"));
router.use("/timetable", require("./timetable"));
router.use("/leave", require("./leave"));
router.use("/results", require("./results"));
router.use("/audit", perm("audit.view"), require("./audit"));
router.use("/promotion", perm("students.promote"), require("./promotion"));
router.use("/identity", require("./identity"));
router.use("/transport", require("./transport"));
router.use("/insights", perm("reports.view"), require("./insights"));
router.use("/library", require("./library"));
router.use("/certificates", require("./certificates"));

  return router;
}

module.exports = apiRouter;
