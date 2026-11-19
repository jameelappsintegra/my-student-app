// Navigation. Items show only to people with the permission (the API checks
// again). `mobile` items appear in the phone's bottom tab bar.
const menuItems = [
  { name: "Home", short: "Home", link: "/", icon: "home", mobile: true },
  { name: "Students", short: "Students", link: "/students", icon: "students", mobile: true, perm: "students.search" },
  { name: "Attendance", short: "Attendance", link: "/attendance", icon: "calendar", mobile: true, perm: "attendance.mark" },
  { name: "Admissions", short: "Admissions", link: "/admissions", icon: "admissions", mobile: true, perm: "admissions.manage" },
  { name: "New Admission", link: "/newadmission", icon: "plus", perm: "admissions.manage" },
  { name: "Reports", link: "/reports", icon: "report", perm: "reports.view" },
  { name: "Schools", link: "/schools", icon: "schools", perm: "schools.manage" },
  { name: "Users", link: "/users", icon: "users", perm: "users.manage" },
  // Reached from the name in the sidebar; a bottom tab for parents.
  { name: "My account", short: "Account", link: "/account", icon: "account", mobile: "parent", sidebar: false },
];

export const visibleItems = (can) => menuItems.filter((m) => !m.perm || can(m.perm));
export const sidebarItems = (can) => visibleItems(can).filter((m) => m.sidebar !== false);
export const tabItems = (can, role) =>
  visibleItems(can).filter((m) => m.mobile === true || m.mobile === role).slice(0, 5);

export default menuItems;
