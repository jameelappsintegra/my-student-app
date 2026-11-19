const router = require("express").Router();
const { z } = require("zod");
const { validate, validateId } = require("../middleware/validate");
const { requirePermission: perm } = require("../middleware/authorize");
const { optionalText } = require("../validators/common");
const shares = require("../services/shareService");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const scopes = z.array(z.enum(shares.SHARE_SCOPES)).min(1, "Choose what you need to see").max(4);
const audit = (req, event, extra) => req.log.info({ event, actor: req.user.id, ...extra }, event);

router.get("/", validate(z.object({ box: z.enum(["incoming", "outgoing"]).default("outgoing") }).strict(), "query"), h(async (req, res) => {
  sendSuccess(res, { message: "Shares", data: await shares.list(req.user, req.valid.query.box) });
}));

router.post(
  "/",
  perm("shares.request"),
  validate(z.object({
    admissionNumber: z.string().trim().min(3, "Enter the admission number").max(30),
    scopes,
    reason: z.string().trim().min(10, "Explain why you need access (at least 10 characters)").max(500),
    days: z.coerce.number().int().min(1).max(180).default(30),
  }).strict()),
  h(async (req, res) => {
    const r = await shares.requestAccess(req.user, req.valid.body);
    audit(req, "share.request", { shareId: r.id });
    sendSuccess(res, { status: 201, message: `Request sent to ${r.school}.`, data: r });
  })
);

router.post(
  "/:id/decision",
  validateId,
  perm("shares.approve"),
  validate(z.object({ approve: z.boolean(), scopes: scopes.optional(), days: z.coerce.number().int().min(1).max(180).optional(), note: optionalText(500) }).strict()),
  h(async (req, res) => {
    const s = await shares.decide(req.user, req.params.id, req.valid.body);
    audit(req, "share.decision", { shareId: s.id, status: s.status, scopes: s.scopes });
    sendSuccess(res, { message: s.status === "approved" ? `Access approved until ${s.expiresAt.toISOString().slice(0, 10)}.` : "Request rejected.", data: s });
  })
);

router.post("/:id/revoke", validateId, h(async (req, res) => {
  const s = await shares.revoke(req.user, req.params.id);
  audit(req, "share.revoke", { shareId: s.id });
  sendSuccess(res, { message: "Access revoked.", data: s });
}));

module.exports = router;
