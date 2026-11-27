const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");
const { CLASS_CODES } = require("../constants");

// One period of one class. Day 1 = Monday … 6 = Saturday.
const timetableSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    className: { type: String, enum: CLASS_CODES, required: true },
    section: { type: String, uppercase: true, trim: true, default: "", maxlength: 5 },
    day: { type: Number, min: 1, max: 6, required: true },
    period: { type: Number, min: 1, max: 12, required: true },
    subject: { type: String, required: true, trim: true, maxlength: 60 },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    room: { type: String, trim: true, maxlength: 30 },
  },
  { timestamps: true, toJSON: { transform: cleanTransform } }
);
// A class has one subject per period; a teacher and a room can't be in two
// places at once.
timetableSchema.index({ school: 1, className: 1, section: 1, day: 1, period: 1 }, { unique: true });
timetableSchema.index({ teacher: 1, day: 1, period: 1 }, { unique: true, partialFilterExpression: { teacher: { $exists: true } } });
timetableSchema.index({ school: 1, room: 1, day: 1, period: 1 }, { unique: true, partialFilterExpression: { room: { $type: "string", $gt: "" } } });

module.exports = mongoose.model("TimetableEntry", timetableSchema);
