const {
  z,
  personalFields,
  classCode,
  academicYear,
  paginationQuery,
  optionalText,
} = require("./common");
const { STUDENT_STATUSES } = require("../constants");

const section = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{1,5}$/, "Section must be letters, e.g. A");

const listStudents = z
  .object({
    ...paginationQuery,
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

// Students are created through the admission workflow; direct edits cover
// the fields that can change after enrolment.
const updateStudent = z
  .object({
    ...Object.fromEntries(
      Object.entries(personalFields).map(([k, v]) => [k, v.optional()])
    ),
    className: classCode.optional(),
    section: section.optional(),
    rollNumber: z.coerce.number().int().min(1).max(9999).optional(),
    medicalNotes: optionalText(2000),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update");

const updateStatus = z
  .object({ status: z.enum(STUDENT_STATUSES) })
  .strict();

module.exports = { listStudents, updateStudent, updateStatus };
