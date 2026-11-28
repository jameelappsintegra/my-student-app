// Authorization: permission checks plus record-level scoping. A teacher or
// parent asking for a student outside their scope gets 404, the same answer
// as for a student that doesn't exist, so ids can't be probed.
const mongoose = require("mongoose");
const Student = require("../models/Student");
const ApiError = require("../utils/ApiError");
const { can } = require("../constants/permissions");

const NOTHING = { _id: { $in: [] } };

function requirePermission(permission) {
  return (req, _res, next) => {
    if (can(req.user, permission)) return next();
    req.log?.warn({ event: "authz.denied", permission, role: req.user?.role }, "Permission denied");
    return next(new ApiError(403, "You don't have permission to do that."));
  };
}

// Students a parent or student account belongs to.
const familyIds = (user) =>
  user?.role === "parent" ? (user.children || []).map((c) => String(c._id || c))
    : user?.role === "student" && user.student ? [String(user.student._id || user.student)]
      : [];
const isFamily = (user) => user?.role === "parent" || user?.role === "student";

// Mongo filter limiting students to what this user may see.
function studentScope(user) {
  if (!user) return NOTHING;
  if (user.role === "admin") return {};
  if (user.role === "teacher") {
    const list = user.assignments || [];
    if (!list.length) return NOTHING;
    return {
      $or: list.map((a) => ({
        school: new mongoose.Types.ObjectId(String(a.school)),
        className: a.className,
        ...(a.section ? { section: a.section } : {}),
      })),
    };
  }
  if (user.role === "principal" || user.role === "librarian") {
    const list = (user.schools || []).map((s) => new mongoose.Types.ObjectId(String(s._id || s)));
    return list.length ? { school: { $in: list } } : NOTHING;
  }
  if (isFamily(user)) {
    const kids = familyIds(user).map((c) => new mongoose.Types.ObjectId(c));
    return kids.length ? { _id: { $in: kids } } : NOTHING;
  }
  return NOTHING;
}

// Combines a query filter with the user's scope.
const scoped = (user, filter = {}) => {
  const scope = studentScope(user);
  return Object.keys(scope).length ? { $and: [filter, scope] } : filter;
};

// For /students/:id/... routes.
async function requireStudentAccess(req, _res, next) {
  try {
    if (req.user.role === "admin") return next();
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return next(ApiError.badRequest("Invalid id"));
    const ok = await Student.exists(scoped(req.user, { _id: id, deletedAt: null }));
    if (ok) return next();
    // Not theirs: an approved cross-school share may still allow reading.
    const share = await require("../services/shareService").activeShare(req.user, id);
    if (!share || !(await Student.exists({ _id: id, deletedAt: null }))) return next(ApiError.notFound("Student not found"));
    if (req.method !== "GET") return next(new ApiError(403, "Shared records are read-only."));
    req.share = { scopes: share.scopes, expiresAt: share.expiresAt };
    return next();
  } catch (err) {
    return next(err);
  }
}

// Under a share, each kind of record needs its scope.
const shareAllows = (scope) => (req, _res, next) =>
  !req.share || req.share.scopes.includes(scope)
    ? next()
    : next(new ApiError(403, `Your access to this student doesn't include ${scope} records.`));

// Teachers may only run the register for a class they are assigned to.
function canTeach(user, { school, className, section }) {
  if (user.role === "admin") return true;
  if (user.role === "principal") return (user.schools || []).some((s) => String(s._id || s) === String(school));
  if (user.role !== "teacher") return false;
  return (user.assignments || []).some(
    (a) =>
      String(a.school) === String(school) &&
      a.className === className &&
      (!a.section || (section && a.section === section.toUpperCase()))
  );
}

// Schools a user can see (for teachers: those in their assignments).
function schoolScope(user) {
  if (user.role === "admin") return {};
  if (user.role === "principal" || user.role === "librarian") {
    return { _id: { $in: (user.schools || []).map((s) => new mongoose.Types.ObjectId(String(s._id || s))) } };
  }
  if (user.role === "teacher") {
    return { _id: { $in: [...new Set((user.assignments || []).map((a) => String(a.school)))].map((s) => new mongoose.Types.ObjectId(s)) } };
  }
  return NOTHING;
}

// School ids a user may see, or null for all (admin).
function schoolIds(user) {
  if (user.role === "admin") return null;
  if (user.role === "principal" || user.role === "librarian") return (user.schools || []).map((s) => String(s._id || s));
  if (user.role === "teacher") return [...new Set((user.assignments || []).map((a) => String(a.school)))];
  return [];
}

module.exports = { familyIds, isFamily, requirePermission, studentScope, scoped, requireStudentAccess, shareAllows, canTeach, schoolScope, schoolIds };
