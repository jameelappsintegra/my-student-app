const router = require("express").Router();
const c = require("../controllers/studentController");
const v = require("../validators/student");
const { validate, validateId } = require("../middleware/validate");
const { photoUpload } = require("../middleware/upload");
const h = require("../utils/asyncHandler");
const { requirePermission: perm, requireStudentAccess: access } = require("../middleware/authorize");

// New applicants go through admissions (POST /api/admissions); this creates
// records for students who are already at the school.
const manage = perm("students.manage");

// Bulk CSV import (before /:id so "import" isn't read as an id).
const { fileUpload } = require("../middleware/upload");
const importer = require("../services/importService");
router.get("/import/template", perm("students.import"), (_req, res) => {
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="edupro-student-import-template.csv"' });
  res.send(importer.template());
});
router.post("/import", perm("students.import"), fileUpload, h(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Choose a CSV file (form field "file").' });
  const dryRun = req.query.dryRun !== "false";
  const result = await importer.importStudents(req.file.buffer, req.user, { dryRun });
  req.log.info({ event: "students.import", dryRun, rows: result.totalRows, errors: result.errors.length, imported: result.imported }, "Import");
  const status = !dryRun && result.errors.length ? 400 : !dryRun ? 201 : 200;
  const message = result.errors.length
    ? `${result.errors.length} problem${result.errors.length === 1 ? "" : "s"} found. Fix them and upload again; nothing was saved.`
    : dryRun
    ? `All ${result.totalRows} rows are ready to import.`
    : `${result.imported} students imported (${result.admissionNumbers.join(" to ")}).`;
  return res.status(status).json({ success: status < 400, message, data: result });
}));

router.get("/", perm("students.view"), validate(v.listStudents, "query"), h(c.list));
router.post("/", manage, validate(v.createStudent), h(c.create));
router.get("/:id", validateId, perm("students.view"), access, h(c.get));
router.put("/:id", validateId, manage, access, validate(v.updateStudent), h(c.update));
router.patch("/:id/status", validateId, manage, access, validate(v.updateStatus), h(c.updateStatus));
router.delete("/:id", validateId, manage, access, h(c.remove));

router.get("/:id/photo", validateId, perm("students.view"), access, h(c.getPhoto));
// Admins, the student's teachers and the student's parents can change it.
const photo = perm("students.photo");
router.put("/:id/photo", validateId, photo, access, photoUpload, h(c.uploadPhoto));
router.delete("/:id/photo", validateId, photo, access, h(c.deletePhoto));

router.use("/:id", require("./records"));

module.exports = router;
