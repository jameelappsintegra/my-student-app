const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");

// A place in the queue for a book whose copies are all out. When a copy
// comes back, the first waiting reservation becomes "ready": that copy is
// held for the student until `readyUntil`.
const reservationSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["waiting", "ready", "fulfilled", "cancelled", "expired"], default: "waiting" },
    readyAt: Date,
    readyUntil: Date,
  },
  { timestamps: true, toJSON: { transform: cleanTransform } }
);
reservationSchema.index({ book: 1, status: 1, createdAt: 1 });
reservationSchema.index({ student: 1, status: 1 });
// One open reservation per student per book.
reservationSchema.index({ book: 1, student: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["waiting", "ready"] } } });

module.exports = mongoose.model("BookReservation", reservationSchema);
