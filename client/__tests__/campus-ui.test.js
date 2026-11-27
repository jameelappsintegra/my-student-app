import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/router";
import Homework from "../pages/homework";
import Settings from "../pages/settings";
import Library from "../pages/library";
import Certificates from "../pages/certificates";
import Verify from "../pages/verify/[code]";
import Calendar from "../pages/calendar";
import StudentHome from "../components/home/StudentHome";
import { AuthProvider } from "../context/auth";
import { permissionsFor } from "./permissions-helper";
import { api } from "../services/api";

jest.mock("../services/api", () => {
  const actual = jest.requireActual("../services/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: { me: jest.fn() },
      search: jest.fn(() => Promise.resolve({ data: [{ id: "k1", firstName: "Asha", lastName: "Iyer", admissionNumber: "GVPS-2026-00001", className: "7", section: "A", school: { id: "s1", code: "GVPS" } }] })),
      notifications: { list: jest.fn(() => Promise.resolve({ data: { items: [], unread: 0 } })), read: jest.fn() },
      schools: { list: jest.fn(() => Promise.resolve({ data: [{ id: "s1", name: "Green Valley", code: "GVPS", active: true }] })) },
      me: { children: jest.fn(() => Promise.resolve({ data: [{ id: "k1", firstName: "Asha", lastName: "Iyer", admissionNumber: "GVPS-2026-00001", className: "7", section: "A", school: { id: "s1", name: "Green Valley" }, attendance: { percentage: 92 }, latestResult: null, fees: { balance: 0 } }] })) },
      homework: { list: jest.fn(), create: jest.fn(), remove: jest.fn(), submit: jest.fn(), submissions: jest.fn(), review: jest.fn() },
      settings: { get: jest.fn(), save: jest.fn(), calendar: jest.fn() },
      library: { books: jest.fn(), issues: jest.fn(), issue: jest.fn() },
      certificates: { list: jest.fn(), issue: jest.fn(), verify: jest.fn() },
    },
  };
});

const as = (role, extra = []) => api.auth.me.mockResolvedValue({ data: { user: { id: "u", name: "Me", username: "me", role, permissions: [...permissionsFor(role), ...extra] } } });
const renderAs = async (ui, role, extra) => {
  as(role, extra);
  render(<AuthProvider>{ui}</AuthProvider>);
  await waitFor(() => expect(api.auth.me).toHaveBeenCalled());
};
const due = new Date(Date.now() + 3 * 86400000).toISOString();
const hw = (o = {}) => ({ id: "h1", school: { id: "s1", code: "GVPS" }, className: "7", section: "A", subject: "Science", title: "Plant cells", dueDate: due, author: "Meera", onlineSubmission: true, maxMarks: 10, ...o });
beforeEach(() => jest.clearAllMocks());

test("a student hands in homework online", async () => {
  api.homework.list.mockResolvedValue({ data: [hw({ submissions: [] })] });
  api.homework.submit.mockResolvedValue({ message: "Handed in. Your teacher will see it." });
  const user = userEvent.setup();
  await renderAs(<Homework />, "student");
  expect(await screen.findByText("Not handed in")).toBeInTheDocument();
  expect(screen.queryByText("Post homework")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Answer for Plant cells"), "Cells have walls");
  await user.type(screen.getByLabelText("Link to your work"), "https://example.com/diagram");
  await user.click(screen.getByRole("button", { name: "Hand in" }));
  expect(api.homework.submit).toHaveBeenCalledWith("h1", { text: "Cells have walls", link: "https://example.com/diagram" });
  expect(await screen.findByText("Handed in. Your teacher will see it.")).toBeInTheDocument();
});

test("a marked submission shows the marks and can't be changed", async () => {
  api.homework.list.mockResolvedValue({ data: [hw({ submissions: [{ id: "s1", status: "graded", marks: 9, feedback: "Good diagram" }] })] });
  await renderAs(<Homework />, "student");
  expect(await screen.findByText("Marked · 9/10")).toBeInTheDocument();
  expect(screen.getByText("Teacher: Good diagram")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Hand in/ })).not.toBeInTheDocument();
});

test("a teacher marks a submission", async () => {
  api.homework.list.mockResolvedValue({ data: [hw({ submissionCounts: { submitted: 1, graded: 0 } })] });
  api.homework.submissions.mockResolvedValue({ data: { homework: hw(), summary: { students: 2, submitted: 1, late: 0, graded: 0, missing: 1 }, rows: [
    { student: { id: "k1", name: "Asha Iyer", rollNumber: 1 }, submission: { id: "sub1", status: "submitted", text: "Cells have walls" } },
    { student: { id: "k2", name: "Ravi Kumar", rollNumber: 2 }, submission: null },
  ] } });
  api.homework.review.mockResolvedValue({ message: "Marked. The student and parents can see it." });
  const user = userEvent.setup();
  await renderAs(<Homework />, "teacher");
  await user.click(await screen.findByRole("button", { name: "Submissions (1)" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("1 of 2 handed in · 0 marked · 1 missing")).toBeInTheDocument();
  expect(within(dialog).getByText("Not handed in")).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText("Marks for Asha Iyer"), "8");
  await user.type(within(dialog).getByLabelText("Feedback for Asha Iyer"), "Label the nucleus");
  await user.click(within(dialog).getByRole("button", { name: "Mark" }));
  expect(api.homework.review).toHaveBeenCalledWith("h1", "sub1", { action: "grade", marks: 8, feedback: "Label the nucleus" });
});

const SETTINGS = { currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", academicYearStartMonth: 4, weeklyOffs: [0], passPercentage: 33, gradingScale: [{ min: 33, grade: "D" }, { min: 0, grade: "E" }], terms: [], holidays: [], library: { finePerDay: 2, loanDays: 14, maxBooks: 3 }, homework: { allowLate: true } };

test("principal changes currency and adds a holiday", async () => {
  api.settings.get.mockResolvedValue({ data: { settings: SETTINGS } });
  api.settings.save.mockImplementation(async (_s, body) => ({ message: "Green Valley settings saved", data: { settings: { ...SETTINGS, ...body } } }));
  const user = userEvent.setup();
  await renderAs(<Settings />, "principal");
  await screen.findByText("Region and money");
  await waitFor(() => expect(api.settings.get).toHaveBeenCalledWith("s1"));
  expect(screen.getByText("₹1,25,000")).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Currency"), "USD");
  await user.clear(screen.getByLabelText("Number format (locale)"));
  await user.type(screen.getByLabelText("Number format (locale)"), "en-US");
  expect(screen.getByText("$125,000")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Add holiday" }));
  await user.type(screen.getByLabelText("Holiday date"), "2026-12-25");
  await user.type(screen.getByLabelText("Holiday name"), "Christmas");
  await user.click(screen.getByLabelText("Sat"));
  await user.click(screen.getByRole("button", { name: "Save settings" }));
  const body = api.settings.save.mock.calls[0][1];
  expect(body).toMatchObject({ currency: "USD", locale: "en-US", weeklyOffs: [0, 6], holidays: [{ date: "2026-12-25", name: "Christmas" }] });
  expect(await screen.findByText("Green Valley settings saved")).toBeInTheDocument();
});

test("settings page is closed to teachers", async () => {
  await renderAs(<Settings />, "teacher");
  expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
});

test("librarian lends a book; students only browse", async () => {
  api.library.books.mockResolvedValue({ data: [{ id: "b1", school: "s1", title: "Wings of Fire", author: "A. P. J. Abdul Kalam", copies: 2, available: 1 }] });
  api.library.issue.mockResolvedValue({ message: "Wings of Fire lent to Asha. Due back 2026-12-11." });
  const user = userEvent.setup();
  await renderAs(<Library />, "teacher", ["library.manage"]);
  await user.click(await screen.findByRole("button", { name: "Lend" }));
  await user.type(screen.getByLabelText("Find student"), "As");
  await user.click(await screen.findByRole("button", { name: /Asha Iyer/ }));
  await user.click(screen.getByRole("button", { name: "Lend book" }));
  expect(api.library.issue).toHaveBeenCalledWith({ book: "b1", student: "k1" });
  expect(await screen.findByText(/lent to Asha/)).toBeInTheDocument();
});

test("students see the catalogue without lending buttons", async () => {
  api.library.books.mockResolvedValue({ data: [{ id: "b1", school: "s1", title: "Wings of Fire", copies: 1, available: 0 }] });
  await renderAs(<Library />, "student");
  expect(await screen.findByText("Wings of Fire")).toBeInTheDocument();
  expect(screen.getByText("0/1 in")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Lend" })).not.toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: "Loans" })).not.toBeInTheDocument();
});

test("TC with unpaid fees asks before issuing", async () => {
  const { ApiError } = jest.requireActual("../services/api");
  api.certificates.list.mockResolvedValue({ data: [] });
  api.certificates.issue
    .mockRejectedValueOnce(new ApiError("₹1,200 in fees is still due. Collect it, or confirm to issue the TC anyway.", { status: 409, errors: [{ field: "ignoreDues", message: "Fees due" }] }))
    .mockResolvedValueOnce({ message: "Transfer certificate GVPS/TC/2026/0001 issued.", data: { id: "c1" } });
  const user = userEvent.setup();
  await renderAs(<Certificates />, "principal");
  await user.click(await screen.findByRole("button", { name: "Issue certificate" }));
  await user.type(screen.getByLabelText("Find student"), "As");
  await user.click(await screen.findByRole("button", { name: /Asha Iyer/ }));
  await user.selectOptions(screen.getByLabelText("Certificate"), "transfer");
  await user.type(screen.getByLabelText("Reason for leaving"), "Moving to Chennai");
  await user.click(screen.getByRole("button", { name: "Issue" }));
  expect(await screen.findByText(/in fees is still due/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Issue TC with dues" }));
  expect(api.certificates.issue.mock.calls[1][0]).toMatchObject({ student: "k1", type: "transfer", reason: "Moving to Chennai", ignoreDues: true });
  expect(await screen.findByText("Transfer certificate GVPS/TC/2026/0001 issued.")).toBeInTheDocument();
});

test("public verification page shows a genuine certificate", async () => {
  useRouter().query.code = "ABCDEF123456";
  api.certificates.verify.mockResolvedValue({ message: "This certificate is genuine.", data: { valid: true, type: "Bonafide certificate", serialNumber: "GVPS/BC/2026/0001", name: "Asha Iyer", school: "Green Valley", city: "Chennai", issuedAt: "2026-11-20T00:00:00Z", status: "issued" } });
  render(<Verify />);
  expect(await screen.findByText("This certificate is genuine.")).toBeInTheDocument();
  expect(screen.getByText("GVPS/BC/2026/0001")).toBeInTheDocument();
  expect(api.certificates.verify).toHaveBeenCalledWith("ABCDEF123456");
  delete useRouter().query.code;
});

test("calendar lists holidays and homework for the month", async () => {
  const now = new Date();
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
  api.settings.calendar.mockResolvedValue({ data: { weeklyOffs: [0], terms: [], holidays: [{ date: d, name: "Founders' Day" }], events: [], homework: [{ id: "h1", title: "Plant cells", subject: "Science", className: "7", section: "A", date: d }] } });
  await renderAs(<Calendar />, "student");
  expect(await screen.findAllByText("Founders' Day")).not.toHaveLength(0);
  expect(screen.getAllByText("Science: Plant cells").length).toBeGreaterThan(0);
  expect(api.settings.calendar).toHaveBeenCalledWith("s1", expect.objectContaining({ from: expect.stringMatching(/-01$/) }));
});

test("student home shows what's due", async () => {
  api.homework.list.mockResolvedValue({ data: [hw({ submissions: [] }), hw({ id: "h2", title: "Read chapter 3", onlineSubmission: false, submissions: [] })] });
  await renderAs(<StudentHome />, "student");
  expect(await screen.findByText("Hi, Asha")).toBeInTheDocument();
  expect(screen.getByText("1 to hand in online.")).toBeInTheDocument();
  expect(screen.getByText("To do")).toBeInTheDocument();
  expect(screen.getByText("On paper")).toBeInTheDocument();
});
