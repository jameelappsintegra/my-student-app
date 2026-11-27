// Navigation. Items show only to people with the permission (the API checks
// again). `mobile` items appear in the phone's bottom tab bar.
const menuItems = [
  { name: "Home", short: "Home", link: "/", icon: "home", mobile: true },
  { name: "Students", short: "Students", link: "/students", icon: "students", mobile: true, perm: "students.search" },
  { name: "Attendance", short: "Attendance", link: "/attendance", icon: "calendar", mobile: true, perm: "attendance.mark" },
  { name: "Homework", short: "Homework", link: "/homework", icon: "book", mobile: ["teacher", "parent"] },
  { name: "Timetable", link: "/timetable", icon: "clock" },
  { name: "Announcements", link: "/announcements", icon: "megaphone" },
  { name: "Leave requests", short: "Leave", link: "/leave", icon: "leave", perm: ["leave.request", "leave.decide"], mobile: "parent" },
  { name: "Admissions", short: "Admissions", link: "/admissions", icon: "admissions", mobile: true, perm: "admissions.manage" },
  { name: "Publish results", link: "/results", icon: "award", perm: "results.publish" },
  { name: "Promote students", link: "/students/promote", icon: "promote", perm: "students.promote" },
  { name: "New Admission", link: "/newadmission", icon: "plus", perm: "admissions.manage" },
  { name: "Reports", short: "Reports", link: "/reports", icon: "report", perm: "reports.view", mobile: "principal" },
  { name: "Schools", link: "/schools", icon: "schools", perm: "schools.manage" },
  { name: "Import students", link: "/students/import", icon: "upload", perm: "students.import" },
  { name: "Shared records", link: "/shares", icon: "share", perm: ["shares.request", "shares.approve"] },
  { name: "Users", link: "/users", icon: "users", perm: "users.manage" },
  { name: "Audit log", link: "/audit", icon: "shield", perm: "audit.view" },
  // Reached from the name in the sidebar; a bottom tab for parents.
  { name: "My account", short: "Account", link: "/account", icon: "account", mobile: "parent", sidebar: false },
];

const allowed = (can, perm) => !perm || (Array.isArray(perm) ? perm.some(can) : can(perm));
export const visibleItems = (can) => menuItems.filter((m) => allowed(can, m.perm));
export const sidebarItems = (can) => visibleItems(can).filter((m) => m.sidebar !== false);
export const tabItems = (can, role) =>
  visibleItems(can).filter((m) => m.mobile === true || m.mobile === role || (Array.isArray(m.mobile) && m.mobile.includes(role))).slice(0, 5);

export default menuItems;
