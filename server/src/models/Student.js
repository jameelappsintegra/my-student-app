const mongoose = require("mongoose");
const {
  CLASS_CODES,
  STUDENT_STATUSES,
  TRANSPORT_MODES,
} = require("../constants");
const {
  personalFields,
  buildDedupeKey,
  buildSearchTokens,
} = require("./common");
const { cleanTransform } = require("../utils/serialize");

// Public shape: restricted fields removed, photo pointer replaced by a URL
// with a version so browsers re-fetch only when the photo changes.
function studentPublic(ret) {
  delete ret.medicalNotes;
  const photo = ret.photo;
  delete ret.photo;
  ret.photoUrl =
    photo && photo.fileId
      ? `/api/students/${ret.id}/photo?v=${new Date(photo.updatedAt).getTime()}`
      : null;
  // `school` is an ObjectId, or a populated school (document or lean).
  const sc = ret.school;
  if (sc && typeof sc === "object" && (sc.name || sc.code)) {
    ret.school = { id: String(sc.id || sc._id), name: sc.name, code: sc.code };
  } else if (sc) {
    ret.school = { id: String(sc) };
  }
  return ret;
}

const studentSchema = new mongoose.Schema(
  {
    admissionNumber: { type: String, required: true, unique: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    ...personalFields,
    // The student's own contact details (older students), optional.
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 20 },
    transport: { type: String, enum: TRANSPORT_MODES },
    busRoute: { type: String, trim: true, maxlength: 60 },
    // School bus: the route and stop the student is assigned to.
    transportRoute: { type: mongoose.Schema.Types.ObjectId, ref: "TransportRoute" },
    transportStop: { type: String, trim: true, maxlength: 80 },
    // Photo bytes live in GridFS (bucket "studentPhotos"); this is the pointer.
    photo: {
      fileId: mongoose.Schema.Types.ObjectId,
      updatedAt: Date,
    },
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
        return studentPublic(cleanTransform(doc, ret));
      },
    },
  }
);

studentSchema.index({ school: 1, deletedAt: 1, className: 1, section: 1 });
studentSchema.index({ dedupeKey: 1 });
studentSchema.index({ searchTokens: 1 });
// Default list order and the class/section roster view.
studentSchema.index({ deletedAt: 1, lastName: 1, firstName: 1 });
studentSchema.index({ deletedAt: 1, className: 1, section: 1, rollNumber: 1 });
studentSchema.index({ deletedAt: 1, status: 1 });
studentSchema.index({ transportRoute: 1 }, { sparse: true });
// One roll number per section per year in each school. Soft delete unsets it.
studentSchema.index(
  { school: 1, academicYear: 1, className: 1, section: 1, rollNumber: 1 },
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
module.exports.studentPublic = studentPublic;
