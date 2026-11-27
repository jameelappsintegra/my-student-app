// Per-school settings with defaults. Every feature that depends on the
// school's currency, time zone, grading scale or calendar reads it here.
const School = require("../models/School");

const CBSE_SCALE = [
  { min: 91, grade: "A1", remark: "Outstanding" },
  { min: 81, grade: "A2", remark: "Excellent" },
  { min: 71, grade: "B1", remark: "Very good" },
  { min: 61, grade: "B2", remark: "Good" },
  { min: 51, grade: "C1", remark: "Fair" },
  { min: 41, grade: "C2", remark: "Average" },
  { min: 33, grade: "D", remark: "Pass" },
  { min: 0, grade: "E", remark: "Needs improvement" },
];

const DEFAULTS = Object.freeze({
  currency: "INR",
  locale: "en-IN",
  timezone: "Asia/Kolkata",
  academicYearStartMonth: 4,
  weeklyOffs: [0],
  passPercentage: 33,
  gradingScale: CBSE_SCALE,
  terms: [],
  holidays: [],
  library: { finePerDay: 2, loanDays: 14, maxBooks: 3 },
  homework: { allowLate: true },
});

const iso = (d) => new Date(d).toISOString().slice(0, 10);

// Merges stored values over the defaults; dates come back as YYYY-MM-DD.
function resolve(stored = {}) {
  const s = stored || {};
  const pick = (k) => (s[k] === undefined || s[k] === null || (Array.isArray(s[k]) && !s[k].length && k !== "weeklyOffs" && k !== "terms" && k !== "holidays") ? DEFAULTS[k] : s[k]);
  return {
    currency: pick("currency"),
    locale: pick("locale"),
    timezone: pick("timezone"),
    academicYearStartMonth: pick("academicYearStartMonth"),
    weeklyOffs: s.weeklyOffs ? [...s.weeklyOffs] : [...DEFAULTS.weeklyOffs],
    passPercentage: pick("passPercentage"),
    gradingScale: [...pick("gradingScale")].map(({ min, grade, remark }) => ({ min, grade, remark })).sort((a, b) => b.min - a.min),
    terms: (s.terms || []).map((t) => ({ name: t.name, start: iso(t.start), end: iso(t.end) })),
    holidays: (s.holidays || []).map((h) => ({ date: iso(h.date), name: h.name })).sort((a, b) => a.date.localeCompare(b.date)),
    library: { ...DEFAULTS.library, ...Object.fromEntries(Object.entries(s.library || {}).filter(([, v]) => v !== undefined && v !== null)) },
    homework: { ...DEFAULTS.homework, ...Object.fromEntries(Object.entries(s.homework || {}).filter(([, v]) => v !== undefined && v !== null)) },
  };
}

async function getSettings(schoolId) {
  if (!schoolId) return resolve();
  const school = await School.findById(schoolId).select("settings").lean();
  return resolve(school?.settings);
}

function gradeFor(settings, pct) {
  const scale = settings?.gradingScale || CBSE_SCALE;
  return (scale.find((b) => pct >= b.min) || scale[scale.length - 1]).grade;
}

// Today's date (YYYY-MM-DD) in the school's time zone.
function todayIn(timezone, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || DEFAULTS.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return iso(now);
  }
}

function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Is this UTC-midnight date a school day (not a weekly off or holiday)?
function isSchoolDay(settings, date) {
  const d = new Date(date);
  if ((settings.weeklyOffs || []).includes(d.getUTCDay())) return false;
  return !(settings.holidays || []).some((h) => h.date === iso(d));
}
const holidayName = (settings, date) => (settings.holidays || []).find((h) => h.date === iso(date))?.name;

function money(settings, amount) {
  try {
    return new Intl.NumberFormat(settings?.locale || DEFAULTS.locale, { style: "currency", currency: settings?.currency || DEFAULTS.currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${settings?.currency || DEFAULTS.currency} ${amount}`;
  }
}

// First day (YYYY-MM-DD) of the academic year containing `date`.
function academicYearStart(settings, date = new Date()) {
  const m = (settings?.academicYearStartMonth || 4) - 1;
  const d = new Date(date);
  const y = d.getUTCMonth() >= m ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

module.exports = { DEFAULTS, CBSE_SCALE, resolve, getSettings, gradeFor, todayIn, isValidTimezone, isSchoolDay, holidayName, money, academicYearStart };
