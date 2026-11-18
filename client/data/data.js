// Navigation. `mobile` items appear in the phone's bottom tab bar; the rest
// are in the side menu (☰).
const menuItems = [
  { name: "Dashboard", short: "Home", link: "/", icon: "home", mobile: true },
  { name: "Students", short: "Students", link: "/students", icon: "students", mobile: true },
  { name: "Attendance", short: "Attendance", link: "/attendance", icon: "calendar", mobile: true },
  { name: "Admissions", short: "Admissions", link: "/admissions", icon: "admissions", mobile: true },
  { name: "New Admission", link: "/newadmission", icon: "plus" },
  { name: "Reports", link: "/reports", icon: "report" },
  { name: "Schools", link: "/schools", icon: "schools" },
];

export default menuItems;
