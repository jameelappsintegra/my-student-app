const { z, optionalText, academicYear } = require("./common");
const { ATTENDANCE_STATUSES } = require("../models/Attendance");
const { PAYMENT_METHODS } = require("../models/FeeInvoice");

const emptyToUndefined = (v) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-18")
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()), "Enter a valid date");
const notFuture = (s) => new Date(`${s}T00:00:00Z`) <= new Date();

const attendanceRange = z
  .object({ from: isoDay.optional(), to: isoDay.optional() })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, "From must be before To");
const markAttendance = z
  .object({ status: z.enum(ATTENDANCE_STATUSES), note: optionalText(200) })
  .strict();
const attendanceDate = isoDay.refine(notFuture, "Attendance can't be marked for a future date");

const subject = z
  .object({
    subject: z.string().trim().min(1, "Enter the subject").max(60),
    maxMarks: z.coerce.number().int().min(1).max(1000),
    marks: z.coerce.number().min(0, "Marks can't be negative").max(1000),
  })
  .strict()
  .refine((s) => s.marks <= s.maxMarks, { message: "Marks can't exceed the maximum", path: ["marks"] });

const resultFields = {
  academicYear,
  exam: z.string().trim().min(1, "Enter the exam name").max(60),
  examDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  subjects: z
    .array(subject)
    .min(1, "Add at least one subject")
    .max(15)
    .refine(
      (list) => new Set(list.map((s) => s.subject.toLowerCase())).size === list.length,
      "Each subject can appear only once"
    ),
  remarks: optionalText(500),
};
const createResult = z.object(resultFields).strict();
const updateResult = z
  .object(Object.fromEntries(Object.entries(resultFields).map(([k, v]) => [k, v.optional()])))
  .strict()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update");

const rupees = z.coerce.number().int("Use whole rupees").min(1, "Amount must be at least ₹1").max(10000000);
const createInvoice = z
  .object({
    academicYear,
    title: z.string().trim().min(1, "Enter what the fee is for").max(80),
    amount: rupees,
    dueDate: z.coerce.date({ invalid_type_error: "Enter a due date" }),
  })
  .strict();
const updateInvoice = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    amount: rupees.optional(),
    dueDate: z.coerce.date().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update");
const recordPayment = z
  .object({
    amount: rupees,
    method: z.enum(PAYMENT_METHODS, { errorMap: () => ({ message: "Choose how it was paid" }) }),
    paidAt: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
    reference: optionalText(60),
  })
  .strict()
  .refine((p) => !p.paidAt || p.paidAt <= new Date(), { message: "Payment date can't be in the future", path: ["paidAt"] });

const search = z.object({ q: z.string().trim().min(1).max(100), limit: z.coerce.number().int().min(1).max(20).default(8) }).strict();

module.exports = {
  attendanceRange,
  markAttendance,
  attendanceDate,
  createResult,
  updateResult,
  createInvoice,
  updateInvoice,
  recordPayment,
  search,
};
