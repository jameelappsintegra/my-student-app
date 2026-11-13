const express = require("express");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const h = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { sendSuccess } = require("../utils/response");
const auth = require("../services/authService");
const { SESSION_COOKIE } = require("../constants/auth");
const { cookieSecure, loginRateLimitMax } = require("../config/env");

const cookieOptions = () => ({
  httpOnly: true,
  secure: cookieSecure,
  sameSite: "strict",
  path: "/",
});

// Per-IP brute-force limit on top of per-account lockout.
const makeLoginLimiter = (limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
      success: false,
      message: "Too many sign-in attempts. Try again in 15 minutes.",
    },
  });

const loginSchema = z
  .object({
    username: z.string().trim().min(1, "Enter your username").max(40),
    password: z.string().min(1, "Enter your password").max(128),
  })
  .strict();

function authRouter({ loginLimit = loginRateLimitMax } = {}) {
  const router = express.Router();
  router.post(
    "/login",
    makeLoginLimiter(loginLimit),
    validate(loginSchema),
    h(async (req, res) => {
      const result = await auth.login(req.valid.body, {
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      const audit = {
        event: "auth.login",
        username: req.valid.body.username,
        ip: req.ip,
      };
      if (result.error) {
        req.log.warn({ ...audit, outcome: result.error }, "Sign-in failed");
        throw new ApiError(
          401,
          result.error === "locked"
            ? "Too many failed attempts. This account is locked for 15 minutes."
            : "Incorrect username or password."
        );
      }
      req.log.info(
        { ...audit, outcome: "success", userId: result.user.id },
        "Signed in"
      );
      res.cookie(SESSION_COOKIE, result.token, {
        ...cookieOptions(),
        expires: result.expiresAt,
      });
      sendSuccess(res, {
        message: "Signed in",
        data: { user: result.user, expiresAt: result.expiresAt },
      });
    })
  );

  router.post(
    "/logout",
    h(async (req, res) => {
      await auth.logout(req.cookies?.[SESSION_COOKIE]);
      res.clearCookie(SESSION_COOKIE, cookieOptions());
      req.log.info({ event: "auth.logout" }, "Signed out");
      sendSuccess(res, { message: "Signed out" });
    })
  );

  router.get(
    "/me",
    requireAuth,
    h(async (req, res) => {
      sendSuccess(res, {
        message: "Current user",
        data: { user: req.user, expiresAt: req.session.expiresAt },
      });
    })
  );

  return router;
}

module.exports = authRouter;
