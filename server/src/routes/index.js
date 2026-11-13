const router = require("express").Router();
const mongoose = require("mongoose");
const { CLASSES } = require("../constants");
const { summary } = require("../controllers/dashboardController");
const h = require("../utils/asyncHandler");

router.get("/health", (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({
    success: dbUp,
    message: dbUp ? "OK" : "Database unavailable",
  });
});

router.get("/meta/classes", (_req, res) => {
  res.json({ success: true, message: "Classes", data: CLASSES });
});

router.get("/dashboard", h(summary));
router.use("/admissions", require("./admissions"));
router.use("/students", require("./students"));

module.exports = router;
