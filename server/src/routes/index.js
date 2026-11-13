const router = require("express").Router();
const { CLASSES } = require("../constants");
const { summary } = require("../controllers/dashboardController");
const h = require("../utils/asyncHandler");

router.use(require("./health"));

router.get("/meta/classes", (_req, res) => {
  res.json({ success: true, message: "Classes", data: CLASSES });
});

router.get("/dashboard", h(summary));
router.use("/admissions", require("./admissions"));
router.use("/students", require("./students"));

module.exports = router;
