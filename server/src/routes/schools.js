const router = require("express").Router();
const c = require("../controllers/schoolController");
const v = require("../validators/school");
const { validate, validateId } = require("../middleware/validate");
const h = require("../utils/asyncHandler");
const { requirePermission: perm } = require("../middleware/authorize");
const manage = perm("schools.manage");

router.get("/", perm("schools.view"), validate(v.listSchools, "query"), h(c.list));
router.post("/", manage, validate(v.createSchool), h(c.create));
router.get("/:id", validateId, manage, h(c.get));
router.put("/:id", validateId, manage, validate(v.updateSchool), h(c.update));
router.delete("/:id", validateId, manage, h(c.remove));

module.exports = router;
