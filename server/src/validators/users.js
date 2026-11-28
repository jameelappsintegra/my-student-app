const { z, optionalText, classCode, objectId } = require("./common");
const { ROLES, GRANTABLE } = require("../constants/permissions");

const emptyToUndefined = (v) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const password = z
  .string({ required_error: "Enter a password" })
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters");
const assignment = z
  .object({
    school: objectId,
    className: classCode,
    section: z.preprocess(emptyToUndefined, z.string().trim().toUpperCase().regex(/^[A-Z]{1,5}$/, "Section must be letters").optional()),
  })
  .strict();
const fields = {
  name: z.string().trim().min(1, "Enter the person's name").max(120),
  phone: z.preprocess(emptyToUndefined, z.string().trim().regex(/^\+?[0-9][0-9\s-]{6,18}$/, "Enter a valid phone number").optional()),
  active: z.boolean().optional(),
  assignments: z.array(assignment).max(20).optional(),
  children: z.array(objectId).max(10).optional(),
  schools: z.array(objectId).max(20).optional(),
  student: objectId.optional(),
  grants: z.array(z.enum(Object.keys(GRANTABLE))).max(10).optional(),
};
const roleRules = (d, ctx) => {
  if (d.role !== "teacher" && d.assignments?.length) ctx.addIssue({ code: "custom", path: ["assignments"], message: "Only teachers have classes" });
  if (d.role !== "parent" && d.children?.length) ctx.addIssue({ code: "custom", path: ["children"], message: "Only parents have children linked" });
  if (d.role === "student" && !d.student) ctx.addIssue({ code: "custom", path: ["student"], message: "Choose the student this login is for" });
  if (d.role !== "student" && d.student) ctx.addIssue({ code: "custom", path: ["student"], message: "Only student logins are linked to a student record" });
  if (!["principal", "librarian"].includes(d.role) && d.schools?.length) ctx.addIssue({ code: "custom", path: ["schools"], message: "Only principals and librarians are linked to schools" });
  if (d.role === "librarian" && !d.schools?.length) ctx.addIssue({ code: "custom", path: ["schools"], message: "Choose the school whose library they run" });
  for (const g of d.grants || []) {
    if (!GRANTABLE[g].includes(d.role)) ctx.addIssue({ code: "custom", path: ["grants"], message: `${g} can't be given to a ${d.role}` });
  }
};

const createUser = z
  .object({
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, "3–40 letters, digits, dots, dashes or underscores"),
    password,
    role: z.enum(ROLES),
    ...fields,
  })
  .strict()
  .superRefine(roleRules);
const updateUser = z
  .object(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])))
  .strict()
  .refine((d) => Object.keys(d).length > 0, "Nothing to update");
const listUsers = z
  .object({
    role: z.enum(ROLES).optional(),
    search: optionalText(60),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
const resetPassword = z.object({ password }).strict();
const changePassword = z.object({ currentPassword: z.string().min(1, "Enter your current password").max(128), newPassword: password }).strict();

module.exports = { createUser, updateUser, listUsers, resetPassword, changePassword };
