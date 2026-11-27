const router = require("express").Router();
const c = require("../controllers/admissionController");
const v = require("../validators/admission");
const { validate, validateId } = require("../middleware/validate");
const h = require("../utils/asyncHandler");

router.get("/", validate(v.listAdmissions, "query"), h(c.list));
router.post("/", validate(v.createAdmission), h(c.create));
router.get("/:id", validateId, h(c.get));
router.patch(
  "/:id/status",
  validateId,
  validate(v.updateStatus),
  h(c.updateStatus)
);
router.post("/:id/enroll", validateId, validate(v.enroll), h(c.enroll));

module.exports = router;
