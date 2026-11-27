const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");
const { CLASS_CODES } = require("../constants");

const homeworkSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    className: { type: String, enum: CLASS_CODES, required: true },
    section: { type: String, uppercase: true, trim: true, maxlength: 5 },
    subject: { type: String, required: true, trim: true, maxlength: 60 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    details: { type: String, trim: true, maxlength: 4000 },
    dueDate: { type: Date, required: true },
    // Optional: lets teachers mark submissions out of this.
    maxMarks: { type: Number, min: 1, max: 1000 },
    // Students hand it in online (otherwise it's done in a notebook).
    onlineSubmission: { type: Boolean, default: false },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, toJSON: { transform: cleanTransform } }
);
homeworkSchema.index({ school: 1, className: 1, section: 1, dueDate: -1 });

module.exports = mongoose.model("Homework", homeworkSchema);
