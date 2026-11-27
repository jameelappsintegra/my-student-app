const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");

const leaveSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], default: "pending" },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decidedAt: Date,
    note: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true, toJSON: { transform: cleanTransform } }
);
leaveSchema.index({ student: 1, from: -1 });
leaveSchema.index({ school: 1, status: 1 });

module.exports = mongoose.model("LeaveRequest", leaveSchema);
