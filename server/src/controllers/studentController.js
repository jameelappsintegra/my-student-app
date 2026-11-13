const service = require("../services/studentService");
const { sendSuccess } = require("../utils/response");

exports.list = async (req, res) => {
  const { items, pagination } = await service.listStudents(req.valid.query);
  sendSuccess(res, {
    message: "Students retrieved successfully",
    data: items,
    pagination,
  });
};

exports.get = async (req, res) => {
  const student = await service.getStudent(req.params.id);
  sendSuccess(res, { message: "Student retrieved", data: student });
};

exports.update = async (req, res) => {
  const student = await service.updateStudent(req.params.id, req.valid.body);
  sendSuccess(res, { message: "Student updated", data: student });
};

exports.updateStatus = async (req, res) => {
  const student = await service.updateStatus(
    req.params.id,
    req.valid.body.status
  );
  sendSuccess(res, { message: "Student status updated", data: student });
};

exports.remove = async (req, res) => {
  await service.deleteStudent(req.params.id);
  sendSuccess(res, { message: "Student deleted" });
};
