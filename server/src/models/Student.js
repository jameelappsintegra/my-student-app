const mongoose = require("mongoose");
const { CLASS_CODES, STUDENT_STATUSES } = require("../constants");
const { personalFields, buildDedupeKey } = require("./common");
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
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
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
studentSchema.index({ academicYear: 1, className: 1, section: 1 });
studentSchema.index({ status: 1 });

studentSchema.pre("validate", function setDedupeKey(next) {
  if (this.firstName && this.lastName && this.dateOfBirth) {
    this.dedupeKey = buildDedupeKey(this);
  }
  next();
});

module.exports = mongoose.model("Student", studentSchema);
