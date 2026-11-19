const mongoose = require("mongoose");
const sharp = require("sharp");
const ApiError = require("../utils/ApiError");

const BUCKET = "studentPhotos";
const USER_BUCKET = "userPhotos";
const ALLOWED = new Set(["jpeg", "png", "webp", "heif", "avif"]);
const OUTPUT_SIZE = 512;

const bucket = (name = BUCKET) => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: name });

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

async function store(buffer, ownerId, bucketName = BUCKET) {
  const jpeg = await normalise(buffer);
  return new Promise((resolve, reject) => {
    const upload = bucket(bucketName).openUploadStream(`${ownerId}.jpg`, {
      contentType: "image/jpeg",
      metadata: { owner: ownerId },
    });
    upload.once("error", reject);
    upload.once("finish", () => resolve({ fileId: upload.id, size: jpeg.length }));
    upload.end(jpeg);
  });
}

async function remove(fileId, bucketName = BUCKET) {
  if (!fileId) return;
  try {
    await bucket(bucketName).delete(fileId);
  } catch (err) {
    // Already gone: nothing to clean up.
    if (!/FileNotFound|File not found/i.test(err.message)) throw err;
  }
}

function openStream(fileId, bucketName = BUCKET) {
  return bucket(bucketName).openDownloadStream(fileId);
}

// Streams a stored JPEG with private caching and ETag support.
function sendPhoto(req, res, next, photo, bucketName = BUCKET) {
  const etag = `"${photo.fileId}"`;
  res.set({ "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", ETag: etag });
  if (req.get("if-none-match") === etag) return res.status(304).end();
  const stream = openStream(photo.fileId, bucketName);
  stream.once("error", next);
  return stream.pipe(res);
}

module.exports = { store, remove, openStream, sendPhoto, normalise, BUCKET, USER_BUCKET };
