// Sidebar navigation. `comingSoon` pages exist but have no backend yet.
const menuItems = [
  { name: "Dashboard", link: "/" },
  { name: "Admissions", link: "/admissions" },
  { name: "New Admission", link: "/newadmission" },
  { name: "Students", link: "/myclass" },
  { name: "Attendance", link: "/attendance", comingSoon: true },
  { name: "Parents", link: "/parents", comingSoon: true },
  { name: "Personal Details", link: "/personaldetails", comingSoon: true },
];

export default menuItems;
