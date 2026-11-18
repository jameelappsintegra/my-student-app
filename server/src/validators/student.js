const {
  z,
  personalFields,
  classCode,
  academicYear,
  paginationQuery,
  optionalText,
  objectId,
  schoolRef,
} = require("./common");
const { STUDENT_STATUSES, TRANSPORT_MODES } = require("../constants");

const emptyToUndefined = (v) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const studentExtras = {
  email: z.preprocess(emptyToUndefined, z.string().trim().email("Enter a valid email address").optional()),
  phone: z.preprocess(
    emptyToUndefined,
    z.string().trim().regex(/^\+?[0-9][0-9\s-]{6,18}$/, "Enter a valid phone number").optional()
  ),
  transport: z.preprocess(emptyToUndefined, z.enum(TRANSPORT_MODES).optional()),
  busRoute: optionalText(60),
  medicalNotes: optionalText(2000),
};

const section = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{1,5}$/, "Section must be letters, e.g. A");

const listStudents = z
  .object({
    ...paginationQuery,
    school: objectId.optional(),
    className: classCode.optional(),
    section: section.optional(),
    status: z.enum(STUDENT_STATUSES).optional(),
    academicYear: academicYear.optional(),
    sort: z
      .enum([
        "lastName",
        "-lastName",
        "admissionNumber",
        "-admissionNumber",
        "rollNumber",
        "createdAt",
        "-createdAt",
      ])
      .default("lastName"),
  })
  .strict();

const rollNumber = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(1, "Roll number must be 1 or more").max(9999).optional()
);

// Direct registration of an existing student (for example when moving
// records into EduPro). New applicants go through admissions instead.
const createStudent = z
  .object({
    ...personalFields,
    ...studentExtras,
    school: schoolRef,
    className: classCode,
    academicYear,
    section: z.preprocess(emptyToUndefined, section.optional()),
    rollNumber,
    admissionDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  })
  .strict();

// The school and admission number are fixed once a student exists.
const updateStudent = z
  .object({
    ...Object.fromEntries(
      Object.entries(personalFields).map(([k, v]) => [k, v.optional()])
    ),
    ...studentExtras,
    className: classCode.optional(),
    academicYear: academicYear.optional(),
    section: z.preprocess(emptyToUndefined, section.optional()),
    rollNumber,
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update");

const updateStatus = z
  .object({ status: z.enum(STUDENT_STATUSES) })
  .strict();

module.exports = { listStudents, createStudent, updateStudent, updateStatus };
