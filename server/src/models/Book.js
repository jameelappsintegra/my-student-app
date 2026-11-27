const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");

const bookSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    author: { type: String, trim: true, maxlength: 120 },
    isbn: { type: String, trim: true, maxlength: 20 },
    category: { type: String, trim: true, maxlength: 60 },
    publisher: { type: String, trim: true, maxlength: 120 },
    shelf: { type: String, trim: true, maxlength: 30 },
    copies: { type: Number, required: true, min: 0, max: 1000 },
    // Copies currently out; available = copies - issued.
    issued: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        cleanTransform(doc, ret);
        ret.available = Math.max(0, ret.copies - (ret.issued || 0));
        return ret;
      },
    },
  }
);
bookSchema.index({ school: 1, title: 1 });
bookSchema.index({ school: 1, isbn: 1 });

module.exports = mongoose.model("Book", bookSchema);
