import { render, screen } from "@testing-library/react";
import { useRouter } from "next/router";
import StudentProfile from "../pages/students/[id]";
import { api } from "../services/api";

jest.mock("next/router", () => ({ useRouter: jest.fn() }));
jest.mock("../services/api", () => {
  const actual = jest.requireActual("../services/api");
  return { ...actual, api: { ...actual.api, search: jest.fn(), students: { get: jest.fn(), attendance: jest.fn(), results: jest.fn(), fees: jest.fn() } } };
});

const router = { pathname: "/students/[id]", asPath: "/students/st", query: { id: "st" }, replace: jest.fn(), back: jest.fn(), push: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  useRouter.mockReturnValue(router);
});

const kid = { id: "st", firstName: "Shared", lastName: "Kid", admissionNumber: "OTH-2026-00001", className: "6", section: "A", status: "active", school: { id: "s2", name: "Away School" }, photoUrl: null };

test("own student: all tabs", async () => {
  api.students.get.mockResolvedValue({ data: { ...kid, address: "7 Road" } });
  api.students.attendance.mockResolvedValue({ data: { from: "2026-04-01", summary: { percentage: 90 }, records: [] } });
  api.students.results.mockResolvedValue({ data: [] });
  api.students.fees.mockResolvedValue({ data: { summary: { billed: 0, paid: 0, balance: 0, overdue: 0, status: "paid" }, invoices: [] } });
  render(<StudentProfile />);
  expect(await screen.findByRole("heading", { level: 1, name: "Shared Kid" })).toBeInTheDocument();
  expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Overview", "Academics", "Attendance", "Parents", "Fees"]);
});

test("shared student: banner, only approved tabs, no edit actions, no calls for hidden records", async () => {
  api.students.get.mockResolvedValue({ data: { ...kid, sharedAccess: { scopes: ["academic"], expiresAt: "2026-12-01T00:00:00Z" } } });
  api.students.results.mockResolvedValue({ data: [] });
  render(<StudentProfile />);
  expect(await screen.findByText(/Shared with you by Away School, read-only/)).toBeInTheDocument();
  expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Overview", "Academics"]);
  expect(screen.queryByRole("button", { name: /Edit|Delete|Change status/ })).not.toBeInTheDocument();
  expect(api.students.attendance).not.toHaveBeenCalled();
  expect(api.students.fees).not.toHaveBeenCalled();
});
