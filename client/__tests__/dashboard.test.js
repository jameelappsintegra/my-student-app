import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "../components/home/AdminDashboard";
import { api } from "../services/api";

jest.mock("next/dynamic", () => () => {
  const Chart = ({ option }) => <div data-testid="chart">{JSON.stringify(option.series[0].data)}</div>;
  return Chart;
});
jest.mock("../services/api", () => ({
  api: {
    dashboard: jest.fn(),
    schools: { list: jest.fn(() => Promise.resolve({ data: [{ id: "s1", name: "Green Valley", code: "GVPS" }] })) },
  },
}));

const extras = {
  attendance: { date: "2026-11-17", marked: 40, present: 38, absent: 2, percentage: 95 },
  fees: { billed: 100000, collected: 70000, outstanding: 30000, overdue: 12000, overdueInvoices: 3 },
  studentsBySchool: [{ id: "s1", name: "Green Valley", code: "GVPS", active: true, count: 3 }],
};

test("renders live counts and the per-class chart", async () => {
  api.dashboard.mockResolvedValue({
    data: {
      ...extras,
      totalStudents: 3,
      pendingAdmissions: 2,
      approvedAwaitingEnrolment: 1,
      studentsByClass: [{ className: "2", count: 2 }, { className: "LKG", count: 1 }],
      recentAdmissions: [
        { id: "1", firstName: "Aisha", lastName: "Rahman", classApplied: "2", status: "submitted", createdAt: "2026-11-13T00:00:00Z" },
      ],
    },
  });
  render(<Dashboard />);
  expect(await screen.findByText("95%")).toBeInTheDocument();
  expect(screen.getByText("₹30,000")).toBeInTheDocument();
  expect(screen.getByText(/₹12,000 overdue on 3 bills/)).toBeInTheDocument();
  expect(screen.getByText("3 students")).toBeInTheDocument();
  expect(screen.getByText("Aisha Rahman")).toBeInTheDocument();
  // LKG, UKG, 1, 2, ... in class order.
  expect(screen.getByTestId("chart")).toHaveTextContent("[1,0,0,2,0,0,0,0,0,0,0,0,0,0]");
});

test("shows empty states when the school has no data", async () => {
  api.dashboard.mockResolvedValue({
    data: {
      ...extras,
      attendance: null,
      fees: { billed: 0, collected: 0, outstanding: 0, overdue: 0, overdueInvoices: 0 },
      studentsBySchool: [],
      totalStudents: 0, pendingAdmissions: 0, approvedAwaitingEnrolment: 0, studentsByClass: [], recentAdmissions: [],
    },
  });
  render(<Dashboard />);
  expect(await screen.findByText("No students enrolled yet")).toBeInTheDocument();
  expect(screen.getByText("No applications yet")).toBeInTheDocument();
  expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
});

test("choosing a school reloads the dashboard for that school", async () => {

  api.dashboard.mockResolvedValue({ data: { ...extras, totalStudents: 3, pendingAdmissions: 0, approvedAwaitingEnrolment: 0, studentsByClass: [], recentAdmissions: [] } });
  const user = userEvent.setup();
  render(<Dashboard />);
  await screen.findByText("95%");
  await user.click(screen.getByRole("button", { name: /Green Valley/ }));
  expect(api.dashboard).toHaveBeenLastCalledWith("s1");
});
