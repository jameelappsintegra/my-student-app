const service = require("../services/schoolService");
const { sendSuccess } = require("../utils/response");

exports.list = async (req, res) => {
  const { items, pagination } = await service.listSchools(req.valid.query);
  sendSuccess(res, { message: "Schools retrieved successfully", data: items, pagination });
};
exports.get = async (req, res) => {
  sendSuccess(res, { message: "School retrieved", data: await service.getSchool(req.params.id) });
};
exports.create = async (req, res) => {
  const school = await service.createSchool(req.valid.body);
  req.log.info({ event: "school.create", schoolId: school.id }, "School created");
  sendSuccess(res, { status: 201, message: `${school.name} added`, data: school });
};
exports.update = async (req, res) => {
  const school = await service.updateSchool(req.params.id, req.valid.body);
  req.log.info({ event: "school.update", schoolId: school.id }, "School updated");
  sendSuccess(res, { message: `${school.name} updated`, data: school });
};
exports.remove = async (req, res) => {
  await service.deleteSchool(req.params.id);
  req.log.info({ event: "school.delete", schoolId: req.params.id }, "School deleted");
  sendSuccess(res, { message: "School deleted" });
};
