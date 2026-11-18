const { getSummary } = require("../services/dashboardService");
const { sendSuccess } = require("../utils/response");

const { objectId } = require("../validators/common");
const ApiError = require("../utils/ApiError");

exports.summary = async (req, res) => {
  const school = req.query.school;
  if (school !== undefined && !objectId.safeParse(school).success) throw ApiError.badRequest("Invalid school");
  sendSuccess(res, { message: "Dashboard summary", data: await getSummary({ school }) });
};
