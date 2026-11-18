const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");

const subjectSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true, maxlength: 60 },
    maxMarks: { type: Number, required: true, min: 1, max: 1000 },
    marks: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// CBSE-style nine-point grading on percentage.
const GRADE_BANDS = [
  [91, "A1"], [81, "A2"], [71, "B1"], [61, "B2"], [51, "C1"], [41, "C2"], [33, "D"], [0, "E"],
];
const PASS_PERCENT = 33;
const gradeFor = (pct) => GRADE_BANDS.find(([min]) => pct >= min)[1];
const round1 = (n) => Math.round(n * 10) / 10;

const examResultSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    academicYear: { type: String, required: true },
    exam: { type: String, required: true, trim: true, maxlength: 60 },
    examDate: Date,
    subjects: {
      type: [subjectSchema],
      validate: [(v) => v.length >= 1 && v.length <= 15, "Enter between 1 and 15 subjects"],
    },
    remarks: { type: String, trim: true, maxlength: 500 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        cleanTransform(doc, ret);
        return withScores(ret);
      },
    },
  }
);

// One result per exam per student per year.
examResultSchema.index({ student: 1, academicYear: 1, exam: 1 }, { unique: true });

function withScores(ret) {
  ret.subjects = ret.subjects.map((s) => {
    const pct = (s.marks / s.maxMarks) * 100;
    return { ...s, percentage: round1(pct), grade: gradeFor(pct), passed: pct >= PASS_PERCENT };
  });
  const total = ret.subjects.reduce((a, s) => a + s.marks, 0);
  const max = ret.subjects.reduce((a, s) => a + s.maxMarks, 0);
  const pct = max ? (total / max) * 100 : 0;
  ret.total = total;
  ret.maxTotal = max;
  ret.percentage = round1(pct);
  ret.grade = gradeFor(pct);
  ret.passed = ret.subjects.every((s) => s.passed);
  return ret;
}

module.exports = mongoose.model("ExamResult", examResultSchema);
module.exports.withScores = withScores;
module.exports.gradeFor = gradeFor;
