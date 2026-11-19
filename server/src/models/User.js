const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");
const { ROLES, permissionsFor } = require("../constants/permissions");
const { CLASS_CODES } = require("../constants");

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
    role: { type: String, enum: ROLES, default: "admin" },
    // Teachers: the classes they teach. A missing section means every
    // section of that class.
    assignments: {
      type: [
        new mongoose.Schema(
          {
            school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
            className: { type: String, enum: CLASS_CODES, required: true },
            section: { type: String, uppercase: true, trim: true, maxlength: 5 },
          },
          { _id: false }
        ),
      ],
      default: undefined,
    },
    // Principals: the schools they head.
    schools: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "School" }], default: undefined },
    // Extra permissions switched on by an admin (see GRANTABLE).
    grants: { type: [String], default: undefined },
    // Parents: their children.
    children: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }], default: undefined },
    phone: { type: String, trim: true, maxlength: 20 },
    // Profile photo in GridFS bucket "userPhotos".
    photo: { fileId: mongoose.Schema.Types.ObjectId, updatedAt: Date },
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
        ret.permissions = permissionsFor(ret.role, ret.grants || []);
        if (ret.schools) ret.schools = ret.schools.map((s) => String(s?._id || s));
        const p = ret.photo;
        delete ret.photo;
        ret.photoUrl = p && p.fileId ? `/api/users/${ret.id}/photo?v=${new Date(p.updatedAt).getTime()}` : null;
        if (ret.assignments) ret.assignments = ret.assignments.map((x) => ({ ...x, school: String(x.school?._id || x.school) }));
        if (ret.children) ret.children = ret.children.map((c) => String(c?._id || c));
        return ret;
      },
    },
  }
);

userSchema.index({ role: 1 });
userSchema.index({ children: 1 });

userSchema.statics.MAX_FAILED_LOGINS = MAX_FAILED_LOGINS;
userSchema.statics.LOCK_MINUTES = LOCK_MINUTES;

module.exports = mongoose.model("User", userSchema);
