const router = require("express").Router();
const { fileUpload } = require("../middleware/upload");
const { parseOfflineKyc } = require("../services/aadhaarService");
const { can } = require("../constants/permissions");
const ApiError = require("../utils/ApiError");
const { sendSuccess } = require("../utils/response");

// Pre-fill an admission or new student from an Aadhaar Offline e-KYC file.
// Nothing from the file is stored.
router.post("/aadhaar-offline", (req, _res, next) =>
  can(req.user, "admissions.manage") || can(req.user, "students.manage") || can(req.user, "students.import")
    ? next()
    : next(new ApiError(403, "You don't have permission to do that.")),
fileUpload, (req, res, next) => {
  try {
    if (!req.file) throw ApiError.badRequest('Choose the Aadhaar ZIP file (form field "file").');
    const data = parseOfflineKyc(req.file.buffer, String(req.body.shareCode || "").trim());
    // Log only that it happened, never the contents.
    req.log.info({ event: "identity.aadhaar_offline", verified: data.verified }, "Aadhaar offline e-KYC read");
    res.set("Cache-Control", "no-store");
    sendSuccess(res, { message: "Details read from Aadhaar", data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
