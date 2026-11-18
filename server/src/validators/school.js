const { z, optionalText, paginationQuery } = require("./common");
const { SCHOOL_BOARDS } = require("../constants");

const emptyToUndefined = (v) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const phone = z.preprocess(
  emptyToUndefined,
  z.string().trim().regex(/^\+?[0-9][0-9\s-]{6,18}$/, "Enter a valid phone number").optional()
);
const email = z.preprocess(emptyToUndefined, z.string().trim().email("Enter a valid email address").optional());

const fields = {
  name: z.string({ required_error: "School name is required" }).trim().min(2, "School name is required").max(120),
  code: z
    .string({ required_error: "Code is required" })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/, "Code must be 2–8 letters or digits, e.g. GVPS"),
  board: z.enum(SCHOOL_BOARDS).optional(),
  address: optionalText(300),
  city: optionalText(80),
  phone,
  email,
  principalName: optionalText(120),
  active: z.boolean().optional(),
};

const createSchool = z.object(fields).strict();
const updateSchool = z
  .object(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])))
  .strict()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update");
const listSchools = z
  .object({ ...paginationQuery, limit: z.coerce.number().int().min(1).max(100).default(50) })
  .strict();

module.exports = { createSchool, updateSchool, listSchools };
