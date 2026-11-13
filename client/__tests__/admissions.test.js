import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Admissions from "../pages/admissions";
import { api, ApiError } from "../services/api";

jest.mock("../services/api", () => {
  const actual = jest.requireActual("../services/api");
  return {
    ...actual,
    api: { admissions: { list: jest.fn(), setStatus: jest.fn(), enroll: jest.fn() } },
  };
});

const row = (status, extra = {}) => ({
  id: `id-${status}`,
  applicationNumber: `APP-2026-${status}`,
  firstName: "Kid",
  lastName: status,
  dateOfBirth: "2018-03-14T00:00:00.000Z",
  classApplied: "2",
  academicYear: "2026-2027",
  status,
  createdAt: "2026-11-13T10:00:00.000Z",
  ...extra,
});

const listOf = (rows, total = rows.length) => ({
  data: rows,
  pagination: { page: 1, limit: 10, total, totalPages: Math.ceil(total / 10) },
});

beforeEach(() => jest.clearAllMocks());

test("shows the actions each status allows", async () => {
  api.admissions.list.mockResolvedValue(
    listOf([row("submitted"), row("approved"), row("enrolled"), row("rejected")])
  );
  render(<Admissions />);
  const rowFor = async (s) => (await screen.findByText(`APP-2026-${s}`)).closest("tr");

  const submitted = within(await rowFor("submitted"));
  expect(submitted.getByRole("button", { name: "Start review" })).toBeInTheDocument();
  expect(submitted.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  expect(submitted.queryByRole("button", { name: "Enrol" })).not.toBeInTheDocument();

  expect(within(await rowFor("approved")).getByRole("button", { name: "Enrol" })).toBeInTheDocument();
  expect(within(await rowFor("enrolled")).queryAllByRole("button")).toHaveLength(0);
  expect(within(await rowFor("rejected")).queryAllByRole("button")).toHaveLength(0);
});

test("approving goes through a confirmation dialog and reloads", async () => {
  api.admissions.list.mockResolvedValue(listOf([row("under_review")]));
  api.admissions.setStatus.mockResolvedValue({ message: "Application marked approved" });
  const user = userEvent.setup();
  render(<Admissions />);

  await user.click(await screen.findByRole("button", { name: "Approve" }));
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByRole("textbox"), "All documents verified");
  await user.click(within(dialog).getByRole("button", { name: "Approve" }));

  expect(api.admissions.setStatus).toHaveBeenCalledWith("id-under_review", "approved", "All documents verified");
  expect(await screen.findByText("Application marked approved")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api.admissions.list).toHaveBeenCalledTimes(2);
});

test("cancel closes the dialog without calling the API", async () => {
  api.admissions.list.mockResolvedValue(listOf([row("submitted")]));
  const user = userEvent.setup();
  render(<Admissions />);
  await user.click(await screen.findByRole("button", { name: "Reject" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api.admissions.setStatus).not.toHaveBeenCalled();
});

test("enrolment errors stay in the dialog", async () => {
  api.admissions.list.mockResolvedValue(listOf([row("approved")]));
  api.admissions.enroll.mockRejectedValue(new ApiError("That roll number is already used in this section", { status: 409 }));
  const user = userEvent.setup();
  render(<Admissions />);
  await user.click(await screen.findByRole("button", { name: "Enrol" }));
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByRole("spinbutton"), "4");
  await user.click(within(dialog).getByRole("button", { name: "Enrol" }));
  expect(api.admissions.enroll).toHaveBeenCalledWith("id-approved", { section: "A", rollNumber: "4" });
  expect(await within(dialog).findByText(/roll number is already used/)).toBeInTheDocument();
});

test("filters reset to page 1 and are sent to the API", async () => {
  api.admissions.list.mockResolvedValue(listOf([row("submitted")], 25));
  const user = userEvent.setup();
  render(<Admissions />);
  await user.click(await screen.findByRole("button", { name: "Next" }));
  expect(api.admissions.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));

  await user.selectOptions(screen.getByLabelText(/filter by status/i), "approved");
  expect(api.admissions.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, status: "approved" }));

  await user.type(screen.getByLabelText(/search admissions/i), "  Aisha ");
  await user.click(screen.getByRole("button", { name: "Search" }));
  expect(api.admissions.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: "Aisha" }));
});

test("empty and error states", async () => {
  api.admissions.list.mockResolvedValueOnce(listOf([]));
  const { unmount } = render(<Admissions />);
  expect(await screen.findByText("No applications yet")).toBeInTheDocument();
  unmount();

  api.admissions.list.mockRejectedValueOnce(new ApiError("Cannot reach the EduPro server."));
  api.admissions.list.mockResolvedValueOnce(listOf([row("submitted")]));
  const user = userEvent.setup();
  render(<Admissions />);
  expect(await screen.findByText("Cannot reach the EduPro server.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("APP-2026-submitted")).toBeInTheDocument();
});
