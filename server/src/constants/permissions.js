// Central role → permission map. Routes check permissions, never role names,
// so changing what a role may do is a one-line edit here.
const PERMISSIONS = [
  "dashboard.view",
  "students.view",
  "students.search",
  "students.manage",
  "students.photo",
  "students.import",
  "attendance.mark",
  "results.manage",
  "fees.view",
  "fees.manage",
  "admissions.manage",
  "schools.view",
  "schools.manage",
  "reports.view",
  "users.manage",
  // Ask another school for access to one of its students.
  "shares.request",
  // Approve or reject such requests for your school's students.
  "shares.approve",
  "announcements.manage",
  "homework.manage",
  "timetable.manage",
  "results.publish",
  "leave.request",
  "leave.decide",
  "audit.view",
  "students.promote",
];

const ROLE_PERMISSIONS = {
  // Admins do everything except things only a parent does for their child.
  admin: PERMISSIONS.filter((p) => p !== "leave.request"),
  // Principal / head of department: everything in their own schools,
  // read-mostly (no fee collection, admissions or account management).
  principal: [
    "dashboard.view", "students.view", "students.search", "students.photo",
    "attendance.mark", "results.manage", "fees.view", "schools.view", "reports.view",
    "shares.request", "shares.approve", "announcements.manage", "homework.manage",
    "timetable.manage", "results.publish", "leave.decide", "students.promote",
  ],
  // Teachers work with the classes assigned to them.
  teacher: ["students.view", "students.search", "students.photo", "attendance.mark", "results.manage", "schools.view", "reports.view", "shares.request", "homework.manage", "leave.decide"],
  // Parents see their own children, read-only, but may update their photo.
  parent: ["students.view", "students.photo", "fees.view", "leave.request"],
};

// Extra permissions an admin can switch on for one person.
const GRANTABLE = { "students.import": ["teacher", "principal"] };

const ROLES = Object.keys(ROLE_PERMISSIONS);
const permissionsFor = (role, grants = []) => [
  ...new Set([...(ROLE_PERMISSIONS[role] || []), ...grants.filter((g) => GRANTABLE[g]?.includes(role))]),
];
const can = (user, permission) => Boolean(user) && permissionsFor(user.role, user.grants || []).includes(permission);

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, GRANTABLE, ROLES, permissionsFor, can };
