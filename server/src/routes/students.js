const router = require("express").Router();
const c = require("../controllers/studentController");
const v = require("../validators/student");
const { validate, validateId } = require("../middleware/validate");
const { photoUpload } = require("../middleware/upload");
const h = require("../utils/asyncHandler");

// New applicants go through admissions (POST /api/admissions); this creates
// records for students who are already at the school.
router.get("/", validate(v.listStudents, "query"), h(c.list));
router.post("/", validate(v.createStudent), h(c.create));
router.get("/:id", validateId, h(c.get));
router.put("/:id", validateId, validate(v.updateStudent), h(c.update));
router.patch("/:id/status", validateId, validate(v.updateStatus), h(c.updateStatus));
router.delete("/:id", validateId, h(c.remove));

router.get("/:id/photo", validateId, h(c.getPhoto));
router.put("/:id/photo", validateId, photoUpload, h(c.uploadPhoto));
router.delete("/:id/photo", validateId, h(c.deletePhoto));

router.use("/:id", require("./records"));

module.exports = router;
