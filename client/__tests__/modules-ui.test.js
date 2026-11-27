import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationBell from "../components/common/NotificationBell";
import Leave from "../pages/leave";
import PublishResults from "../pages/results";
import Promote from "../pages/students/promote";
import Timetable from "../pages/timetable";
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
      search: jest.fn(() => Promise.resolve({ data: [] })),
      notifications: { list: jest.fn(), read: jest.fn(() => Promise.resolve({})) },
      schools: { list: jest.fn(() => Promise.resolve({ data: [{ id: "s1", name: "Green Valley", code: "GVPS", active: true }] })) },
      me: { children: jest.fn(() => Promise.resolve({ data: [{ id: "k1", firstName: "Asha", lastName: "Iyer", className: "5", section: "A", school: { id: "s1" } }] })) },
      leave: { list: jest.fn(), request: jest.fn(), decide: jest.fn(), cancel: jest.fn() },
      results: { status: jest.fn(), publish: jest.fn() },
      promotion: { run: jest.fn() },
      timetable: { forClass: jest.fn(), mine: jest.fn(), set: jest.fn(), clear: jest.fn() },
      users: { list: jest.fn(() => Promise.resolve({ data: [{ id: "t1", name: "Meera" }] })) },
    },
  };
});

const as = (role) => api.auth.me.mockResolvedValue({ data: { user: { id: "u", name: "Me", username: "me", role, permissions: permissionsFor(role) } } });
const renderAs = async (ui, role) => {
  as(role);
  render(<AuthProvider>{ui}</AuthProvider>);
  await waitFor(() => expect(api.auth.me).toHaveBeenCalled());
};
beforeEach(() => {
  jest.clearAllMocks();
  api.notifications.list.mockResolvedValue({ data: { items: [], unread: 0 } });
});

test("bell shows unread count and opens the linked page", async () => {
  api.notifications.list.mockResolvedValue({ data: { unread: 2, items: [
    { id: "n1", title: "Asha was absent today", body: "Marked absent", link: "/students/k1?tab=attendance", createdAt: new Date().toISOString() },
    { id: "n2", title: "Term 1 results published", createdAt: new Date().toISOString(), readAt: new Date().toISOString() },
  ] } });
  const user = userEvent.setup();
  render(<NotificationBell />);
  const bell = await screen.findByRole("button", { name: "Notifications, 2 unread" });
  await user.click(bell);
  await user.click(screen.getByRole("button", { name: /Asha was absent today/ }));
  expect(api.notifications.read).toHaveBeenCalledWith({ ids: ["n1"] });
});

test("parent requests leave for their child", async () => {
  api.leave.list.mockResolvedValue({ data: [] });
  api.leave.request.mockResolvedValue({ message: "Leave request sent to the class teacher." });
  const user = userEvent.setup();
  await renderAs(<Leave />, "parent");
  await screen.findByRole("option", { name: /Asha Iyer/ });
  await user.clear(screen.getByLabelText("From"));
  await user.type(screen.getByLabelText("From"), "2026-12-01");
  await user.clear(screen.getByLabelText("To"));
  await user.type(screen.getByLabelText("To"), "2026-12-02");
  await user.type(screen.getByLabelText("Reason"), "Family wedding");
  await user.click(screen.getByRole("button", { name: "Send to class teacher" }));
  expect(api.leave.request).toHaveBeenCalledWith({ student: "k1", from: "2026-12-01", to: "2026-12-02", reason: "Family wedding" });
  expect(await screen.findByText("Leave request sent to the class teacher.")).toBeInTheDocument();
});

test("teacher approves a pending leave request", async () => {
  api.leave.list.mockResolvedValue({ data: [{ id: "l1", status: "pending", from: "2026-12-01T00:00:00Z", to: "2026-12-02T00:00:00Z", reason: "Fever", student: { name: "Asha Iyer", className: "5", section: "A" }, requestedBy: "Mr Iyer" }] });
  api.leave.decide.mockResolvedValue({ message: "Leave approved; 2 school days marked as leave." });
  const user = userEvent.setup();
  await renderAs(<Leave />, "teacher");
  await user.click(await screen.findByRole("button", { name: "Review" }));
  await user.type(within(screen.getByRole("dialog")).getByRole("textbox"), "Get well soon");
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve" }));
  expect(api.leave.decide).toHaveBeenCalledWith("l1", true, "Get well soon");
  expect(await screen.findByText(/2 school days marked as leave/)).toBeInTheDocument();
});

test("principal publishes an exam that is still in draft", async () => {
  api.results.status.mockResolvedValue({ data: { students: 30, exams: [{ exam: "Term 1", results: 30, published: 30 }, { exam: "Mid-term", results: 28, published: 0 }] } });
  api.results.publish.mockResolvedValue({ message: "28 results published; 25 parents notified." });
  const user = userEvent.setup();
  await renderAs(<PublishResults />, "principal");
  await screen.findByRole("option", { name: "Green Valley" });
  await user.selectOptions(screen.getByLabelText("School"), "s1");
  await user.selectOptions(screen.getByLabelText("Class"), "7");
  const row = (await screen.findByText("Mid-term")).closest("tr");
  expect(within(row).getByText("Draft")).toBeInTheDocument();
  expect(within(screen.getByText("Term 1").closest("tr")).queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
  await user.click(within(row).getByRole("button", { name: "Publish" }));
  expect(api.results.publish).toHaveBeenCalledWith(expect.objectContaining({ school: "s1", className: "7", exam: "Mid-term", publish: true }));
  expect(await screen.findByText("28 results published; 25 parents notified.")).toBeInTheDocument();
});

test("promotion: preview, untick a repeating student, then promote", async () => {
  api.promotion.run
    .mockResolvedValueOnce({ data: { toClass: "6", plan: [{ id: "a", name: "Asha", admissionNumber: "X-1", action: "promote" }, { id: "b", name: "Bala", admissionNumber: "X-2", action: "promote" }], counts: { promote: 2 } } })
    .mockResolvedValueOnce({ message: "Done: 1 promoted to class 6, 0 graduated, 1 repeating.", data: {} });
  const user = userEvent.setup();
  await renderAs(<Promote />, "principal");
  await screen.findByRole("option", { name: "Green Valley" });
  await user.selectOptions(screen.getByLabelText("School"), "s1");
  await user.selectOptions(screen.getByLabelText("Class"), "5");
  await user.click(screen.getByRole("button", { name: "Preview" }));
  await user.click(await screen.findByRole("checkbox", { name: /Bala/ }));
  expect(screen.getByText("Repeats")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Promote 1 students" }));
  expect(api.promotion.run).toHaveBeenLastCalledWith(expect.objectContaining({ keep: ["b"], dryRun: false, className: "5" }));
  expect(await screen.findByText(/Done: 1 promoted/)).toBeInTheDocument();
});

test("timetable: principal sets a period; a clash message is shown", async () => {
  api.timetable.forClass.mockResolvedValue({ data: [] });
  api.timetable.set.mockRejectedValue(new (jest.requireActual("../services/api").ApiError)("That teacher already has Class 5 B in this period.", { status: 409 }));
  const user = userEvent.setup();
  await renderAs(<Timetable />, "principal");
  await screen.findByRole("option", { name: "Green Valley" });
  await user.selectOptions(screen.getByLabelText("School"), "s1");
  await user.selectOptions(screen.getByLabelText("Class"), "5");
  await user.click(await screen.findByRole("button", { name: "Mon period 1: free" }));
  const d = screen.getByRole("dialog");
  await user.type(within(d).getByLabelText("Subject"), "English");
  await user.selectOptions(within(d).getByLabelText("Teacher"), "t1");
  await user.click(within(d).getByRole("button", { name: "Save" }));
  expect(await within(d).findByText("That teacher already has Class 5 B in this period.")).toBeInTheDocument();
});
