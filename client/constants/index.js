// Keep in sync with server/src/constants/index.js.
export const CLASSES = [
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

export const classLabel = (code) =>
  CLASSES.find((c) => c.code === code)?.label || code;

export const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export const ADMISSION_STATUS = {
  draft: { label: "Draft", badge: "badge-ghost" },
  submitted: { label: "Submitted", badge: "badge-info" },
  under_review: { label: "Under review", badge: "badge-warning" },
  documents_required: { label: "Documents required", badge: "badge-warning" },
  approved: { label: "Approved", badge: "badge-success" },
  rejected: { label: "Rejected", badge: "badge-error" },
  enrolled: { label: "Enrolled", badge: "badge-primary" },
};

// Mirrors the server's allowed transitions, for showing the right buttons.
export const NEXT_ACTIONS = {
  draft: ["submitted", "rejected"],
  submitted: ["under_review", "rejected"],
  under_review: ["documents_required", "approved", "rejected"],
  documents_required: ["under_review", "rejected"],
  approved: ["rejected"],
  rejected: [],
  enrolled: [],
};

export const STUDENT_STATUS = {
  active: "badge-success",
  inactive: "badge-ghost",
  transferred: "badge-info",
  withdrawn: "badge-warning",
  graduated: "badge-primary",
};

// Academic years run April–March.
export function academicYearOptions(today = new Date()) {
  const start =
    today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return [start, start + 1].map((y) => `${y}-${y + 1}`);
}

// "2018-03-14T00:00:00.000Z" -> "14 Mar 2018" without timezone drift.
export function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
