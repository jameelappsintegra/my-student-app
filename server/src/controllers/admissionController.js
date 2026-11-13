const service = require("../services/admissionService");
const { sendSuccess } = require("../utils/response");

exports.create = async (req, res) => {
  const admission = await service.createAdmission(req.valid.body);
  sendSuccess(res, {
    status: 201,
    message:
      admission.status === "draft"
        ? "Application saved as draft"
        : `Application ${admission.applicationNumber} submitted`,
    data: admission,
  });
};

exports.list = async (req, res) => {
  const { items, pagination } = await service.listAdmissions(req.valid.query);
  sendSuccess(res, {
    message: "Admissions retrieved successfully",
    data: items,
    pagination,
  });
};

exports.get = async (req, res) => {
  const admission = await service.getAdmission(req.params.id);
  sendSuccess(res, { message: "Admission retrieved", data: admission });
};

exports.updateStatus = async (req, res) => {
  const admission = await service.updateStatus(req.params.id, req.valid.body);
  sendSuccess(res, {
    message: `Application marked ${admission.status.replace("_", " ")}`,
    data: admission,
  });
};

exports.enroll = async (req, res) => {
  const { admission, student } = await service.enroll(
    req.params.id,
    req.valid.body
  );
  sendSuccess(res, {
    status: 201,
    message: `Student enrolled with admission number ${student.admissionNumber}`,
    data: { admission, student },
  });
};
