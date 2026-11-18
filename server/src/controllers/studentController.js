const service = require("../services/studentService");
const { openStream } = require("../services/photoService");
const { sendSuccess } = require("../utils/response");

exports.list = async (req, res) => {
  const { items, pagination } = await service.listStudents(req.valid.query);
  sendSuccess(res, { message: "Students retrieved successfully", data: items, pagination });
};

exports.get = async (req, res) => {
  sendSuccess(res, { message: "Student retrieved", data: await service.getStudent(req.params.id) });
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
  const etag = `"${photo.fileId}"`;
  res.set({
    "Content-Type": "image/jpeg",
    // Personal data: cache in the viewer's browser only, never in shared caches.
    "Cache-Control": "private, max-age=86400",
    ETag: etag,
  });
  if (req.get("if-none-match") === etag) return res.status(304).end();
  const stream = openStream(photo.fileId);
  stream.once("error", next);
  return stream.pipe(res);
};
