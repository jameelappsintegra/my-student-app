const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");

const AUDIENCES = ["everyone", "parents", "staff"];

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    // No school = all schools (admins only).
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School" },
    className: String,
    audience: { type: String, enum: AUDIENCES, default: "everyone" },
    pinned: { type: Boolean, default: false },
    eventDate: Date, // optional: shows on the school calendar
    expiresAt: Date,
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, toJSON: { transform: cleanTransform } }
);
announcementSchema.index({ school: 1, createdAt: -1 });

module.exports = mongoose.model("Announcement", announcementSchema);
module.exports.AUDIENCES = AUDIENCES;
