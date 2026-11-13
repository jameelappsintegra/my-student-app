const mongoose = require("mongoose");
const { CLASS_CODES, ADMISSION_STATUSES } = require("../constants");
const { personalFields, buildDedupeKey } = require("./common");
const { cleanTransform } = require("../utils/serialize");

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ADMISSION_STATUSES, required: true },
    note: { type: String, maxlength: 1000 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const admissionSchema = new mongoose.Schema(
  {
    applicationNumber: { type: String, required: true, unique: true },
    ...personalFields,
    classApplied: { type: String, enum: CLASS_CODES, required: true },
    academicYear: { type: String, required: true },
    status: { type: String, enum: ADMISSION_STATUSES, default: "submitted" },
    statusHistory: [statusHistorySchema],
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    dedupeKey: { type: String, required: true },
    // false once rejected, so the same child may re-apply later.
    isActiveApplication: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { transform: cleanTransform } }
);

// Blocks duplicate open applications even under concurrent requests.
admissionSchema.index(
  { dedupeKey: 1, academicYear: 1 },
  { unique: true, partialFilterExpression: { isActiveApplication: true } }
);
admissionSchema.index({ status: 1, createdAt: -1 });

admissionSchema.pre("validate", function setDedupeKey(next) {
  if (this.firstName && this.lastName && this.dateOfBirth) {
    this.dedupeKey = buildDedupeKey(this);
  }
  next();
});

module.exports = mongoose.model("Admission", admissionSchema);
