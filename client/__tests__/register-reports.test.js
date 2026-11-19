import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Register from "../pages/attendance";
import Reports from "../pages/reports";
import { api } from "../services/api";

jest.mock("../services/api", () => {
  const actual = jest.requireActual("../services/api");
  return {
    ...actual,
    api: {
      ...actual.api,
      search: jest.fn(),
      schools: { list: jest.fn(() => Promise.resolve({ data: [{ id: "s1", name: "Green Valley", code: "GVPS", active: true }] })) },
      register: { get: jest.fn(), save: jest.fn() },
      reports: { get: jest.fn(), csvUrl: actual.api.reports.csvUrl },
    },
  };
});

const kid = (id, first, roll, status = null) => ({
  id, firstName: first, lastName: "Iyer", rollNumber: roll, photoUrl: null, attendance: status ? { status } : null,
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe("attendance register", () => {
  test("loads a class, marks the rest present, and saves only changes", async () => {
    api.register.get.mockResolvedValue({
      data: { school: { id: "s1", name: "Green Valley" }, students: [kid("a", "Arjun", 1, "absent"), kid("b", "Bala", 2), kid("c", "Chitra", 3)] },
    });
    api.register.save.mockResolvedValue({ message: "Attendance saved for 3 students" });
    const user = userEvent.setup();
    render(<Register />);
    expect(screen.getByText("Choose a class")).toBeInTheDocument();

    await screen.findByRole("option", { name: "Green Valley" }); // only school is auto-selected
    await user.selectOptions(screen.getByLabelText("Class"), "5");
    await user.type(screen.getByLabelText("Section"), "a1");
    await waitFor(() => expect(api.register.get).toHaveBeenLastCalledWith(expect.objectContaining({ school: "s1", className: "5", section: "A" })));
    expect(await screen.findByText("3 students · 0 present · 1 absent · 2 not marked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All saved" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Mark rest present" }));
    const chitra = screen.getByRole("radiogroup", { name: "Attendance for Chitra Iyer" });
    await user.click(within(chitra).getByRole("radio", { name: "Late" }));
    expect(within(chitra).getByRole("radio", { name: "Late" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: "Save attendance (2 changes)" }));

    const body = api.register.save.mock.calls[0][0];
    expect(body).toMatchObject({ school: "s1", className: "5", section: "A" });
    expect(body.entries).toEqual([
      { student: "a", status: "absent" },
      { student: "b", status: "present" },
      { student: "c", status: "late" },
    ]);
    expect(await screen.findByText("Attendance saved for 3 students")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All saved" })).toBeDisabled();
    // The class is remembered for next time.
    expect(JSON.parse(localStorage.getItem("edupro.register"))).toEqual({ school: "s1", className: "5", section: "A" });
  });

  test("save errors are shown and the marks are kept", async () => {
    api.register.get.mockResolvedValue({ data: { school: { id: "s1", name: "Green Valley" }, students: [kid("a", "Arjun", 1)] } });
    api.register.save.mockRejectedValue(new Error("Some students are not in this class or are no longer active. Reload the register."));
    localStorage.setItem("edupro.register", JSON.stringify({ school: "s1", className: "5", section: "" }));
    const user = userEvent.setup();
    render(<Register />);
    const group = await screen.findByRole("radiogroup", { name: "Attendance for Arjun Iyer" });
    await user.click(within(group).getByRole("radio", { name: "Absent" }));
    await user.click(screen.getByRole("button", { name: /Save attendance/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reload the register");
    expect(within(group).getByRole("radio", { name: "Absent" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("reports", () => {
  test("lists the reports this user may run, filters, and builds the CSV link", async () => {
    api.reports.list = jest.fn(() => Promise.resolve({ data: [
      { id: "fee-defaulters", title: "Fee defaulters", group: "Fees", params: [] },
      { id: "low-attendance", title: "Low attendance", group: "Attendance", params: ["from", "to", "threshold"] },
    ] }));
    api.reports.get.mockImplementation((name) =>
      Promise.resolve({
        data: name === "fee-defaulters"
          ? { rows: [{ id: "a", name: "Arjun Iyer", className: "5", overdue: 12000 }], total: 1, overdue: 12000, columns: [{ key: "name", label: "Name" }, { key: "className", label: "Class" }, { key: "overdue", label: "Overdue (INR)" }] }
          : { rows: [], total: 0, columns: [] },
      })
    );
    const user = userEvent.setup();
    render(<Reports />);
    expect(await screen.findByText("1 rows · ₹12,000 overdue in total")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Arjun Iyer" })).toHaveAttribute("href", "/students/a");
    expect(screen.getByText("Fifth Standard", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download CSV/ })).toHaveAttribute("href", "/api/reports/fee-defaulters?format=csv");

    await screen.findAllByRole("option", { name: "Green Valley" }).catch(() => null);
    await user.selectOptions(screen.getByLabelText("Class"), "5");
    expect(api.reports.get).toHaveBeenLastCalledWith("fee-defaulters", { school: "", className: "5" });

    await user.click(screen.getAllByRole("button", { name: "Low attendance" })[0]);
    await user.selectOptions(screen.getByLabelText("Below"), "85");
    expect(api.reports.get).toHaveBeenLastCalledWith("low-attendance", { school: "", className: "5", threshold: "85" });
    expect(await screen.findByText("Nothing to report")).toBeInTheDocument();
  });
});
