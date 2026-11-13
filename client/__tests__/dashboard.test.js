import { render, screen } from "@testing-library/react";
import Dashboard from "../pages/index";
import { api } from "../services/api";

jest.mock("next/dynamic", () => () => {
  const Chart = ({ option }) => <div data-testid="chart">{JSON.stringify(option.series[0].data)}</div>;
  return Chart;
});
jest.mock("../services/api", () => ({ api: { dashboard: jest.fn() } }));

test("renders live counts and the per-class chart", async () => {
  api.dashboard.mockResolvedValue({
    data: {
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
  expect(await screen.findByText("3")).toBeInTheDocument();
  expect(screen.getByText("Aisha Rahman")).toBeInTheDocument();
  // LKG, UKG, 1, 2, ... in class order.
  expect(screen.getByTestId("chart")).toHaveTextContent("[1,0,0,2,0,0,0,0,0,0,0,0,0,0]");
});

test("shows empty states when the school has no data", async () => {
  api.dashboard.mockResolvedValue({
    data: { totalStudents: 0, pendingAdmissions: 0, approvedAwaitingEnrolment: 0, studentsByClass: [], recentAdmissions: [] },
  });
  render(<Dashboard />);
  expect(await screen.findByText("No students enrolled yet")).toBeInTheDocument();
  expect(screen.getByText("No applications yet")).toBeInTheDocument();
  expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
});
