const express = require("express");
const { CLASSES } = require("../constants");
const { summary } = require("../controllers/dashboardController");
const h = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

function apiRouter(options = {}) {
  const router = express.Router();
  // Public routes.
  router.use(require("./health"));
  router.use("/auth", require("./auth")(options));

  router.get("/meta/classes", (_req, res) => {
    res.json({ success: true, message: "Classes", data: CLASSES });
  });

  // Everything below requires a signed-in user.
  router.use(requireAuth);
  router.get("/dashboard", h(summary));
  router.use("/admissions", require("./admissions"));
  router.use("/students", require("./students"));
router.use("/schools", require("./schools"));
router.use("/search", require("./search"));

  return router;
}

module.exports = apiRouter;
