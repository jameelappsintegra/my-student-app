const mongoose = require("mongoose");
const sharp = require("sharp");
const ApiError = require("../utils/ApiError");

const BUCKET = "studentPhotos";
const ALLOWED = new Set(["jpeg", "png", "webp", "heif", "avif"]);
const OUTPUT_SIZE = 512;

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });

// Decodes the upload (rejecting anything that is not a real image),
// crops it to a square, and re-encodes it as JPEG. Re-encoding drops EXIF
// metadata such as GPS location and neutralises crafted files.
async function normalise(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: 40e6 }).metadata();
  } catch {
    throw ApiError.badRequest("That file is not a supported image. Use a JPEG, PNG or WebP photo.");
  }
  if (!ALLOWED.has(meta.format)) {
    throw ApiError.badRequest("That file is not a supported image. Use a JPEG, PNG or WebP photo.");
  }
  return sharp(buffer, { limitInputPixels: 40e6 })
    .rotate() // honour camera orientation before metadata is dropped
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "attention" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

async function store(buffer, studentId) {
  const jpeg = await normalise(buffer);
  return new Promise((resolve, reject) => {
    const upload = bucket().openUploadStream(`${studentId}.jpg`, {
      contentType: "image/jpeg",
      metadata: { student: studentId },
    });
    upload.once("error", reject);
    upload.once("finish", () => resolve({ fileId: upload.id, size: jpeg.length }));
    upload.end(jpeg);
  });
}

async function remove(fileId) {
  if (!fileId) return;
  try {
    await bucket().delete(fileId);
  } catch (err) {
    // Already gone: nothing to clean up.
    if (!/FileNotFound|File not found/i.test(err.message)) throw err;
  }
}

function openStream(fileId) {
  return bucket().openDownloadStream(fileId);
}

module.exports = { store, remove, openStream, normalise, BUCKET };
