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

export const TRANSPORT = {
  school_bus: "School bus",
  private: "Private vehicle",
  walking: "Walks to school",
  other: "Other",
};

// `cell` classes repeat the colour on hover: daisyUI's .btn:hover would
// otherwise win, and phones keep the hover state after a tap.
export const ATTENDANCE = {
  present: { label: "Present", short: "P", badge: "badge-success", cell: "bg-success text-success-content hover:bg-success" },
  absent: { label: "Absent", short: "A", badge: "badge-error", cell: "bg-error text-error-content hover:bg-error" },
  late: { label: "Late", short: "L", badge: "badge-warning", cell: "bg-warning text-warning-content hover:bg-warning" },
  half_day: { label: "Half day", short: "½", badge: "badge-warning", cell: "bg-warning/60 hover:bg-warning/60" },
  leave: { label: "Leave", short: "Lv", badge: "badge-info", cell: "bg-info text-info-content hover:bg-info" },
  holiday: { label: "Holiday", short: "H", badge: "badge-ghost", cell: "bg-base-300 text-slate-500 hover:bg-base-300" },
};

export const PAYMENT_METHODS = {
  upi: "UPI",
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
};

export const SCHOOL_BOARDS = ["CBSE", "ICSE", "State Board", "IB", "Other"];

export const FEE_STATUS = {
  paid: { label: "Paid", badge: "badge-success" },
  partial: { label: "Part paid", badge: "badge-warning" },
  unpaid: { label: "Unpaid", badge: "badge-ghost" },
  overdue: { label: "Overdue", badge: "badge-error" },
};

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const money = (n) => inr.format(n || 0);

export const fullName = (s) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");

// Age in whole years from an ISO date of birth.
export function ageFrom(iso, today = new Date()) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
