import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sidebarItems, tabItems } from "../data/data";
import { permissionsFor } from "./permissions-helper";
import Users from "../pages/users";
import ImportStudents from "../pages/students/import";
import Shares from "../pages/shares";
import AadhaarFill from "../components/forms/AadhaarFill";
import { AuthProvider } from "../context/auth";
import { api, ApiError } from "../services/api";

jest.mock("../services/api", () => {
  const actual = jest.requireActual("../services/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: { me: jest.fn(), logout: jest.fn() },
      search: jest.fn(() => Promise.resolve({ data: [] })),
      schools: { list: jest.fn(() => Promise.resolve({ data: [{ id: "s1", name: "Green Valley", code: "GVPS", active: true }] })) },
      users: { list: jest.fn(), create: jest.fn(), update: jest.fn(), resetPassword: jest.fn(), remove: jest.fn(), uploadPhoto: jest.fn() },
      students: { ...actual.api.students, importCsv: jest.fn() },
      shares: { list: jest.fn(), request: jest.fn(), decide: jest.fn(), revoke: jest.fn() },
      identity: { aadhaarOffline: jest.fn() },
    },
  };
});

const asRole = (role, extra = []) => {
  const user = { id: "u1", name: "Test Person", username: "t", role, permissions: [...permissionsFor(role), ...extra] };
  api.auth.me.mockResolvedValue({ data: { user } });
  return user;
};
const renderAs = async (ui, role, extra) => {
  asRole(role, extra);
  render(<AuthProvider>{ui}</AuthProvider>);
  await waitFor(() => expect(api.auth.me).toHaveBeenCalled());
};

beforeEach(() => jest.clearAllMocks());

test("each role gets its own menu, tabs and colour theme", async () => {
  const items = (role, extra = []) => {
    const perms = [...permissionsFor(role), ...extra];
    return sidebarItems((p) => perms.includes(p)).map((i) => i.name);
  };
  expect(items("admin")).toEqual(expect.arrayContaining(["Users", "Schools", "Import students", "Reports", "Shared records"]));
  expect(items("teacher")).toEqual(["Home", "Students", "Attendance", "Homework", "Timetable", "Announcements", "Leave requests", "Reports", "Shared records"]);
  expect(items("principal")).toEqual(expect.arrayContaining(["Publish results", "Promote students", "Leave requests"]));
  expect(items("principal")).not.toContain("Audit log");
  expect(items("admin")).toContain("Audit log");
  expect(items("teacher", ["students.import"])).toContain("Import students");
  expect(items("parent")).toEqual(["Home", "Homework", "Timetable", "Announcements", "Leave requests"]);
  const parentPerms = permissionsFor("parent");
  expect(tabItems((p) => parentPerms.includes(p), "parent").map((i) => i.short)).toEqual(["Home", "Homework", "Leave", "Account"]);
  const teacherPerms = permissionsFor("teacher");
  expect(tabItems((p) => teacherPerms.includes(p), "teacher").map((i) => i.short)).toEqual(["Home", "Students", "Attendance", "Homework"]);

  for (const [role, theme] of [["teacher", "edupro-teacher"], ["parent", "edupro-parent"], ["principal", "edupro-principal"], ["admin", "edupro"]]) {
    asRole(role);
    const { unmount } = render(<AuthProvider><p>page</p></AuthProvider>);
    await screen.findByText("page");
    expect(document.documentElement.getAttribute("data-theme")).toBe(theme);
    unmount();
  }
});

test("pages a role can't use say so", async () => {
  await renderAs(<Users />, "teacher");
  expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  expect(api.users.list).not.toHaveBeenCalled();
});

test("admin creates a teacher with a class and the import permission", async () => {
  api.users.list.mockResolvedValue({ data: [] });
  api.users.create.mockResolvedValue({ message: "Account created for Meera K" });
  const user = userEvent.setup();
  await renderAs(<Users />, "admin");
  await user.click(await screen.findByRole("button", { name: "New teacher" }));
  const d = screen.getByRole("dialog");
  await user.type(within(d).getByLabelText("Full name"), "Meera K");
  await user.type(within(d).getByLabelText("Username"), "meera.k");
  await user.type(within(d).getByLabelText("Temporary password"), "a long enough passphrase");
  await user.click(within(d).getByRole("button", { name: "+ Add class" }));
  await user.selectOptions(within(d).getByLabelText("Class"), "5");
  await user.type(within(d).getByLabelText("Section"), "b");
  await user.click(within(d).getByLabelText(/Can import students/));
  await user.click(within(d).getByRole("button", { name: "Save" }));
  expect(api.users.create).toHaveBeenCalledWith(expect.objectContaining({
    role: "teacher", username: "meera.k", name: "Meera K", password: "a long enough passphrase",
    assignments: [{ school: "s1", className: "5", section: "B" }], grants: ["students.import"],
  }));
  expect(await screen.findByText("Account created for Meera K")).toBeInTheDocument();
});

test("CSV import: check shows row errors; a clean file can be imported", async () => {
  const user = userEvent.setup();
  api.students.importCsv
    .mockRejectedValueOnce(new ApiError("2 problems found.", { status: 400, data: { totalRows: 3, validRows: 1, errors: [{ row: 2, field: "school_code", message: "No school with code XX" }, { row: 4, field: "dateOfBirth", message: "Enter a valid date of birth" }], preview: [] } }))
    .mockResolvedValueOnce({ message: "All 3 rows are ready to import.", data: { totalRows: 3, validRows: 3, errors: [], preview: [{ row: 2, name: "Asha Iyer", school: "GVPS", className: "5", section: "A", dateOfBirth: "2016-03-14" }] } })
    .mockResolvedValueOnce({ message: "3 students imported (GVPS-2026-00001 to GVPS-2026-00003).", data: { totalRows: 3, imported: 3, errors: [] } });
  await renderAs(<ImportStudents />, "teacher", ["students.import"]);
  const file = new File(["a,b"], "s.csv", { type: "text/csv" });
  await user.upload(await screen.findByLabelText("CSV file"), file);
  await user.click(screen.getByRole("button", { name: "Check file" }));
  expect(await screen.findByText("No school with code XX")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Import \d+ students/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Check file" }));
  await user.click(await screen.findByRole("button", { name: "Import 3 students" }));
  expect(api.students.importCsv).toHaveBeenLastCalledWith(file, false);
  expect(await screen.findByText(/3 students imported/)).toBeInTheDocument();
});

test("sharing: request another school's student; principal approves a narrowed request", async () => {
  const user = userEvent.setup();
  api.shares.list.mockResolvedValue({ data: [] });
  api.shares.request.mockResolvedValue({ message: "Request sent to St. Mary's." });
  await renderAs(<Shares />, "teacher");
  await user.type(await screen.findByLabelText("Student's admission number"), " smms-2026-00004 ");
  await user.click(screen.getByLabelText("Attendance"));
  await user.type(screen.getByLabelText(/Reason/), "Transferring to our school next term");
  await user.click(screen.getByRole("button", { name: "Send request" }));
  expect(api.shares.request).toHaveBeenCalledWith({ admissionNumber: "smms-2026-00004", scopes: ["academic", "attendance"], reason: "Transferring to our school next term", days: 30 });
  expect(await screen.findByText("Request sent to St. Mary's.")).toBeInTheDocument();
});

test("principal reviews a request and can untick items before approving", async () => {
  const user = userEvent.setup();
  api.shares.list.mockResolvedValue({ data: [{ id: "sh1", status: "pending", scopes: ["academic", "personal"], days: 30, reason: "Transfer assessment", createdAt: "2026-11-18T00:00:00Z", requester: { name: "Ravi", role: "teacher" }, student: { id: "st", name: "Shared Kid", admissionNumber: "SMMS-2026-00004" } }] });
  api.shares.decide.mockResolvedValue({ message: "Access approved until 2026-11-25." });
  await renderAs(<Shares />, "principal");
  await user.click(await screen.findByRole("tab", { name: /To approve/ }));
  await user.click(await screen.findByRole("button", { name: "Review" }));
  const d = screen.getByRole("dialog");
  await user.click(within(d).getByLabelText(/Personal details/));
  await user.click(within(d).getByRole("button", { name: "Approve" }));
  expect(api.shares.decide).toHaveBeenCalledWith("sh1", { approve: true, scopes: ["academic"], days: 30, note: undefined });
});

test("Fill from Aadhaar shows what was read and passes it on", async () => {
  const user = userEvent.setup();
  const onFill = jest.fn();
  api.identity.aadhaarOffline.mockResolvedValue({ data: { firstName: "Asha", middleName: "Devi", lastName: "Iyer", dateOfBirth: "2016-03-14", gender: "female", address: "12 Main St", father: { name: "Ganesh Iyer" }, aadhaarLast4: "1234", verified: null, warnings: ["The UIDAI signature wasn't checked"], photo: null } });
  render(<AadhaarFill onFill={onFill} />);
  await user.click(screen.getByRole("button", { name: "Fill from Aadhaar" }));
  const zip = new File(["PK"], "offline.zip", { type: "application/zip" });
  await user.upload(screen.getByLabelText("Aadhaar ZIP file"), zip);
  await user.type(screen.getByLabelText("Share code"), "AB12");
  await user.click(screen.getByRole("button", { name: "Read file" }));
  expect(api.identity.aadhaarOffline).toHaveBeenCalledWith(zip, "AB12");
  expect(await screen.findByText("XXXX XXXX 1234")).toBeInTheDocument();
  expect(screen.getByText(/signature wasn't checked/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Use these details" }));
  expect(onFill).toHaveBeenCalledWith(expect.objectContaining({ firstName: "Asha", dateOfBirth: "2016-03-14" }));
});
