const mongoose = require("mongoose");
const { SCHOOL_BOARDS } = require("../constants");
const { cleanTransform } = require("../utils/serialize");

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Short code used in admission numbers, e.g. GVPS-2026-00001.
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: /^[A-Z0-9]{2,8}$/,
    },
    board: { type: String, enum: SCHOOL_BOARDS, default: "State Board" },
    address: { type: String, trim: true, maxlength: 300 },
    city: { type: String, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    principalName: { type: String, trim: true, maxlength: 120 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { transform: cleanTransform } }
);

schoolSchema.index({ name: 1 });

module.exports = mongoose.model("School", schoolSchema);
