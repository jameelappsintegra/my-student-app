const {
  z,
  personalFields,
  classCode,
  academicYear,
  paginationQuery,
  optionalText,
} = require("./common");
const { ADMISSION_STATUSES } = require("../constants");

// A parent/guardian must be reachable for every application.
const hasContact = (data) =>
  Boolean(
    data.father?.phone ||
      data.mother?.phone ||
      data.guardian?.phone ||
      data.emergencyContact?.phone
  );

const createAdmission = z
  .object({
    ...personalFields,
    classApplied: classCode,
    academicYear,
    saveAsDraft: z.boolean().optional(),
  })
  .strict()
  .refine((d) => d.father?.name || d.mother?.name || d.guardian?.name, {
    message: "Enter at least one parent or guardian name",
    path: ["father", "name"],
  })
  .refine(hasContact, {
    message: "Enter at least one parent, guardian or emergency phone number",
    path: ["father", "phone"],
  });

const listAdmissions = z
  .object({
    ...paginationQuery,
    status: z.enum(ADMISSION_STATUSES).optional(),
    classApplied: classCode.optional(),
    academicYear: academicYear.optional(),
    sort: z
      .enum(["createdAt", "-createdAt", "lastName", "-lastName"])
      .default("-createdAt"),
  })
  .strict();

const updateStatus = z
  .object({
    status: z.enum(ADMISSION_STATUSES),
    note: optionalText(1000),
  })
  .strict();

const enroll = z
  .object({
    section: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{1,5}$/, "Section must be letters, e.g. A")
      .optional(),
    rollNumber: z.coerce.number().int().min(1).max(9999).optional(),
    admissionDate: z.coerce.date().optional(),
  })
  .strict();

module.exports = { createAdmission, listAdmissions, updateStatus, enroll };
