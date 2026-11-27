// Sends notifications. Today only the in-app channel exists; an email, SMS
// or WhatsApp channel plugs in here (each must report its own delivery
// result; nothing here claims a message was delivered elsewhere).
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const User = require("../models/User");

const oid = (x) => new mongoose.Types.ObjectId(String(x._id || x));

async function notify(userIds, { type = "general", title, body, link }) {
  const ids = [...new Set((userIds || []).map(String))];
  if (!ids.length) return 0;
  await Notification.insertMany(ids.map((u) => ({ user: u, type, title, body, link })), { ordered: false });
  return ids.length;
}

// Parent accounts linked to any of these students.
async function parentsOf(studentIds) {
  const ids = (studentIds || []).map(oid);
  if (!ids.length) return [];
  return (await User.find({ role: "parent", active: true, children: { $in: ids } }).select("_id children").lean());
}

// Teachers assigned to the class (any section, or this section) and the
// school's principals.
async function staffFor(school, className, section) {
  const sid = oid(school);
  const teachers = await User.find({
    role: "teacher",
    active: true,
    assignments: { $elemMatch: { school: sid, className, ...(section ? { $or: [{ section }, { section: { $exists: false } }, { section: null }] } : {}) } },
  }).select("_id").lean();
  const principals = await User.find({ role: "principal", active: true, schools: sid }).select("_id").lean();
  return [...teachers, ...principals].map((u) => u._id);
}

module.exports = { notify, parentsOf, staffFor };
