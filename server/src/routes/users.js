const router = require("express").Router();
const v = require("../validators/users");
const users = require("../services/userService");
const { validate, validateId } = require("../middleware/validate");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const audit = (req, event, extra) => req.log.info({ event, actor: req.user.id, ...extra }, event);

router.get("/", validate(v.listUsers, "query"), h(async (req, res) => {
  const { items, pagination } = await users.listUsers(req.valid.query);
  sendSuccess(res, { message: "Users", data: items, pagination });
}));
router.post("/", validate(v.createUser), h(async (req, res) => {
  const user = await users.createUser(req.valid.body);
  audit(req, "user.create", { userId: user.id, role: user.role });
  sendSuccess(res, { status: 201, message: `Account created for ${user.name}`, data: user });
}));
// Creates logins for every student in a class who doesn't have one yet.
// Usernames are admission numbers; passwords are random and returned once.
const { z } = require("zod");
const { objectId, classCode } = require("../validators/common");
router.post("/student-logins", validate(z.object({ school: objectId, className: classCode, section: z.preprocess((x) => (x === "" ? undefined : x), z.string().trim().toUpperCase().regex(/^[A-Z]{1,5}$/).optional()) }).strict()), h(async (req, res) => {
  const result = await users.createStudentLogins(req.valid.body);
  audit(req, "user.student-logins", { created: result.created.length, school: req.valid.body.school, className: req.valid.body.className });
  sendSuccess(res, { status: 201, message: result.created.length ? `Created ${result.created.length} student logins. Copy the passwords now; they won't be shown again.` : "Every student in this class already has a login.", data: result });
}));

router.get("/:id", validateId, h(async (req, res) => {
  sendSuccess(res, { message: "User", data: await users.withDetails(await users.getUser(req.params.id)) });
}));
router.put("/:id", validateId, validate(v.updateUser), h(async (req, res) => {
  const user = await users.updateUser(req.params.id, req.valid.body, req.user.id);
  audit(req, "user.update", { userId: user.id, fields: Object.keys(req.valid.body) });
  sendSuccess(res, { message: `${user.name} updated`, data: user });
}));
router.post("/:id/password", validateId, validate(v.resetPassword), h(async (req, res) => {
  await users.resetPassword(req.params.id, req.valid.body.password);
  audit(req, "user.password.reset", { userId: req.params.id });
  sendSuccess(res, { message: "Password reset. They have been signed out everywhere." });
}));
router.delete("/:id", validateId, h(async (req, res) => {
  await users.deleteUser(req.params.id, req.user.id);
  audit(req, "user.delete", { userId: req.params.id });
  sendSuccess(res, { message: "Account deleted" });
}));

const { photoUpload } = require("../middleware/upload");
const userPhotos = require("../services/userPhotoService");
router.put("/:id/photo", validateId, photoUpload, h(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Choose a photo to upload (form field "photo").' });
  const user = await userPhotos.setUserPhoto(req.params.id, req.file.buffer);
  audit(req, "user.photo.set", { userId: user.id });
  sendSuccess(res, { message: "Photo updated", data: await users.withDetails(user) });
}));
router.delete("/:id/photo", validateId, h(async (req, res) => {
  const user = await userPhotos.removeUserPhoto(req.params.id);
  sendSuccess(res, { message: "Photo removed", data: await users.withDetails(user) });
}));

module.exports = router;
