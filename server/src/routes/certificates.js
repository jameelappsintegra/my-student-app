// Transfer, bonafide, character and study certificates.
const router = require("express").Router();
const crypto = require("crypto");
const { z } = require("zod");
const Certificate = require("../models/Certificate");
const { CERTIFICATE_TYPES } = require("../models/Certificate");
const Student = require("../models/Student");
const School = require("../models/School");
const Counter = require("../models/Counter");
const { validate, validateId } = require("../middleware/validate");
const { requirePermission: perm, scoped, isFamily } = require("../middleware/authorize");
const { can } = require("../constants/permissions");
const { objectId, optionalText } = require("../validators/common");
const { assertSchool, schoolFilter, inSchool } = require("../services/schoolAccess");
const { listFees } = require("../services/recordsService");
const { getSettings, money } = require("../services/schoolSettings");
const { notify, parentsOf } = require("../services/notificationService");
const ApiError = require("../utils/ApiError");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const { toPublic } = require("../utils/serialize");

const PREFIX = { transfer: "TC", bonafide: "BC", character: "CC", study: "SC" };
const LABEL = { transfer: "Transfer certificate", bonafide: "Bonafide certificate", character: "Character certificate", study: "Study certificate" };
const isoDay = /^\d{4}-\d{2}-\d{2}$/;

const fullName = (s) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ");
const snapshotOf = (s) => ({
  name: fullName(s),
  admissionNumber: s.admissionNumber,
  dateOfBirth: s.dateOfBirth,
  gender: s.gender,
  nationality: s.nationality,
  father: s.father?.name,
  mother: s.mother?.name,
  guardian: s.guardian?.name,
  className: s.className,
  section: s.section,
  rollNumber: s.rollNumber,
  academicYear: s.academicYear,
  admissionDate: s.admissionDate,
  address: s.address,
});

const present = (c) => ({ ...toPublic(c), label: LABEL[c.type], issuedBy: c.issuedBy?.name || undefined, school: c.school?.name ? { id: String(c.school._id), name: c.school.name, code: c.school.code, address: c.school.address, city: c.school.city, phone: c.school.phone, email: c.school.email, board: c.school.board, principalName: c.school.principalName } : c.school });

router.get("/", perm("certificates.issue"), validate(z.object({ school: objectId.optional(), type: z.enum(CERTIFICATE_TYPES).optional(), student: objectId.optional() }).strict(), "query"), h(async (req, res) => {
  const q = req.valid.query;
  const filter = { ...schoolFilter(req.user, q.school), ...(q.type ? { type: q.type } : {}), ...(q.student ? { student: q.student } : {}) };
  const rows = await Certificate.find(filter).sort({ issuedAt: -1 }).limit(300).populate("issuedBy", "name").lean();
  sendSuccess(res, { message: "Certificates", data: rows.map(present) });
}));

router.post(
  "/",
  perm("certificates.issue"),
  validate(z.object({
    student: objectId,
    type: z.enum(CERTIFICATE_TYPES),
    purpose: optionalText(200),
    leavingDate: z.string().regex(isoDay, "Use a date like 2026-12-10").optional(),
    reason: optionalText(200),
    conduct: optionalText(60),
    remarks: optionalText(500),
    // Issue a TC even though fees are unpaid (the dues are printed on it).
    ignoreDues: z.boolean().optional(),
  }).strict().superRefine((d, ctx) => {
    if (d.type === "transfer" && !d.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "Give the reason for leaving" });
    if (d.type === "bonafide" && !d.purpose) ctx.addIssue({ code: "custom", path: ["purpose"], message: "Say what the certificate is for (e.g. passport, scholarship)" });
  })),
  h(async (req, res) => {
    const b = req.valid.body;
    const student = await Student.findOne({ _id: b.student, deletedAt: null });
    if (!student) throw ApiError.notFound("Student not found");
    assertSchool(req.user, student.school, "student");
    const school = await School.findById(student.school).select("code").lean();
    let duesCleared;
    if (b.type === "transfer") {
      if (await Certificate.exists({ student: student._id, type: "transfer", status: "issued" })) throw ApiError.conflict("A transfer certificate was already issued for this student. Cancel it to issue a new one.");
      if (student.status !== "active") throw ApiError.badRequest(`This student is ${student.status}; a TC is issued only for active students.`);
      const fees = await listFees(student._id);
      duesCleared = fees.summary.balance === 0;
      if (!duesCleared && !b.ignoreDues) {
        const settings = await getSettings(student.school);
        throw new ApiError(409, `${money(settings, fees.summary.balance)} in fees is still due. Collect it, or confirm to issue the TC anyway.`, [{ field: "ignoreDues", message: "Fees due" }]);
      }
    } else if (student.status !== "active") {
      throw ApiError.badRequest(`This student is ${student.status}; only active students get a ${LABEL[b.type].toLowerCase()}.`);
    }
    const year = new Date().getUTCFullYear();
    const seq = await Counter.next(`cert:${school.code}:${PREFIX[b.type]}:${year}`);
    const cert = await Certificate.create({
      school: student.school,
      student: student._id,
      type: b.type,
      serialNumber: `${school.code}/${PREFIX[b.type]}/${year}/${String(seq).padStart(4, "0")}`,
      verificationCode: crypto.randomBytes(8).toString("hex").slice(0, 12).toUpperCase(),
      issuedAt: new Date(),
      issuedBy: req.user._id,
      purpose: b.purpose,
      snapshot: snapshotOf(student),
      ...(b.type === "transfer" ? { leavingDate: b.leavingDate ? new Date(`${b.leavingDate}T00:00:00.000Z`) : new Date(), reason: b.reason, conduct: b.conduct || "Good", duesCleared, previousStatus: student.status } : {}),
      ...(b.type === "character" ? { conduct: b.conduct || "Good" } : {}),
      remarks: b.remarks,
    });
    if (b.type === "transfer") {
      // The student leaves the school roll; their record is kept.
      student.status = "transferred";
      await student.save();
    }
    const family = await parentsOf([student._id]);
    await notify(family.map((u) => u._id), { type: "certificate", title: `${LABEL[b.type]} issued`, body: `${fullName(student)}: ${cert.serialNumber}`, link: `/certificates/${cert.id}` });
    req.log.info({ event: "certificate.issue", certificateId: cert.id, type: b.type, studentId: b.student, serial: cert.serialNumber }, "Certificate issued");
    sendSuccess(res, { status: 201, message: `${LABEL[b.type]} ${cert.serialNumber} issued.${b.type === "transfer" ? " The student is now marked as transferred." : ""}`, data: cert });
  })
);

// Printable certificate: issuing staff, or the student's own family.
router.get("/:id", validateId, h(async (req, res) => {
  const c = await Certificate.findById(req.params.id).populate("school", "name code address city phone email board principalName").populate("issuedBy", "name").lean();
  if (!c) throw ApiError.notFound("Certificate not found");
  const staffOk = can(req.user, "certificates.issue") && inSchool(req.user, c.school._id);
  const familyOk = isFamily(req.user) && (await Student.exists(scoped(req.user, { _id: c.student })));
  if (!staffOk && !familyOk) throw ApiError.notFound("Certificate not found");
  sendSuccess(res, { message: "Certificate", data: present(c) });
}));

router.post("/:id/cancel", validateId, perm("certificates.issue"), validate(z.object({ reason: z.string().trim().min(3, "Give a reason").max(300) }).strict()), h(async (req, res) => {
  const c = await Certificate.findById(req.params.id);
  if (!c) throw ApiError.notFound("Certificate not found");
  assertSchool(req.user, c.school, "certificate");
  if (c.status === "cancelled") throw ApiError.conflict("This certificate is already cancelled.");
  c.set({ status: "cancelled", cancelledAt: new Date(), cancelReason: req.valid.body.reason });
  await c.save();
  let restored = false;
  if (c.type === "transfer") {
    // Undo the TC's status change if nothing else changed it since.
    const r = await Student.updateOne({ _id: c.student, status: "transferred", deletedAt: null }, { $set: { status: c.previousStatus || "active" } });
    restored = r.modifiedCount > 0;
  }
  req.log.info({ event: "certificate.cancel", certificateId: c.id, serial: c.serialNumber }, "Certificate cancelled");
  sendSuccess(res, { message: `${c.serialNumber} cancelled.${restored ? " The student is back on the roll." : ""}`, data: c });
}));

module.exports = router;

// Public check of a printed certificate (no sign-in): shows only what is
// already printed on it, and only for the exact random code.
const verifyRouter = require("express").Router();
verifyRouter.get("/certificates/verify/:code", h(async (req, res) => {
  const code = String(req.params.code || "").toUpperCase();
  if (!/^[A-F0-9]{12}$/.test(code)) throw ApiError.notFound("No certificate matches this code.");
  const c = await Certificate.findOne({ verificationCode: code }).populate("school", "name city").lean();
  if (!c) throw ApiError.notFound("No certificate matches this code.");
  sendSuccess(res, {
    message: c.status === "issued" ? "This certificate is genuine." : "This certificate was cancelled.",
    data: { valid: c.status === "issued", type: LABEL[c.type], serialNumber: c.serialNumber, name: c.snapshot?.name, school: c.school?.name, city: c.school?.city, issuedAt: c.issuedAt, status: c.status },
  });
}));
module.exports.verifyRouter = verifyRouter;
