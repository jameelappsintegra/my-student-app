// Class insights for teachers and principals.
const router = require("express").Router();
const { z } = require("zod");
const { validate } = require("../middleware/validate");
const { canTeach } = require("../middleware/authorize");
const { can } = require("../constants/permissions");
const { objectId, classCode } = require("../validators/common");
const { classInsights } = require("../services/progressService");
const ApiError = require("../utils/ApiError");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const section = z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toUpperCase().regex(/^[A-Z]{1,5}$/, "Section must be letters").optional());

router.get("/class", validate(z.object({ school: objectId, className: classCode, section }).strict(), "query"), h(async (req, res) => {
  const q = req.valid.query;
  if (!canTeach(req.user, q)) throw new ApiError(403, "You are not assigned to this class.");
  sendSuccess(res, { message: "Class insights", data: await classInsights(q, { withFees: can(req.user, "fees.view") }) });
}));

module.exports = router;
