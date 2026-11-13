const router = require("express").Router();
const c = require("../controllers/studentController");
const v = require("../validators/student");
const { validate, validateId } = require("../middleware/validate");
const h = require("../utils/asyncHandler");

// Students are created by enrolling an approved admission
// (POST /api/admissions/:id/enroll), not directly.
router.get("/", validate(v.listStudents, "query"), h(c.list));
router.get("/:id", validateId, h(c.get));
router.put("/:id", validateId, validate(v.updateStudent), h(c.update));
router.patch(
  "/:id/status",
  validateId,
  validate(v.updateStatus),
  h(c.updateStatus)
);
router.delete("/:id", validateId, h(c.remove));

module.exports = router;
