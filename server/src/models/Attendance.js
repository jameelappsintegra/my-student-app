const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");

const ATTENDANCE_STATUSES = ["present", "absent", "late", "half_day", "leave", "holiday"];

// One record per student per school day. `date` is stored at UTC midnight.
const attendanceSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ATTENDANCE_STATUSES, required: true },
    note: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true, toJSON: { transform: cleanTransform } }
);

// Prevents duplicate entries for the same student and day.
attendanceSchema.index({ student: 1, date: 1 }, { unique: true });
attendanceSchema.index({ school: 1, date: 1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
module.exports.ATTENDANCE_STATUSES = ATTENDANCE_STATUSES;
