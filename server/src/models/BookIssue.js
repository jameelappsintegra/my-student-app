const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");

// One copy of a book lent to a student.
const issueSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    issuedAt: { type: Date, required: true },
    dueAt: { type: Date, required: true },
    returnedAt: Date,
    // Late fine worked out on return (days late x the school's daily fine).
    fine: { type: Number, min: 0, default: 0 },
    fineStatus: { type: String, enum: ["none", "due", "paid", "waived"], default: "none" },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    renewals: { type: Number, default: 0 },
    remindedAt: Date,
    // When a fine was collected or waived (for the month's fine total).
    fineSettledAt: Date,
    returnedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, toJSON: { transform: cleanTransform } }
);
issueSchema.index({ school: 1, returnedAt: 1, dueAt: 1 });
issueSchema.index({ student: 1, returnedAt: 1 });

module.exports = mongoose.model("BookIssue", issueSchema);
