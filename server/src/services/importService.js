// Bulk student import from CSV. Every row is checked first; nothing is saved
// unless the whole file is valid, and then all rows go in one transaction.
const mongoose = require("mongoose");
const { parse } = require("csv-parse/sync");
const Student = require("../models/Student");
const School = require("../models/School");
const { buildDedupeKey } = require("../models/common");
const { createStudent: schema } = require("../validators/student");
const { nextAdmissionNumber } = require("./admissionNumbers");
const { canTeach } = require("../middleware/authorize");
const ApiError = require("../utils/ApiError");

const MAX_ROWS = 2000;

// Template columns; the first eight are required.
const COLUMNS = [
  "school_code", "first_name", "last_name", "date_of_birth", "gender", "class", "address", "academic_year",
  "middle_name", "section", "roll_number", "admission_date", "blood_group", "nationality", "previous_school",
  "student_phone", "student_email", "transport", "bus_route",
  "father_name", "father_phone", "father_email", "father_occupation",
  "mother_name", "mother_phone", "mother_email", "mother_occupation",
  "guardian_name", "guardian_relation", "guardian_phone",
  "emergency_name", "emergency_relation", "emergency_phone",
];

const norm = (h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const ALIASES = { dob: "date_of_birth", birth_date: "date_of_birth", standard: "class", grade: "class", roll: "roll_number", roll_no: "roll_number", school: "school_code", phone: "student_phone", email: "student_email" };

// 2016-04-02, 02/04/2016, 02-04-2016, 2.4.2016 → 2016-04-02 (day first).
function isoDate(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return s; // left for the validator to reject
}
const GENDER = { m: "male", male: "male", boy: "male", f: "female", female: "female", girl: "female", o: "other", other: "other" };
const ROMAN = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10", xi: "11", xii: "12" };
function classCode(v) {
  const s = String(v || "").trim().toUpperCase().replace(/^(CLASS|STD|STANDARD|GRADE)\.?\s*/, "");
  if (["LKG", "UKG"].includes(s)) return s;
  if (/^\d{1,2}$/.test(s)) return String(Number(s));
  return ROMAN[s.toLowerCase()] || s;
}
const TRANSPORT = { bus: "school_bus", school_bus: "school_bus", "school bus": "school_bus", private: "private", car: "private", walk: "walking", walking: "walking", other: "other" };

function currentYear() {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

function toInput(r, schoolId) {
  const blank = (v) => (v === undefined || v === null ? "" : String(v).trim());
  return {
    school: schoolId,
    firstName: blank(r.first_name),
    middleName: blank(r.middle_name),
    lastName: blank(r.last_name),
    dateOfBirth: isoDate(r.date_of_birth),
    gender: GENDER[blank(r.gender).toLowerCase()] || blank(r.gender).toLowerCase(),
    className: classCode(r.class),
    section: blank(r.section).toUpperCase(),
    rollNumber: blank(r.roll_number),
    academicYear: blank(r.academic_year) || currentYear(),
    admissionDate: isoDate(r.admission_date),
    address: blank(r.address),
    bloodGroup: blank(r.blood_group).toUpperCase(),
    nationality: blank(r.nationality),
    previousSchool: blank(r.previous_school),
    phone: blank(r.student_phone),
    email: blank(r.student_email),
    transport: TRANSPORT[blank(r.transport).toLowerCase()] || blank(r.transport),
    busRoute: blank(r.bus_route),
    father: { name: blank(r.father_name), phone: blank(r.father_phone), email: blank(r.father_email), occupation: blank(r.father_occupation) },
    mother: { name: blank(r.mother_name), phone: blank(r.mother_phone), email: blank(r.mother_email), occupation: blank(r.mother_occupation) },
    guardian: { name: blank(r.guardian_name), relation: blank(r.guardian_relation), phone: blank(r.guardian_phone) },
    emergencyContact: { name: blank(r.emergency_name), relation: blank(r.emergency_relation), phone: blank(r.emergency_phone) },
  };
}

function parseCsv(buffer) {
  let records;
  try {
    records = parse(buffer, {
      bom: true,
      columns: (header) => header.map((h) => ALIASES[norm(h)] || norm(h)),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err) {
    throw ApiError.badRequest(`The file isn't valid CSV: ${err.message.split(":")[0]}.`);
  }
  if (!records.length) throw ApiError.badRequest("The file has no student rows.");
  if (records.length > MAX_ROWS) throw ApiError.badRequest(`Import at most ${MAX_ROWS} students at a time (this file has ${records.length}).`);
  const missing = ["school_code", "first_name", "last_name", "date_of_birth", "gender", "class", "address"].filter((c) => !(c in records[0]));
  if (missing.length) throw ApiError.badRequest(`Missing columns: ${missing.join(", ")}. Download the template to see the expected layout.`);
  return records;
}

async function validateRows(records, user) {
  const codes = [...new Set(records.map((r) => String(r.school_code || "").trim().toUpperCase()).filter(Boolean))];
  const schools = new Map((await School.find({ code: { $in: codes } }).lean()).map((s) => [s.code, s]));
  const errors = [];
  const rows = [];
  const seenKeys = new Map();
  const seenRolls = new Map();

  records.forEach((raw, i) => {
    const rowNo = i + 2; // spreadsheet row (header is row 1)
    const err = (field, message) => errors.push({ row: rowNo, field, message });
    const code = String(raw.school_code || "").trim().toUpperCase();
    const school = schools.get(code);
    if (!school) return err("school_code", code ? `No school with code ${code}` : "School code is required");
    if (!school.active) return err("school_code", `${school.name} is not accepting new students`);
    const parsed = schema.safeParse(toInput(raw, String(school._id)));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) err(issue.path.join(".") || "row", issue.message);
      return undefined;
    }
    const s = parsed.data;
    if (!canTeach(user, { school: String(school._id), className: s.className, section: s.section })) {
      return err("class", `You can't import into ${code} class ${s.className}${s.section ? ` ${s.section}` : ""}`);
    }
    const key = buildDedupeKey(s);
    if (seenKeys.has(key)) return err("first_name", `Same student as row ${seenKeys.get(key)}`);
    seenKeys.set(key, rowNo);
    if (s.rollNumber) {
      const rk = `${school._id}|${s.academicYear}|${s.className}|${s.section || ""}|${s.rollNumber}`;
      if (seenRolls.has(rk)) return err("roll_number", `Roll ${s.rollNumber} is also used in row ${seenRolls.get(rk)}`);
      seenRolls.set(rk, rowNo);
    }
    rows.push({ rowNo, school, data: s, key });
    return undefined;
  });

  // Against the database: existing students and roll numbers.
  if (rows.length) {
    const existing = await Student.find({ dedupeKey: { $in: rows.map((r) => r.key) }, deletedAt: null }).select("dedupeKey admissionNumber").lean();
    const byKey = new Map(existing.map((e) => [e.dedupeKey, e.admissionNumber]));
    const withRoll = rows.filter((r) => r.data.rollNumber);
    const taken = withRoll.length
      ? await Student.find({ $or: withRoll.map((r) => ({ school: r.school._id, academicYear: r.data.academicYear, className: r.data.className, section: r.data.section || undefined, rollNumber: r.data.rollNumber })), deletedAt: null })
          .select("school academicYear className section rollNumber admissionNumber")
          .lean()
      : [];
    const rollKey = (x) => `${x.school._id || x.school}|${x.academicYear}|${x.className}|${x.section || ""}|${x.rollNumber}`;
    const takenSet = new Map(taken.map((t) => [rollKey(t), t.admissionNumber]));
    for (const r of rows) {
      if (byKey.has(r.key)) errors.push({ row: r.rowNo, field: "first_name", message: `Already enrolled as ${byKey.get(r.key)}` });
      const rk = r.data.rollNumber && rollKey({ ...r.data, school: r.school._id });
      if (rk && takenSet.has(rk)) errors.push({ row: r.rowNo, field: "roll_number", message: `Roll ${r.data.rollNumber} belongs to ${takenSet.get(rk)}` });
    }
  }
  errors.sort((a, b) => a.row - b.row);
  return { rows, errors };
}

async function importStudents(buffer, user, { dryRun }) {
  const records = parseCsv(buffer);
  const { rows, errors } = await validateRows(records, user);
  const summary = {
    totalRows: records.length,
    validRows: 0,
    errors,
    preview: rows.slice(0, 10).map((r) => ({ row: r.rowNo, name: `${r.data.firstName} ${r.data.lastName}`, school: r.school.code, className: r.data.className, section: r.data.section || "", dateOfBirth: r.data.dateOfBirth.toISOString().slice(0, 10) })),
  };
  summary.validRows = records.length - new Set(errors.map((e) => e.row)).size;
  if (dryRun || errors.length) return { ...summary, imported: 0 };

  const session = await mongoose.startSession();
  try {
    let created = [];
    await session.withTransaction(async () => {
      const docs = [];
      for (const r of rows) {
        const admissionNumber = await nextAdmissionNumber(r.school, r.data.academicYear, session);
        docs.push({ ...r.data, admissionNumber, admissionDate: r.data.admissionDate || new Date() });
      }
      created = await Student.create(docs, { session, ordered: true });
    });
    return { ...summary, imported: created.length, admissionNumbers: [created[0].admissionNumber, created[created.length - 1].admissionNumber] };
  } finally {
    await session.endSession();
  }
}

function template() {
  const example = (o) => COLUMNS.map((c) => o[c] ?? "");
  const rows = [
    COLUMNS,
    example({ school_code: "GVPS", first_name: "Example", last_name: "Student", date_of_birth: "14/03/2018", gender: "F", class: "2", address: "12 Main Street", academic_year: currentYear(), section: "A", roll_number: "1", father_name: "Example Parent", father_phone: "9876543210", transport: "bus", bus_route: "Route 1" }),
  ];
  return `﻿${rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\r\n")}\r\n`;
}

module.exports = { importStudents, template, COLUMNS, MAX_ROWS, isoDate, classCode };
