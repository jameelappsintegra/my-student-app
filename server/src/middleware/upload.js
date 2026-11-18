const multer = require("multer");
const ApiError = require("../utils/ApiError");

const MAX_BYTES = 5 * 1024 * 1024;

// One image field, kept in memory only long enough to re-encode it.
const single = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 0, parts: 2 },
}).single("photo");

function photoUpload(req, res, next) {
  single(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return next(new ApiError(413, "Photos must be 5 MB or smaller."));
    if (err instanceof multer.MulterError) return next(ApiError.badRequest("Send one photo in the \"photo\" field."));
    return next(err);
  });
}

module.exports = { photoUpload, MAX_BYTES };
