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
  "settings.manage",
  "homework.submit",
  "transport.manage",
  "library.manage",
  "certificates.issue",
];

const ROLE_PERMISSIONS = {
  // Admins do everything except things only a parent does for their child.
  admin: PERMISSIONS.filter((p) => !["leave.request", "homework.submit"].includes(p)),
  // Principal / head of department: everything in their own schools,
  // read-mostly (no fee collection, admissions or account management).
  principal: [
    "dashboard.view", "students.view", "students.search", "students.photo",
    "attendance.mark", "results.manage", "fees.view", "schools.view", "reports.view",
    "shares.request", "shares.approve", "announcements.manage", "homework.manage",
    "timetable.manage", "results.publish", "leave.decide", "students.promote",
    "settings.manage", "transport.manage", "library.manage", "certificates.issue",
  ],
  // Teachers work with the classes assigned to them.
  teacher: ["students.view", "students.search", "students.photo", "attendance.mark", "results.manage", "schools.view", "reports.view", "shares.request", "homework.manage", "leave.decide"],
  // Parents see their own children, read-only, but may update their photo.
  parent: ["students.view", "students.photo", "fees.view", "leave.request"],
  // Students see their own record and hand in homework.
  student: ["students.view", "homework.submit"],
  // Librarians run the library of their schools. They can find students
  // (name, class, admission number) to lend books, but not open records.
  librarian: ["library.manage", "students.search", "schools.view"],
};

// Extra permissions an admin can switch on for one person.
const GRANTABLE = {
  "students.import": ["teacher", "principal"],
  // A teacher who runs the library or the buses.
  "library.manage": ["teacher"],
  "transport.manage": ["teacher"],
};

const ROLES = Object.keys(ROLE_PERMISSIONS);
const permissionsFor = (role, grants = []) => [
  ...new Set([...(ROLE_PERMISSIONS[role] || []), ...grants.filter((g) => GRANTABLE[g]?.includes(role))]),
];
const can = (user, permission) => Boolean(user) && permissionsFor(user.role, user.grants || []).includes(permission);

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, GRANTABLE, ROLES, permissionsFor, can };
