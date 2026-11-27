const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");

// Who did what, kept for a year. Written automatically for every log line
// that carries an `event` (see app.js).
const auditLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    event: { type: String, required: true, maxlength: 60 },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorName: String,
    actorRole: String,
    ip: String,
    requestId: String,
    details: { type: mongoose.Schema.Types.Mixed },
  },
  { toJSON: { transform: cleanTransform } }
);

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ event: 1, at: -1 });
auditLogSchema.index({ actor: 1, at: -1 });
auditLogSchema.index({ at: 1 }, { expireAfterSeconds: 365 * 86400 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
