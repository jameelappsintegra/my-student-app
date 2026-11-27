const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");

const CERTIFICATE_TYPES = ["transfer", "bonafide", "character", "study"];

// Issued certificates keep a snapshot of the student's details as printed,
// so a later edit of the record never changes an issued document.
const certificateSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    type: { type: String, enum: CERTIFICATE_TYPES, required: true },
    serialNumber: { type: String, required: true, unique: true },
    // Random code printed on the certificate for public verification.
    verificationCode: { type: String, required: true, unique: true },
    issuedAt: { type: Date, required: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    purpose: { type: String, trim: true, maxlength: 200 },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    // Transfer certificate details.
    leavingDate: Date,
    reason: { type: String, trim: true, maxlength: 200 },
    conduct: { type: String, trim: true, maxlength: 60 },
    remarks: { type: String, trim: true, maxlength: 500 },
    duesCleared: Boolean,
    previousStatus: String,
    status: { type: String, enum: ["issued", "cancelled"], default: "issued" },
    cancelledAt: Date,
    cancelReason: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true, toJSON: { transform: cleanTransform } }
);
certificateSchema.index({ school: 1, type: 1, issuedAt: -1 });
certificateSchema.index({ student: 1, type: 1, status: 1 });

module.exports = mongoose.model("Certificate", certificateSchema);
module.exports.CERTIFICATE_TYPES = CERTIFICATE_TYPES;
