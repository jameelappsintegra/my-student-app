// Cross-school sharing: a teacher or principal asks for read-only access to a
// student at another school; that school's principal (or an admin) decides.
const mongoose = require("mongoose");
const AccessShare = require("../models/AccessShare");
const Student = require("../models/Student");
const { studentPublic } = require("../models/Student");
const ApiError = require("../utils/ApiError");
const { scoped, schoolIds } = require("../middleware/authorize");
const { can } = require("../constants/permissions");
const { toPublic } = require("../utils/serialize");

const activeFilter = () => ({ status: "approved", expiresAt: { $gt: new Date() } });

// The active share (if any) giving this user access to this student.
async function activeShare(user, studentId) {
  return AccessShare.findOne({ requester: user._id, student: studentId, ...activeFilter() }).select("scopes expiresAt").lean();
}

async function requestAccess(user, { admissionNumber, scopes, reason, days }) {
  const student = await Student.findOne({ admissionNumber: admissionNumber.toUpperCase(), deletedAt: null }).select("school").populate("school", "name code").lean();
  if (!student) throw ApiError.notFound("No student has that admission number.");
  if (await Student.exists(scoped(user, { _id: student._id }))) throw ApiError.badRequest("This student is already in your classes.");
  const open = await AccessShare.findOne({ requester: user._id, student: student._id, $or: [{ status: "pending" }, activeFilter()] }).lean();
  if (open) throw ApiError.conflict(open.status === "pending" ? "You already asked for this student; the request is waiting for a decision." : "You already have access to this student.");
  const share = await AccessShare.create({ student: student._id, ownerSchool: student.school._id, requester: user._id, scopes: [...new Set(scopes)], reason, days });
  return { id: share.id, school: student.school.name };
}

// Who may decide on a request: admins, or principals of the student's school.
function canDecide(user, share) {
  if (!can(user, "shares.approve")) return false;
  const allowed = schoolIds(user);
  return allowed === null || allowed.includes(String(share.ownerSchool));
}

async function decide(user, id, { approve, scopes, days, note }) {
  const share = await AccessShare.findById(id);
  if (!share || !canDecide(user, share)) throw ApiError.notFound("Request not found");
  if (share.status !== "pending") throw ApiError.badRequest(`This request was already ${share.status}.`);
  share.status = approve ? "approved" : "rejected";
  share.decidedBy = user._id;
  share.decidedAt = new Date();
  share.decisionNote = note;
  if (approve) {
    // The approver can narrow (never widen) what was asked for.
    if (scopes) {
      const narrowed = scopes.filter((s) => share.scopes.includes(s));
      if (!narrowed.length) throw ApiError.badRequest("Approve at least one of the requested kinds of information.");
      share.scopes = narrowed;
    }
    share.days = Math.min(days || share.days, share.days);
    share.expiresAt = new Date(Date.now() + share.days * 86400000);
  }
  await share.save();
  return share;
}

async function revoke(user, id) {
  const share = await AccessShare.findById(id);
  if (!share) throw ApiError.notFound("Share not found");
  const mine = String(share.requester) === String(user._id);
  if (!mine && !canDecide(user, share)) throw ApiError.notFound("Share not found");
  if (!["approved", "pending"].includes(share.status)) throw ApiError.badRequest(`This request is already ${share.status}.`);
  share.status = "revoked";
  share.decidedAt = share.decidedAt || new Date();
  await share.save();
  return share;
}

const present = (s) => {
  const out = toPublic(s);
  out.expired = s.status === "approved" && s.expiresAt && new Date(s.expiresAt) <= new Date();
  if (s.student && s.student.firstName) {
    out.student = { id: String(s.student._id), name: `${s.student.firstName} ${s.student.lastName}`, admissionNumber: s.student.admissionNumber, className: s.student.className, section: s.student.section, photoUrl: studentPublic(toPublic({ ...s.student })).photoUrl };
  }
  if (s.requester && s.requester.username) out.requester = { id: String(s.requester._id), name: s.requester.name || s.requester.username, role: s.requester.role };
  if (s.ownerSchool && s.ownerSchool.name) out.ownerSchool = { id: String(s.ownerSchool._id), name: s.ownerSchool.name, code: s.ownerSchool.code };
  if (s.decidedBy && s.decidedBy.username) out.decidedBy = s.decidedBy.name || s.decidedBy.username;
  return out;
};
const populate = (q) =>
  q.populate("student", "firstName lastName admissionNumber className section photo").populate("requester", "name username role").populate("ownerSchool", "name code").populate("decidedBy", "name username").lean();

async function list(user, box) {
  let filter;
  if (box === "incoming") {
    if (!can(user, "shares.approve")) throw new ApiError(403, "You don't have permission to do that.");
    const allowed = schoolIds(user);
    filter = allowed === null ? {} : { ownerSchool: { $in: allowed.map((s) => new mongoose.Types.ObjectId(s)) } };
  } else {
    filter = { requester: user._id };
  }
  const rows = await populate(AccessShare.find(filter).sort({ status: 1, createdAt: -1 }).limit(200));
  return rows.map(present);
}

module.exports = { activeShare, requestAccess, decide, revoke, list, SHARE_SCOPES: AccessShare.SHARE_SCOPES };
