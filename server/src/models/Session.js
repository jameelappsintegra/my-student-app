const mongoose = require("mongoose");

// Server-side sessions: the cookie holds a random token, the database holds
// only its SHA-256 hash, so a database leak does not expose live sessions.
const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
    ip: String,
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true }
);

// MongoDB deletes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ user: 1 });

module.exports = mongoose.model("Session", sessionSchema);
