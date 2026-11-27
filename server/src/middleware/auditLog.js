// Persists audit events. Any `req.log.info({ event, ... })` / `warn(...)`
// call is also stored in AuditLog with the signed-in user, IP and request id.
const AuditLog = require("../models/AuditLog");

const SKIP = new Set(["report.view"]); // noisy, read-only

function persist(req, obj) {
  if (!obj || typeof obj !== "object" || !obj.event || SKIP.has(obj.event)) return;
  const { event, ...details } = obj;
  AuditLog.create({
    event,
    actor: req.user?._id,
    actorName: req.user?.name || req.user?.username || details.username,
    actorRole: req.user?.role,
    ip: req.ip,
    requestId: req.id,
    details,
  }).catch(() => {}); // auditing must never break the request
}

module.exports = function auditLog(req, _res, next) {
  const wrap = (logger) => {
    // Own-property check: pino child loggers inherit from their parent,
    // including this marker, but need wrapping themselves.
    if (!logger || Object.prototype.hasOwnProperty.call(logger, "__audited")) return logger;
    const info = logger.info.bind(logger);
    const warn = logger.warn.bind(logger);
    const child = logger.child.bind(logger);
    logger.info = (obj, ...rest) => { persist(req, obj); return info(obj, ...rest); };
    logger.warn = (obj, ...rest) => { persist(req, obj); return warn(obj, ...rest); };
    logger.child = (...args) => wrap(child(...args));
    Object.defineProperty(logger, "__audited", { value: true });
    return logger;
  };
  req.log = wrap(req.log);
  next();
};
