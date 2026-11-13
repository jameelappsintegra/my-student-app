const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Session = require("../models/Session");
const { sessionHours, isTest } = require("../config/env");

// Cheaper hashing in tests only; 12 rounds (~250 ms) everywhere else.
const BCRYPT_ROUNDS = isTest ? 4 : 12;
// Compared against when the username does not exist, so the response time
// does not reveal which usernames are valid.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function validatePasswordStrength(password) {
  if (typeof password !== "string" || password.length < 12) {
    return "Password must be at least 12 characters";
  }
  if (password.length > 128) return "Password must be at most 128 characters";
  return null;
}

// Returns { user, token, expiresAt } or { error } with a generic message.
async function login({ username, password }, { ip, userAgent }) {
  const user = await User.findOne({ username: username.toLowerCase() }).select(
    "+passwordHash +failedLogins +lockedUntil"
  );
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !user.active) return { error: "invalid" };
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "locked", user };
  }
  if (!ok) {
    user.failedLogins += 1;
    if (user.failedLogins >= User.MAX_FAILED_LOGINS) {
      user.lockedUntil = new Date(Date.now() + User.LOCK_MINUTES * 60 * 1000);
      user.failedLogins = 0;
    }
    await user.save();
    return { error: user.lockedUntil > new Date() ? "locked" : "invalid", user };
  }

  user.failedLogins = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionHours * 3600 * 1000);
  await Session.create({
    tokenHash: hashToken(token),
    user: user._id,
    expiresAt,
    ip,
    userAgent: userAgent?.slice(0, 300),
  });
  return { user, token, expiresAt };
}

async function findSession(token) {
  if (!token || typeof token !== "string" || token.length > 100) return null;
  const session = await Session.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  }).populate("user");
  if (!session || !session.user || !session.user.active) return null;
  return session;
}

async function logout(token) {
  if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
}

module.exports = {
  hashPassword,
  validatePasswordStrength,
  login,
  findSession,
  logout,
  hashToken,
};
