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
    // Per-school preferences (see services/schoolSettings.js for defaults).
    settings: {
      currency: { type: String, uppercase: true, match: /^[A-Z]{3}$/ },
      locale: { type: String, maxlength: 20 },
      timezone: { type: String, maxlength: 60 },
      academicYearStartMonth: { type: Number, min: 1, max: 12 },
      weeklyOffs: { type: [Number], default: undefined },
      passPercentage: { type: Number, min: 0, max: 100 },
      gradingScale: {
        type: [new mongoose.Schema({ min: { type: Number, min: 0, max: 100, required: true }, grade: { type: String, required: true, maxlength: 20 }, remark: { type: String, maxlength: 40 } }, { _id: false })],
        default: undefined,
      },
      terms: {
        type: [new mongoose.Schema({ name: { type: String, required: true, maxlength: 40 }, start: { type: Date, required: true }, end: { type: Date, required: true } }, { _id: false })],
        default: undefined,
      },
      holidays: {
        type: [new mongoose.Schema({ date: { type: Date, required: true }, name: { type: String, required: true, maxlength: 80 } }, { _id: false })],
        default: undefined,
      },
      library: { finePerDay: { type: Number, min: 0, max: 1000 }, loanDays: { type: Number, min: 1, max: 90 }, maxBooks: { type: Number, min: 1, max: 20 } },
      homework: { allowLate: Boolean },
    },
  },
  { timestamps: true, toJSON: { transform: cleanTransform } }
);

schoolSchema.index({ name: 1 });

module.exports = mongoose.model("School", schoolSchema);
