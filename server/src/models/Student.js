const mongoose = require("mongoose");
const { CLASS_CODES, STUDENT_STATUSES } = require("../constants");
const {
  personalFields,
  buildDedupeKey,
  buildSearchTokens,
} = require("./common");
const { cleanTransform } = require("../utils/serialize");

const studentSchema = new mongoose.Schema(
  {
    admissionNumber: { type: String, required: true, unique: true },
    ...personalFields,
    admissionDate: { type: Date, required: true, default: Date.now },
    academicYear: { type: String, required: true },
    className: { type: String, enum: CLASS_CODES, required: true },
    section: { type: String, trim: true, uppercase: true, maxlength: 5 },
    rollNumber: { type: Number, min: 1 },
    // Restricted: excluded from queries unless explicitly selected.
    medicalNotes: { type: String, maxlength: 2000, select: false },
    status: { type: String, enum: STUDENT_STATUSES, default: "active" },
    admission: { type: mongoose.Schema.Types.ObjectId, ref: "Admission" },
    dedupeKey: { type: String, required: true },
    searchTokens: { type: [String], default: undefined },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    // Concurrent edits of the same student fail with 409 instead of
    // silently overwriting each other.
    optimisticConcurrency: true,
    toJSON: {
      transform(doc, ret) {
        cleanTransform(doc, ret);
        // Restricted field: never serialised until role-based access exists.
        delete ret.medicalNotes;
        return ret;
      },
    },
  }
);

studentSchema.index({ dedupeKey: 1 });
studentSchema.index({ searchTokens: 1 });
// Default list order and the class/section roster view.
studentSchema.index({ deletedAt: 1, lastName: 1, firstName: 1 });
studentSchema.index({ deletedAt: 1, className: 1, section: 1, rollNumber: 1 });
studentSchema.index({ deletedAt: 1, status: 1 });
// One roll number per section per year. Soft delete unsets rollNumber.
studentSchema.index(
  { academicYear: 1, className: 1, section: 1, rollNumber: 1 },
  { unique: true, partialFilterExpression: { rollNumber: { $exists: true } } }
);

studentSchema.pre("validate", function setDedupeKey(next) {
  if (this.firstName && this.lastName && this.dateOfBirth) {
    this.dedupeKey = buildDedupeKey(this);
  }
  this.searchTokens = buildSearchTokens(this, "admissionNumber");
  next();
});

module.exports = mongoose.model("Student", studentSchema);
