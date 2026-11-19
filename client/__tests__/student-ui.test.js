import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/router";
import GlobalSearch from "../components/search/GlobalSearch";
import StudentForm, { blankStudent, fromStudent } from "../components/forms/StudentForm";
import ProfileHeader from "../components/student/ProfileHeader";
import AttendanceTab from "../components/student/AttendanceTab";
import FeesTab from "../components/student/FeesTab";
import { api, ApiError } from "../services/api";

jest.mock("next/router", () => ({ useRouter: jest.fn() }));
jest.mock("../services/api", () => {
  const actual = jest.requireActual("../services/api");
  return {
    ...actual,
    api: {
      search: jest.fn(),
      schools: { list: jest.fn(() => Promise.resolve({ data: [{ id: "s1", name: "Green Valley", code: "GVPS", active: true }] })) },
      students: {
        uploadPhoto: jest.fn(), removePhoto: jest.fn(), setStatus: jest.fn(), remove: jest.fn(),
        attendance: jest.fn(), markAttendance: jest.fn(), clearAttendance: jest.fn(),
        recordPayment: jest.fn(), createFee: jest.fn(), deleteFee: jest.fn(), removePayment: jest.fn(),
      },
    },
  };
});

const push = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  useRouter.mockReturnValue({ pathname: "/", asPath: "/", query: {}, push, replace: jest.fn(), back: jest.fn() });
});

const kavya = {
  id: "st1", firstName: "Kavya", lastName: "Iyer", admissionNumber: "GVPS-2026-00001", className: "5", section: "A",
  rollNumber: 3, status: "active", dateOfBirth: "2016-04-02T00:00:00.000Z", school: { id: "s1", name: "Green Valley", code: "GVPS" },
  photoUrl: null, address: "4 Temple Road", gender: "female", academicYear: "2026-2027", father: { name: "Ganesh", phone: "9876543210" },
};

describe("GlobalSearch", () => {
  test("suggests students as you type and opens the chosen one", async () => {
    api.search.mockResolvedValue({ data: [kavya, { ...kavya, id: "st2", firstName: "Kavin" }] });
    const user = userEvent.setup();
    render(<GlobalSearch />);
    const box = screen.getByRole("combobox", { name: "Search students" });
    await user.type(box, "k");
    expect(api.search).not.toHaveBeenCalled(); // needs two letters
    await user.type(box, "a");
    await waitFor(() => expect(api.search).toHaveBeenCalledWith("ka"));
    const list = screen.getByRole("listbox");
    await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(2));
    expect(within(list).getAllByRole("option")[0]).toHaveTextContent("GVPS-2026-00001 · Fifth Standard A · Green Valley");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledWith("/students/st2");
  });

  test("click a suggestion; empty results say so", async () => {
    api.search.mockResolvedValueOnce({ data: [kavya] }).mockResolvedValueOnce({ data: [] });
    const user = userEvent.setup();
    render(<GlobalSearch />);
    await user.type(screen.getByRole("combobox"), "kav");
    await user.click(await screen.findByRole("option", { name: /Kavya Iyer/ }));
    expect(push).toHaveBeenCalledWith("/students/st1");
    await user.type(screen.getByRole("combobox"), "zzz");
    expect(await screen.findByText(/No students match “zzz”/)).toBeInTheDocument();
  });
});

describe("StudentForm", () => {
  test("validates required fields, shows bus route only for the school bus, submits a clean body", async () => {
    const onSubmit = jest.fn(() => Promise.resolve());
    const user = userEvent.setup();
    render(<StudentForm initial={blankStudent()} isNew submitLabel="Add student" onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Add student" }));
    for (const msg of ["Select a school", "First name is required", "Select a class", "Address is required"]) {
      expect(screen.getByText(msg)).toBeInTheDocument();
    }
    expect(onSubmit).not.toHaveBeenCalled();

    await screen.findByRole("option", { name: "Green Valley" });
    await user.selectOptions(screen.getByLabelText(/^School/), "s1");
    await user.selectOptions(screen.getByLabelText(/^Class/), "5");
    await user.type(screen.getByLabelText(/^First name/), "Kavya");
    await user.type(screen.getByLabelText(/^Last name/), "Iyer");
    await user.type(screen.getByLabelText(/^Date of birth/), "2016-04-02");
    await user.selectOptions(screen.getByLabelText(/^Gender/), "female");
    await user.type(screen.getByLabelText(/^Home address/), "4 Temple Road");
    await user.type(screen.getByLabelText(/^Roll number/), "3");
    expect(screen.queryByLabelText("Bus route")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Transport"), "school_bus");
    await user.type(screen.getByLabelText("Bus route"), "Route 2");
    await user.click(screen.getByRole("button", { name: "Add student" }));
    const body = onSubmit.mock.calls[0][0];
    expect(body).toMatchObject({ school: "s1", className: "5", firstName: "Kavya", rollNumber: 3, transport: "school_bus", busRoute: "Route 2" });
    expect(body.medicalNotes).toBeUndefined();
  });

  test("keeps typing focus and shows server field errors when editing", async () => {
    const onSubmit = jest.fn(() => Promise.reject(new ApiError("Validation failed", { status: 400, errors: [{ field: "email", message: "Enter a valid email address" }] })));
    const user = userEvent.setup();
    render(<StudentForm initial={fromStudent(kavya)} submitLabel="Save changes" onSubmit={onSubmit} />);
    expect(screen.queryByLabelText(/^School/)).not.toBeInTheDocument();
    const first = screen.getByLabelText(/^First name/);
    await user.clear(first);
    await user.type(first, "Kavitha");
    expect(first).toHaveFocus();
    expect(first).toHaveValue("Kavitha");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSubmit.mock.calls[0][0].school).toBeUndefined();
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
  });
});

describe("ProfileHeader photo", () => {
  test("uploads a chosen photo and refuses files over 5 MB", async () => {
    const onChange = jest.fn();
    api.students.uploadPhoto.mockResolvedValue({ data: { ...kavya, photoUrl: "/api/students/st1/photo?v=1" } });
    const user = userEvent.setup();
    render(<ProfileHeader student={kavya} onChange={onChange} onDeleted={jest.fn()} />);
    const input = screen.getByTestId("photo-input");
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    await user.upload(input, big);
    expect(screen.getByRole("alert")).toHaveTextContent("5 MB or smaller");
    expect(api.students.uploadPhoto).not.toHaveBeenCalled();

    const ok = new File(["img"], "me.jpg", { type: "image/jpeg" });
    await user.upload(input, ok);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ photoUrl: "/api/students/st1/photo?v=1" }), "Photo updated"));
    expect(api.students.uploadPhoto).toHaveBeenCalledWith("st1", ok);
  });

  test("delete asks for confirmation first", async () => {
    const onDeleted = jest.fn();
    api.students.remove.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ProfileHeader student={kavya} onChange={jest.fn()} onDeleted={onDeleted} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog");
    expect(api.students.remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });
});

describe("AttendanceTab", () => {
  test("shows the month calendar and marks a day", async () => {
    jest.useFakeTimers({ now: new Date("2026-11-18T09:00:00"), doNotFake: ["setTimeout", "clearTimeout", "queueMicrotask"] });
    api.students.attendance.mockResolvedValue({
      data: { summary: { present: 1, absent: 1, late: 0, leave: 0 }, records: [{ date: "2026-11-02", status: "present" }, { date: "2026-11-03", status: "absent" }] },
    });
    api.students.markAttendance.mockResolvedValue({ message: "Marked late for 2026-11-04" });
    const onChanged = jest.fn();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(
      <AttendanceTab studentId="st1" onChanged={onChanged}
        yearSummary={{ from: "2026-04-01", summary: { percentage: 72.5, workingDays: 40, present: 28, absent: 10, late: 2, half_day: 0, leave: 0, holiday: 1 } }} />
    );
    expect(screen.getByText("72.5%")).toBeInTheDocument();
    expect(screen.getByText(/Below 75%/)).toBeInTheDocument();
    expect(await screen.findByRole("gridcell", { name: "2026-11-03: Absent" })).toBeInTheDocument();
    expect(api.students.attendance).toHaveBeenCalledWith("st1", { from: "2026-11-01", to: "2026-11-18" });
    expect(screen.getByRole("gridcell", { name: "2026-11-25: not marked" })).toBeDisabled();
    await user.click(screen.getByRole("gridcell", { name: "2026-11-04: not marked" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Late" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("Marked late for 2026-11-04"));
    expect(api.students.markAttendance).toHaveBeenCalledWith("st1", "2026-11-04", "late");
    jest.useRealTimers();
  });
});

describe("FeesTab", () => {
  const fees = {
    summary: { billed: 24000, paid: 12000, balance: 12000, overdue: 12000, overdueCount: 1, status: "overdue" },
    invoices: [
      { id: "f1", title: "Term 1 tuition fee", academicYear: "2026-2027", amount: 12000, dueDate: "2026-06-15T00:00:00.000Z", paid: 12000, balance: 0, status: "paid", overdue: false,
        payments: [{ id: "p1", amount: 12000, method: "upi", paidAt: "2026-06-10T00:00:00.000Z", receiptNumber: "RCPT-GVPS-2026-00001" }] },
      { id: "f2", title: "Term 2 tuition fee", academicYear: "2026-2027", amount: 12000, dueDate: "2026-10-15T00:00:00.000Z", paid: 0, balance: 12000, status: "unpaid", overdue: true, payments: [] },
    ],
  };

  test("shows balances and records a payment for the amount due", async () => {
    api.students.recordPayment.mockResolvedValue({ message: "₹12000 recorded. Receipt RCPT-GVPS-2026-00002" });
    const onChanged = jest.fn();
    const user = userEvent.setup();
    render(<FeesTab studentId="st1" fees={fees} onChanged={onChanged} />);
    expect(screen.getByText("1 overdue")).toBeInTheDocument();
    expect(screen.getByText("RCPT-GVPS-2026-00001")).toBeInTheDocument();
    expect(screen.getByText("Overdue", { selector: ".badge" })).toBeInTheDocument();
    // Paid invoices have no "Record payment" button.
    expect(screen.getAllByRole("button", { name: "Record payment" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Record payment" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Amount (₹)")).toHaveValue(12000);
    await user.type(within(dialog).getByLabelText("Reference"), "UPI-42");
    await user.click(within(dialog).getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(api.students.recordPayment).toHaveBeenCalledWith("st1", "f2", expect.objectContaining({ amount: 12000, method: "upi", reference: "UPI-42" }));
  });
});
