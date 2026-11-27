const User = require("../models/User");
const Session = require("../models/Session");
const School = require("../models/School");
const Student = require("../models/Student");
const ApiError = require("../utils/ApiError");
const { escapeRegex, buildPagination } = require("../utils/query");
const { hashPassword } = require("./authService");

const { GRANTABLE } = require("../constants/permissions");

async function checkLinks({ assignments, children, schools, student }, selfId) {
  if (student) {
    if (!(await Student.exists({ _id: student, deletedAt: null }))) {
      throw ApiError.badRequest("Validation failed", [{ field: "student", message: "That student doesn't exist" }]);
    }
    if (await User.exists({ student, ...(selfId ? { _id: { $ne: selfId } } : {}) })) {
      throw ApiError.conflict("This student already has a login.");
    }
  }
  if (schools?.length && (await School.countDocuments({ _id: { $in: [...new Set(schools)] } })) !== new Set(schools).size) {
    throw ApiError.badRequest("Validation failed", [{ field: "schools", message: "One of the schools doesn't exist" }]);
  }
  if (assignments?.length) {
    const ids = [...new Set(assignments.map((a) => a.school))];
    if ((await School.countDocuments({ _id: { $in: ids } })) !== ids.length) {
      throw ApiError.badRequest("Validation failed", [{ field: "assignments", message: "One of the schools doesn't exist" }]);
    }
  }
  if (children?.length) {
    const ids = [...new Set(children)];
    if (ids.length !== children.length) throw ApiError.badRequest("Validation failed", [{ field: "children", message: "A child is listed twice" }]);
    if ((await Student.countDocuments({ _id: { $in: ids }, deletedAt: null })) !== ids.length) {
      throw ApiError.badRequest("Validation failed", [{ field: "children", message: "One of the students doesn't exist" }]);
    }
  }
}

async function withDetails(user) {
  const out = user.toJSON();
  if (user.role === "parent" && user.children?.length) {
    const kids = await Student.find({ _id: { $in: user.children } })
      .select("firstName lastName admissionNumber className section school")
      .populate("school", "name code")
      .lean();
    out.childDetails = kids.map((k) => ({
      id: String(k._id),
      name: `${k.firstName} ${k.lastName}`,
      admissionNumber: k.admissionNumber,
      className: k.className,
      section: k.section,
      school: k.school?.code,
    }));
  }
  if (user.role === "student" && user.student) {
    const k = await Student.findById(user.student).select("firstName lastName admissionNumber className section school").populate("school", "name code").lean();
    if (k) out.studentDetails = { id: String(k._id), name: `${k.firstName} ${k.lastName}`, admissionNumber: k.admissionNumber, className: k.className, section: k.section, school: k.school?.code };
  }
  if (user.role === "principal" && user.schools?.length) {
    const schools = await School.find({ _id: { $in: user.schools } }).select("name code").lean();
    out.schoolDetails = schools.map((s) => ({ id: String(s._id), name: s.name, code: s.code }));
  }
  if (user.role === "teacher" && user.assignments?.length) {
    const schools = await School.find({ _id: { $in: user.assignments.map((a) => a.school) } }).select("name code").lean();
    const byId = new Map(schools.map((s) => [String(s._id), s]));
    out.assignments = out.assignments.map((a) => ({ ...a, schoolName: byId.get(a.school)?.name, schoolCode: byId.get(a.school)?.code }));
  }
  return out;
}

async function listUsers(q) {
  const filter = {};
  if (q.role) filter.role = q.role;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ username: rx }, { name: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ role: 1, name: 1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    User.countDocuments(filter),
  ]);
  return { items: await Promise.all(items.map(withDetails)), pagination: buildPagination(q.page, q.limit, total) };
}

async function getUser(id) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

async function createUser({ password, ...input }) {
  await checkLinks(input);
  try {
    const user = await User.create({ ...input, passwordHash: await hashPassword(password) });
    return withDetails(user);
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict(`The username ${input.username} is taken.`);
    throw err;
  }
}

async function assertNotLastAdmin(user, actorId, action) {
  if (String(user._id) === String(actorId)) throw ApiError.badRequest(`You can't ${action} your own account.`);
  if (user.role === "admin") {
    const others = await User.countDocuments({ role: "admin", active: true, _id: { $ne: user._id } });
    if (!others) throw ApiError.badRequest(`You can't ${action} the last active admin.`);
  }
}

async function updateUser(id, changes, actorId) {
  const user = await getUser(id);
  if (changes.active === false && user.active) await assertNotLastAdmin(user, actorId, "deactivate");
  if (changes.assignments && user.role !== "teacher") throw ApiError.badRequest("Only teachers have classes");
  if (changes.children && user.role !== "parent") throw ApiError.badRequest("Only parents have children linked");
  if (changes.schools && user.role !== "principal") throw ApiError.badRequest("Only principals head schools");
  if (changes.student && user.role !== "student") throw ApiError.badRequest("Only student logins are linked to a student record");
  for (const g of changes.grants || []) {
    if (!GRANTABLE[g].includes(user.role)) throw ApiError.badRequest(`${g} can't be given to a ${user.role}`);
  }
  await checkLinks(changes, user._id);
  user.set(changes);
  await user.save();
  // Deactivation signs the person out everywhere straight away.
  if (changes.active === false) await Session.deleteMany({ user: user._id });
  return withDetails(user);
}

async function resetPassword(id, password) {
  const user = await getUser(id);
  user.passwordHash = await hashPassword(password);
  user.failedLogins = 0;
  user.lockedUntil = undefined;
  await user.save();
  await Session.deleteMany({ user: user._id });
}

async function deleteUser(id, actorId) {
  const user = await getUser(id);
  await assertNotLastAdmin(user, actorId, "delete");
  await Session.deleteMany({ user: user._id });
  await user.deleteOne();
}

// Readable random password: 4 groups of 4 letters/digits (no 0/O/1/l).
function randomPassword() {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = require("crypto").randomBytes(16);
  return [0, 1, 2, 3].map((g) => [...bytes.subarray(g * 4, g * 4 + 4)].map((b) => abc[b % abc.length]).join("")).join("-");
}

async function createStudentLogins({ school, className, section }) {
  const kids = await Student.find({ school, className, ...(section ? { section } : {}), deletedAt: null, status: "active" })
    .select("firstName lastName admissionNumber section rollNumber").sort({ section: 1, rollNumber: 1 }).lean();
  const have = new Set((await User.find({ student: { $in: kids.map((k) => k._id) } }).select("student").lean()).map((u) => String(u.student)));
  const created = [];
  for (const k of kids.filter((x) => !have.has(String(x._id)))) {
    const username = k.admissionNumber.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 40);
    const password = randomPassword();
    try {
      await User.create({ username, name: `${k.firstName} ${k.lastName}`, role: "student", student: k._id, passwordHash: await hashPassword(password) });
      created.push({ student: String(k._id), name: `${k.firstName} ${k.lastName}`, section: k.section, rollNumber: k.rollNumber, username, password });
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  return { created, skipped: kids.length - created.length };
}

module.exports = { createStudentLogins, listUsers, getUser, withDetails, createUser, updateUser, resetPassword, deleteUser };
