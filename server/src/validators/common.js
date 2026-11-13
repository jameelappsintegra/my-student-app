const { z } = require("zod");
const {
  CLASS_CODES,
  GENDERS,
  BLOOD_GROUPS,
} = require("../constants");

// Treat "" from HTML forms as "not provided".
const emptyToUndefined = (v) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optionalText = (max) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
const requiredText = (max, label) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max);

const phone = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{6,18}$/, "Enter a valid phone number")
    .optional()
);
const email = z.preprocess(
  emptyToUndefined,
  z.string().trim().email("Enter a valid email address").optional()
);

const academicYear = z
  .string()
  .regex(/^\d{4}-\d{4}$/, "Academic year must look like 2026-2027")
  .refine((v) => {
    const [a, b] = v.split("-").map(Number);
    return b === a + 1;
  }, "Academic year must span consecutive years");

const dateOfBirth = z.preprocess(
  (v) => (typeof v === "string" && v ? new Date(v) : v),
  z
    .date({
      required_error: "Date of birth is required",
      invalid_type_error: "Enter a valid date of birth",
    })
    .refine((d) => !Number.isNaN(d.getTime()), "Enter a valid date of birth")
    .refine((d) => d < new Date(), "Date of birth must be in the past")
    .refine((d) => {
      const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
      return age >= 2 && age <= 25;
    }, "Student must be between 2 and 25 years old")
);

const person = z
  .object({
    name: optionalText(120),
    phone,
    email,
    occupation: optionalText(120),
  })
  .strict();

const guardian = z
  .object({
    name: optionalText(120),
    relation: optionalText(60),
    phone,
    email,
  })
  .strict();

const emergencyContact = z
  .object({ name: optionalText(120), relation: optionalText(60), phone })
  .strict();

const personalFields = {
  firstName: requiredText(60, "First name"),
  middleName: optionalText(60),
  lastName: requiredText(60, "Last name"),
  dateOfBirth,
  gender: z.enum(GENDERS, { errorMap: () => ({ message: "Select a gender" }) }),
  bloodGroup: z.preprocess(emptyToUndefined, z.enum(BLOOD_GROUPS).optional()),
  nationality: optionalText(60),
  address: requiredText(500, "Address"),
  previousSchool: optionalText(200),
  father: person.optional(),
  mother: person.optional(),
  guardian: guardian.optional(),
  emergencyContact: emergencyContact.optional(),
};

const classCode = z.enum(CLASS_CODES, {
  errorMap: () => ({ message: "Select a valid class" }),
});

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: optionalText(100),
};

module.exports = {
  z,
  personalFields,
  classCode,
  academicYear,
  objectId,
  paginationQuery,
  optionalText,
};
