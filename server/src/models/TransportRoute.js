const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");

const stopSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    pickupTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    dropTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    // Term fee for this stop, in the school's currency.
    fee: { type: Number, min: 0, max: 1000000 },
  },
  { _id: false }
);

const routeSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    vehicleNumber: { type: String, trim: true, uppercase: true, maxlength: 20 },
    driverName: { type: String, trim: true, maxlength: 80 },
    driverPhone: { type: String, trim: true, maxlength: 20 },
    attendantName: { type: String, trim: true, maxlength: 80 },
    attendantPhone: { type: String, trim: true, maxlength: 20 },
    capacity: { type: Number, min: 1, max: 200, required: true },
    stops: { type: [stopSchema], validate: [(v) => v.length >= 1 && v.length <= 40, "Add between 1 and 40 stops"] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { transform: cleanTransform } }
);
routeSchema.index({ school: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("TransportRoute", routeSchema);
