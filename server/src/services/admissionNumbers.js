const Counter = require("../models/Counter");

// GVPS-2026-00001: school code, academic start year, sequence per school+year.
async function nextAdmissionNumber(school, academicYear, session) {
  const year = academicYear.slice(0, 4);
  const seq = await Counter.next(`admission:${school.code}:${year}`, session);
  return `${school.code}-${year}-${String(seq).padStart(5, "0")}`;
}

module.exports = { nextAdmissionNumber };
