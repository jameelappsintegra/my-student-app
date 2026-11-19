const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const photos = require("./photoService");

async function setUserPhoto(userId, buffer) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound("User not found");
  const { fileId } = await photos.store(buffer, String(user._id), photos.USER_BUCKET);
  const previous = user.photo?.fileId;
  user.photo = { fileId, updatedAt: new Date() };
  try {
    await user.save();
  } catch (err) {
    await photos.remove(fileId, photos.USER_BUCKET);
    throw err;
  }
  await photos.remove(previous, photos.USER_BUCKET);
  return user;
}

async function removeUserPhoto(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound("User not found");
  const previous = user.photo?.fileId;
  user.photo = undefined;
  await user.save();
  await photos.remove(previous, photos.USER_BUCKET);
  return user;
}

// Staff photos (admins, teachers) are visible to everyone signed in, so
// parents can recognise teachers. A parent's photo is visible only to that
// parent and to admins.
async function viewablePhoto(viewer, targetId) {
  const target = await User.findById(targetId).select("role photo").lean();
  if (!target?.photo?.fileId) throw ApiError.notFound("No photo");
  const self = String(viewer._id) === String(target._id);
  if (!self && viewer.role !== "admin" && target.role === "parent") throw ApiError.notFound("No photo");
  return target.photo;
}

module.exports = { setUserPhoto, removeUserPhoto, viewablePhoto };
