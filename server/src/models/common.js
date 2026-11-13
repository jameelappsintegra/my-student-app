const { Schema } = require("mongoose");
const { GENDERS } = require("../constants");

const personSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    occupation: { type: String, trim: true, maxlength: 120 },
  },
  { _id: false }
);

const guardianSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 120 },
    relation: { type: String, trim: true, maxlength: 60 },
    phone: { type: String, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  },
  { _id: false }
);

const emergencyContactSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 120 },
    relation: { type: String, trim: true, maxlength: 60 },
    phone: { type: String, trim: true, maxlength: 20 },
  },
  { _id: false }
);

// Fields shared by an admission applicant and an enrolled student.
const personalFields = {
  firstName: { type: String, required: true, trim: true, maxlength: 60 },
  middleName: { type: String, trim: true, maxlength: 60 },
  lastName: { type: String, required: true, trim: true, maxlength: 60 },
  dateOfBirth: { type: Date, required: true },
  gender: { type: String, enum: GENDERS, required: true },
  bloodGroup: { type: String },
  nationality: { type: String, trim: true, maxlength: 60 },
  address: { type: String, required: true, trim: true, maxlength: 500 },
  previousSchool: { type: String, trim: true, maxlength: 200 },
  father: personSchema,
  mother: personSchema,
  guardian: guardianSchema,
  emergencyContact: emergencyContactSchema,
};

// Normalised identity used to detect duplicate applications/students.
function buildDedupeKey({ firstName, lastName, dateOfBirth }) {
  const dob = new Date(dateOfBirth).toISOString().slice(0, 10);
  return `${firstName.trim().toLowerCase()}|${lastName
    .trim()
    .toLowerCase()}|${dob}`;
}

// Lower-cased name parts and record number, indexed for prefix search.
// A case-sensitive anchored regex (/^ais/) on this array can use the index,
// unlike a case-insensitive regex over the raw name fields.
function buildSearchTokens(doc, numberField) {
  return [doc.firstName, doc.middleName, doc.lastName, doc[numberField]]
    .filter(Boolean)
    .flatMap((v) => v.toLowerCase().split(/\s+/))
    .filter(Boolean);
}

module.exports = { personalFields, buildDedupeKey, buildSearchTokens };
