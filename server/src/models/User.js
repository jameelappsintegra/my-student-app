const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9._-]{3,40}$/,
    },
    name: { type: String, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },
    // Only "admin" exists today; real roles and permissions come next.
    role: { type: String, enum: ["admin"], default: "admin" },
    active: { type: Boolean, default: true },
    failedLogins: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
    lastLoginAt: Date,
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        cleanTransform(doc, ret);
        delete ret.passwordHash;
        delete ret.failedLogins;
        delete ret.lockedUntil;
        return ret;
      },
    },
  }
);

userSchema.statics.MAX_FAILED_LOGINS = MAX_FAILED_LOGINS;
userSchema.statics.LOCK_MINUTES = LOCK_MINUTES;

module.exports = mongoose.model("User", userSchema);
