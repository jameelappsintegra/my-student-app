const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");

// What a share can open up. Shares are always read-only.
const SHARE_SCOPES = ["academic", "attendance", "personal", "fees"];
const SHARE_STATUSES = ["pending", "approved", "rejected", "revoked"];

const accessShareSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    ownerSchool: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    scopes: { type: [{ type: String, enum: SHARE_SCOPES }], required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    days: { type: Number, min: 1, max: 180, default: 30 },
    status: { type: String, enum: SHARE_STATUSES, default: "pending" },
    expiresAt: Date,
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decidedAt: Date,
    decisionNote: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, toJSON: { transform: cleanTransform } }
);

accessShareSchema.index({ requester: 1, student: 1, status: 1 });
accessShareSchema.index({ ownerSchool: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("AccessShare", accessShareSchema);
module.exports.SHARE_SCOPES = SHARE_SCOPES;
