const ApiError = require("../utils/ApiError");
const { findSession } = require("../services/authService");
const { SESSION_COOKIE } = require("../constants/auth");

// Every route mounted after this requires a valid, unexpired session.
async function requireAuth(req, _res, next) {
  try {
    const session = await findSession(req.cookies?.[SESSION_COOKIE]);
    if (!session) {
      return next(new ApiError(401, "Please sign in to continue."));
    }
    req.user = session.user;
    req.session = session;
    req.log = req.log?.child({ userId: session.user.id });
    return next();
  } catch (err) {
    return next(err);
  }
}

// Cookie-authenticated writes must be JSON. Browsers cannot send a
// cross-site JSON request without a CORS preflight, which we reject, so this
// plus SameSite=Strict cookies blocks CSRF.
function requireJsonForWrites(req, _res, next) {
  // DELETE has no body, so it is covered by SameSite=Strict alone.
  if (["POST", "PUT", "PATCH"].includes(req.method) && !req.is("application/json")) {
    return next(new ApiError(415, "Requests must be sent as application/json"));
  }
  return next();
}

module.exports = { requireAuth, requireJsonForWrites };
