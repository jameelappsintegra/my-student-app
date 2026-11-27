import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/router";
import Progress from "../pages/progress";
import Fees from "../pages/fees";
import Receipt from "../pages/fees/receipt";
import Insights from "../pages/insights";
import { AuthProvider } from "../context/auth";
import { permissionsFor } from "./permissions-helper";
import { api } from "../services/api";

// Charts render on the client with ECharts; the tests check the text.
jest.mock("../components/common/Chart", () => function Chart({ label }) { return <div role="img" aria-label={label} />; });

jest.mock("../services/api", () => {
  const actual = jest.requireActual("../services/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      auth: { me: jest.fn() },
      search: jest.fn(() => Promise.resolve({ data: [] })),
      notifications: { list: jest.fn(() => Promise.resolve({ data: { items: [], unread: 0 } })), read: jest.fn() },
      schools: { list: jest.fn(() => Promise.resolve({ data: [{ id: "s1", name: "Green Valley", code: "GVPS", active: true }] })) },
      me: {
        children: jest.fn(),
        classes: jest.fn(() => Promise.resolve({ data: [{ school: { id: "s1", name: "Green Valley" }, className: "7", section: "A", students: 2, markedToday: 0 }] })),
      },
      students: { progress: jest.fn(), fees: jest.fn(), receipt: jest.fn() },
      insights: { forClass: jest.fn() },
    },
  };
});

const as = (role) => api.auth.me.mockResolvedValue({ data: { user: { id: "u", name: "Me", username: "me", role, permissions: permissionsFor(role) } } });
const renderAs = async (ui, role) => {
  as(role);
  render(<AuthProvider>{ui}</AuthProvider>);
  await waitFor(() => expect(api.auth.me).toHaveBeenCalled());
};
const kid = (id, firstName) => ({ id, firstName, lastName: "Iyer", className: "7", section: "A", school: { id: "s1", name: "Green Valley" } });
const progress = (o = {}) => ({
  student: { id: "k1", name: "Asha Iyer" },
  range: { from: "2026-04-01", to: "2026-11-27" },
  grading: { passPercentage: 33 },
  results: {
    exams: [{ exam: "Term 1", academicYear: "2026-2027", percentage: 70, grade: "B1" }, { exam: "Term 2", academicYear: "2026-2027", percentage: 78, grade: "B1" }],
    subjects: [{ subject: "Maths", percentage: 85, grade: "A2", passed: true, previous: 70, change: 15 }, { subject: "Art", percentage: 30, grade: "E", passed: false, previous: 40, change: -10 }],
    latest: { exam: "Term 2", percentage: 78, grade: "B1", passed: false },
    change: 8,
  },
  attendance: { percentage: 72.5, schoolDays: 40, absent: 11, monthly: [{ month: "2026-10", percentage: 80, schoolDays: 20 }, { month: "2026-11", percentage: 65, schoolDays: 20 }] },
  homework: { summary: { online: 4, handedIn: 2, marked: 1, late: 1, missing: 1, pending: 1, handInRate: 66.7, averageMarkPercent: 80 }, recent: [{ id: "h1", subject: "Science", title: "Plant cells", dueDate: "2026-11-20", status: "missing", online: true }] },
  library: { onLoan: 1, overdue: 0 },
  fees: { billed: 1000, paid: 400, balance: 600, overdue: 600, currency: "INR", locale: "en-IN" },
  ...o,
});
beforeEach(() => jest.clearAllMocks());

test("a parent switches between children and sees each one's progress", async () => {
  api.me.children.mockResolvedValue({ data: [kid("k1", "Asha"), kid("k2", "Ravi")] });
  api.students.progress.mockImplementation(async (id) => ({ data: progress(id === "k2" ? { student: { id: "k2" }, fees: null, attendance: { percentage: 95, schoolDays: 40, absent: 2, monthly: [] } } : {}) }));
  const user = userEvent.setup();
  await renderAs(<Progress />, "parent");
  expect(await screen.findByText("72.5%")).toBeInTheDocument();
  expect(screen.getByText("₹600")).toBeInTheDocument();
  expect(screen.getByText("▲ 8 pts")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Exam percentages: Term 1 70%, Term 2 78%" })).toBeInTheDocument();
  expect(screen.getByText("▼ 10 pts")).toBeInTheDocument();
  // The "Missing" count label and the missing homework's badge.
  expect(screen.getAllByText("Missing")).toHaveLength(2);
  await user.click(screen.getByRole("tab", { name: /Ravi/ }));
  expect(await screen.findByText("95%")).toBeInTheDocument();
  expect(api.students.progress).toHaveBeenLastCalledWith("k2");
});

test("a student's progress shows the library instead of fees", async () => {
  api.me.children.mockResolvedValue({ data: [kid("k1", "Asha")] });
  api.students.progress.mockResolvedValue({ data: progress({ fees: null }) });
  await renderAs(<Progress />, "student");
  expect(await screen.findByRole("heading", { name: "My progress" })).toBeInTheDocument();
  expect(await screen.findByText("1 book")).toBeInTheDocument();
  expect(screen.queryByText("Fees due")).not.toBeInTheDocument();
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
});

test("staff don't get the family progress page", async () => {
  await renderAs(<Progress />, "teacher");
  expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
});

test("parent sees bills and payments with a receipt link", async () => {
  api.me.children.mockResolvedValue({ data: [kid("k1", "Asha")] });
  api.students.fees.mockResolvedValue({ data: {
    summary: { billed: 1000, paid: 400, balance: 600, overdue: 600, overdueCount: 1, status: "overdue", currency: "INR", locale: "en-IN" },
    invoices: [{ id: "i1", title: "Term 2 fee", academicYear: "2026-2027", amount: 1000, balance: 600, status: "partial", overdue: true, dueDate: "2026-10-01", payments: [{ id: "p1", amount: 400, method: "upi", paidAt: "2026-09-20T00:00:00Z", receiptNumber: "RCPT-GVPS-2026-00001" }] }],
  } });
  await renderAs(<Fees />, "parent");
  expect(await screen.findByText("₹600 is overdue. Please pay at the school office.")).toBeInTheDocument();
  expect(screen.getByText(/RCPT-GVPS-2026-00001/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Receipt" })).toHaveAttribute("href", "/fees/receipt?student=k1&invoice=i1&payment=p1");
});

test("receipt prints the amount, method and balance", async () => {
  Object.assign(useRouter().query, { student: "k1", invoice: "i1", payment: "p1" });
  api.students.receipt.mockResolvedValue({ data: {
    receiptNumber: "RCPT-GVPS-2026-00001", paidAt: "2026-09-20T00:00:00Z", amount: 400, amountText: "₹400", method: "upi", reference: "UPI123",
    invoice: { title: "Term 2 fee", academicYear: "2026-2027", amount: 1000, balanceAfter: 600 },
    student: { name: "Asha Iyer", admissionNumber: "GVPS-2026-00001", className: "7", section: "A", father: "Ganesh Iyer" },
    school: { name: "Green Valley", address: "14 Beach Road", city: "Parangipettai" }, currency: "INR", locale: "en-IN",
  } });
  render(<Receipt />);
  expect(await screen.findByText("₹400")).toBeInTheDocument();
  expect(screen.getByText("Ganesh Iyer for Asha Iyer")).toBeInTheDocument();
  expect(screen.getByText("UPI · ref UPI123")).toBeInTheDocument();
  expect(screen.getByText("₹600")).toBeInTheDocument();
  expect(api.students.receipt).toHaveBeenCalledWith("k1", "i1", "p1");
  for (const k of ["student", "invoice", "payment"]) delete useRouter().query[k];
});

test("class insights: a teacher filters to students who need attention", async () => {
  api.insights.forClass.mockResolvedValue({ data: {
    school: { id: "s1", name: "Green Valley" }, className: "7", section: "A", range: { from: "2026-04-01" }, currency: "INR", locale: "en-IN",
    summary: { students: 2, averageAttendance: 61, averageResult: 52, passRate: 50, homeworkHandInRate: 50, needsAttention: 1 },
    daily: [{ date: "2026-11-25", percentage: 50 }, { date: "2026-11-26", percentage: 100 }],
    rows: [
      { student: { id: "k1", name: "Asha Iyer", rollNumber: 1 }, attendance: { percentage: 95, absent: 1 }, latestResult: { exam: "Term 1", percentage: 84, grade: "A2", passed: true, status: "published" }, homework: { due: 2, handedIn: 2 }, flags: [] },
      { student: { id: "k2", name: "Ravi Kumar", rollNumber: 2 }, attendance: { percentage: 27, absent: 11 }, latestResult: { exam: "Term 1", percentage: 20, grade: "E", passed: false, status: "draft" }, homework: { due: 2, handedIn: 0 }, flags: ["low_attendance", "failing", "missing_homework"] },
    ],
  } });
  const user = userEvent.setup();
  await renderAs(<Insights />, "teacher");
  await waitFor(() => expect(api.insights.forClass).toHaveBeenCalledWith({ school: "s1", className: "7", section: "A" }));
  expect(await screen.findByText("61%")).toBeInTheDocument();
  expect(screen.getByText("On track")).toBeInTheDocument();
  expect(screen.queryByText("Fees due")).not.toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Need attention (1)" }));
  const rows = screen.getAllByRole("row").slice(1);
  expect(rows).toHaveLength(1);
  expect(within(rows[0]).getByText("2. Ravi Kumar")).toBeInTheDocument();
  expect(within(rows[0]).getByText("Attendance below 75%")).toBeInTheDocument();
  expect(within(rows[0]).getByText(/Term 1 · draft/)).toBeInTheDocument();
});

test("class insights is closed to parents", async () => {
  await renderAs(<Insights />, "parent");
  expect(await screen.findByText("You don't have access to this page")).toBeInTheDocument();
  expect(api.insights.forClass).not.toHaveBeenCalled();
});
