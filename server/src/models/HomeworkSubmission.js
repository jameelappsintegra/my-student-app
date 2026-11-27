const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");

// A student's answer to one homework. One per student per homework; it can
// be edited until the teacher grades or returns it.
const submissionSchema = new mongoose.Schema(
  {
    homework: { type: mongoose.Schema.Types.ObjectId, ref: "Homework", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    text: { type: String, trim: true, maxlength: 8000 },
    link: { type: String, trim: true, maxlength: 500 },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    submittedAt: { type: Date, required: true },
    late: { type: Boolean, default: false },
    // submitted → graded, or → returned (teacher asks for a redo; the
    // student can submit again).
    status: { type: String, enum: ["submitted", "returned", "graded"], default: "submitted" },
    marks: { type: Number, min: 0, max: 1000 },
    feedback: { type: String, trim: true, maxlength: 2000 },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    gradedAt: Date,
  },
  { timestamps: true, toJSON: { transform: cleanTransform } }
);
submissionSchema.index({ homework: 1, student: 1 }, { unique: true });
submissionSchema.index({ student: 1, createdAt: -1 });

module.exports = mongoose.model("HomeworkSubmission", submissionSchema);
