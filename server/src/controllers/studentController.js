const service = require("../services/studentService");
const { sendPhoto } = require("../services/photoService");
const { sendSuccess } = require("../utils/response");

exports.list = async (req, res) => {
  const { items, pagination } = await service.listStudents(req.valid.query, req.user);
  sendSuccess(res, { message: "Students retrieved successfully", data: items, pagination });
};

// Personal details are hidden unless a share includes them.
const PERSONAL = ["address", "phone", "email", "father", "mother", "guardian", "emergencyContact", "dateOfBirth", "transport", "busRoute", "bloodGroup", "nationality", "previousSchool"];

exports.get = async (req, res) => {
  const student = (await service.getStudent(req.params.id)).toJSON();
  if (req.share) {
    if (!req.share.scopes.includes("personal")) for (const k of PERSONAL) delete student[k];
    student.sharedAccess = req.share;
  }
  sendSuccess(res, { message: "Student retrieved", data: student });
};

exports.create = async (req, res) => {
  const student = await service.createStudent(req.valid.body);
  req.log.info({ event: "student.create", studentId: student.id }, "Student created");
  sendSuccess(res, {
    status: 201,
    message: `${student.firstName} ${student.lastName} added as ${student.admissionNumber}`,
    data: student,
  });
};

exports.update = async (req, res) => {
  const student = await service.updateStudent(req.params.id, req.valid.body);
  req.log.info({ event: "student.update", studentId: student.id, fields: Object.keys(req.valid.body) }, "Student updated");
  sendSuccess(res, { message: "Student updated", data: student });
};

exports.updateStatus = async (req, res) => {
  const student = await service.updateStatus(req.params.id, req.valid.body.status);
  req.log.info({ event: "student.status", studentId: student.id, status: student.status }, "Student status changed");
  sendSuccess(res, { message: "Student status updated", data: student });
};

exports.remove = async (req, res) => {
  await service.deleteStudent(req.params.id);
  req.log.info({ event: "student.delete", studentId: req.params.id }, "Student deleted");
  sendSuccess(res, { message: "Student deleted" });
};

exports.uploadPhoto = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "Choose a photo to upload (form field \"photo\")." });
  }
  const student = await service.setPhoto(req.params.id, req.file.buffer);
  req.log.info({ event: "student.photo.set", studentId: student.id }, "Student photo updated");
  return sendSuccess(res, { message: "Photo updated", data: student });
};

exports.deletePhoto = async (req, res) => {
  const student = await service.removePhoto(req.params.id);
  req.log.info({ event: "student.photo.remove", studentId: student.id }, "Student photo removed");
  sendSuccess(res, { message: "Photo removed", data: student });
};

exports.getPhoto = async (req, res, next) => {
  const photo = await service.photoFor(req.params.id);
  return sendPhoto(req, res, next, photo);
};
