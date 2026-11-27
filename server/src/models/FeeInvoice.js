const mongoose = require("mongoose");
const { cleanTransform } = require("../utils/serialize");

const PAYMENT_METHODS = ["cash", "upi", "card", "bank_transfer", "cheque"];

const paymentSchema = new mongoose.Schema(
  {
    // Whole rupees.
    amount: { type: Number, required: true, min: 1 },
    paidAt: { type: Date, required: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    reference: { type: String, trim: true, maxlength: 60 },
    receiptNumber: { type: String, required: true },
  },
  { timestamps: true }
);

const feeInvoiceSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    academicYear: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    amount: { type: Number, required: true, min: 1, max: 10000000 },
    dueDate: { type: Date, required: true },
    payments: [paymentSchema],
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    toJSON: {
      transform(doc, ret) {
        cleanTransform(doc, ret);
        return withBalance(ret);
      },
    },
  }
);

feeInvoiceSchema.index({ student: 1, academicYear: 1, dueDate: 1 });
feeInvoiceSchema.index({ school: 1, dueDate: 1 });

// paid / partial / unpaid, and overdue when money is still owed after the due date.
function withBalance(ret, today = new Date()) {
  ret.payments = (ret.payments || []).map((p) => {
    const out = { ...p, id: String(p._id) };
    delete out._id;
    return out;
  });
  const paid = ret.payments.reduce((a, p) => a + p.amount, 0);
  ret.paid = paid;
  ret.balance = Math.max(0, ret.amount - paid);
  const status = ret.balance === 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
  ret.status = status;
  ret.overdue = status !== "paid" && new Date(ret.dueDate) < today;
  return ret;
}

module.exports = mongoose.model("FeeInvoice", feeInvoiceSchema);
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
module.exports.withBalance = withBalance;
