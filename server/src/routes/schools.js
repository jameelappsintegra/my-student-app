const router = require("express").Router();
const c = require("../controllers/schoolController");
const v = require("../validators/school");
const { validate, validateId } = require("../middleware/validate");
const h = require("../utils/asyncHandler");

router.get("/", validate(v.listSchools, "query"), h(c.list));
router.post("/", validate(v.createSchool), h(c.create));
router.get("/:id", validateId, h(c.get));
router.put("/:id", validateId, validate(v.updateSchool), h(c.update));
router.delete("/:id", validateId, h(c.remove));

module.exports = router;
