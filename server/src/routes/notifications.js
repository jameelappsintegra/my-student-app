const router = require("express").Router();
const { z } = require("zod");
const Notification = require("../models/Notification");
const { validate } = require("../middleware/validate");
const { objectId } = require("../validators/common");
const h = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const { toPublic } = require("../utils/serialize");

router.get("/", validate(z.object({ unread: z.enum(["true", "false"]).optional() }).strict(), "query"), h(async (req, res) => {
  const filter = { user: req.user._id, ...(req.valid.query.unread === "true" ? { readAt: null } : {}) };
  const [rows, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(50).lean(),
    Notification.countDocuments({ user: req.user._id, readAt: null }),
  ]);
  sendSuccess(res, { message: "Notifications", data: { items: rows.map(toPublic), unread } });
}));

router.post("/read", validate(z.object({ ids: z.array(objectId).max(100).optional(), all: z.boolean().optional() }).strict()), h(async (req, res) => {
  const filter = { user: req.user._id, readAt: null, ...(req.valid.body.all ? {} : { _id: { $in: req.valid.body.ids || [] } }) };
  const { modifiedCount } = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  sendSuccess(res, { message: "Marked as read", data: { updated: modifiedCount } });
}));

module.exports = router;
