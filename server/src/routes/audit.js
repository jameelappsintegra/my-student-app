const router = require("express").Router();
const { z } = require("zod");
const AuditLog = require("../models/AuditLog");
const { validate } = require("../middleware/validate");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const { buildPagination, escapeRegex } = require("../utils/query");
const { toPublic } = require("../utils/serialize");

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
router.get("/", validate(z.object({
  event: z.string().trim().max(60).optional(),
  actor: z.string().trim().max(60).optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict(), "query"), h(async (req, res) => {
  const q = req.valid.query;
  const filter = {};
  if (q.event) filter.event = new RegExp(`^${escapeRegex(q.event)}`);
  if (q.actor) filter.actorName = new RegExp(escapeRegex(q.actor), "i");
  if (q.from || q.to) filter.at = { ...(q.from ? { $gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { $lte: new Date(`${q.to}T23:59:59Z`) } : {}) };
  const [rows, total, events] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    AuditLog.countDocuments(filter),
    AuditLog.distinct("event"),
  ]);
  sendSuccess(res, { message: "Audit log", data: { items: rows.map(toPublic), events: events.sort() }, pagination: buildPagination(q.page, q.limit, total) });
}));

module.exports = router;
