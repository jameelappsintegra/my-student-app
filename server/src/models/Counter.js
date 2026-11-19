const mongoose = require("mongoose");

// Atomic sequence generator (used for admission and application numbers).
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function next(key, session) {
  const doc = await this.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session }
  );
  return doc.seq;
};

module.exports = mongoose.model("Counter", counterSchema);
