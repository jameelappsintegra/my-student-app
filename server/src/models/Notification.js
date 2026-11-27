const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");

const NOTIFICATION_TYPES = ["announcement", "attendance", "result", "fee", "homework", "leave", "share", "timetable", "general"];

// In-app notifications. Other channels (email, SMS, WhatsApp) can be added
// in notificationService without changing callers.
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, default: "general" },
    title: { type: String, required: true, maxlength: 160 },
    body: { type: String, maxlength: 1000 },
    link: { type: String, maxlength: 300 },
    readAt: Date,
  },
  { timestamps: true, toJSON: { transform: cleanTransform } }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
// Old notifications clean themselves up after 180 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 86400 });

module.exports = mongoose.model("Notification", notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
