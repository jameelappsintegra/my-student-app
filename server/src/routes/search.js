const router = require("express").Router();
const Student = require("../models/Student");
const { studentPublic } = require("../models/Student");
const { searchFilter } = require("../utils/query");
const { toPublic } = require("../utils/serialize");
const { validate } = require("../middleware/validate");
const v = require("../validators/records");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

// Global search box: quick name / admission-number matches across schools.
router.get("/", validate(v.search, "query"), h(async (req, res) => {
  const { q, limit } = req.valid.query;
  const items = await Student.find({ deletedAt: null, ...searchFilter(q) })
    .select("admissionNumber firstName middleName lastName className section school status photo")
    .populate("school", "name code")
    .sort({ lastName: 1, firstName: 1 })
    .limit(limit)
    .lean();
  sendSuccess(res, { message: "Search results", data: items.map((s) => studentPublic(toPublic(s))) });
}));

module.exports = router;
