const { getSummary } = require("../services/dashboardService");
const { sendSuccess } = require("../utils/response");

exports.summary = async (_req, res) => {
  sendSuccess(res, { message: "Dashboard summary", data: await getSummary() });
};
