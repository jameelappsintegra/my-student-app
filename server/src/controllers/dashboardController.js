const { getSummary } = require("../services/dashboardService");
const { sendSuccess } = require("../utils/response");

const { objectId } = require("../validators/common");
const ApiError = require("../utils/ApiError");
const { schoolIds } = require("../middleware/authorize");

exports.summary = async (req, res) => {
  let school = req.query.school;
  if (school !== undefined && !objectId.safeParse(school).success) throw ApiError.badRequest("Invalid school");
  const allowed = schoolIds(req.user);
  if (allowed) {
    if (school && !allowed.includes(school)) throw new ApiError(403, "You can only view your own school.");
    school = school || allowed[0];
    if (!school) throw new ApiError(403, "No school is assigned to your account.");
  }
  sendSuccess(res, { message: "Dashboard summary", data: await getSummary({ school }) });
};
