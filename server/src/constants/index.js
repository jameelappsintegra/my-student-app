// Class codes are stored in the database; labels are for display only.
const CLASSES = [
  { code: "LKG", label: "LKG" },
  { code: "UKG", label: "UKG" },
  { code: "1", label: "First Standard" },
  { code: "2", label: "Second Standard" },
  { code: "3", label: "Third Standard" },
  { code: "4", label: "Fourth Standard" },
  { code: "5", label: "Fifth Standard" },
  { code: "6", label: "Sixth Standard" },
  { code: "7", label: "Seventh Standard" },
  { code: "8", label: "Eighth Standard" },
  { code: "9", label: "Ninth Standard" },
  { code: "10", label: "Tenth Standard" },
  { code: "11", label: "Eleventh Standard" },
  { code: "12", label: "Twelfth Standard" },
];
const CLASS_CODES = CLASSES.map((c) => c.code);

const GENDERS = ["male", "female", "other"];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const STUDENT_STATUSES = [
  "active",
  "inactive",
  "transferred",
  "withdrawn",
  "graduated",
];

const ADMISSION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "documents_required",
  "approved",
  "rejected",
  "enrolled",
];

// Allowed manual status changes. "enrolled" is reached only through the
// enrol endpoint, which also creates the student record.
const ADMISSION_TRANSITIONS = {
  draft: ["submitted", "rejected"],
  submitted: ["under_review", "rejected"],
  under_review: ["documents_required", "approved", "rejected"],
  documents_required: ["under_review", "rejected"],
  approved: ["rejected"],
  rejected: [],
  enrolled: [],
};

const PENDING_ADMISSION_STATUSES = [
  "submitted",
  "under_review",
  "documents_required",
];

module.exports = {
  CLASSES,
  CLASS_CODES,
  GENDERS,
  BLOOD_GROUPS,
  STUDENT_STATUSES,
  ADMISSION_STATUSES,
  ADMISSION_TRANSITIONS,
  PENDING_ADMISSION_STATUSES,
};
