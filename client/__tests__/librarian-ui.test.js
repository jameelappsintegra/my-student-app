import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/router";
import Library from "../pages/library";
import LibrarianHome from "../components/home/LibrarianHome";
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
      notifications: { list: jest.fn(() => Promise.resolve({ data: { items: [], unread: 0 } })), read: jest.fn() },
      schools: { list: jest.fn(() => Promise.resolve({ data: [{ id: "s1", name: "Green Valley", code: "GVPS", active: true }] })) },
      library: {
        books: jest.fn(), issues: jest.fn(), issue: jest.fn(), returnBook: jest.fn(), settleFine: jest.fn(),
        renew: jest.fn(), remind: jest.fn(), remindOverdue: jest.fn(), reserve: jest.fn(), reservations: jest.fn(),
        cancelReservation: jest.fn(), dashboard: jest.fn(), importBooks: jest.fn(), importTemplateUrl: () => "/api/library/books/import/template",
      },
    },
  };
});

const as = (role) => api.auth.me.mockResolvedValue({ data: { user: { id: "u", name: "Lata Librarian", username: "lib", role, permissions: permissionsFor(role) } } });
const renderAs = async (ui, role) => {
  as(role);
  render(<AuthProvider>{ui}</AuthProvider>);
  await waitFor(() => expect(api.auth.me).toHaveBeenCalled());
};
beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(useRouter().query)) delete useRouter().query[k];
});

const DASH = {
  currency: "INR", locale: "en-IN",
  books: { titles: 120, copies: 300, onShelf: 260 },
  loans: { onLoan: 40, overdue: 2, dueToday: 3, thisMonth: 55, returnsThisMonth: 50 },
  fines: { due: 24, collectedThisMonth: 60, waivedThisMonth: 0, finePerDay: 2 },
  reservations: { waiting: 4, ready: 1 },
  popular: [{ id: "b1", title: "Wings of Fire", author: "Kalam", loans: 9 }],
  overdue: [{ id: "l1", book: { title: "Malgudi Days" }, student: { name: "Ravi Kumar", className: "7", section: "A" }, dueAt: "2026-11-20T00:00:00Z", daysLate: 6 }],
};

test("librarian dashboard: counts, overdue list with reminders, popular books", async () => {
  api.library.dashboard.mockResolvedValue({ data: DASH });
  api.library.remind.mockResolvedValue({ message: "Reminder sent to 2 family accounts." });
  api.library.remindOverdue.mockResolvedValue({ message: "Reminders sent for 2 of 2 overdue loans." });
  const user = userEvent.setup();
  await renderAs(<LibrarianHome />, "librarian");
  expect(await screen.findByText("Good day, Lata")).toBeInTheDocument();
  expect(await screen.findByText("120")).toBeInTheDocument();
  expect(screen.getByText("300 copies · 260 on the shelf")).toBeInTheDocument();
  expect(screen.getByText("₹24")).toBeInTheDocument();
  expect(screen.getByText("1 ready to collect · 4 waiting")).toBeInTheDocument();
  expect(screen.getByText("6 days · ₹12")).toBeInTheDocument();
  expect(screen.getByText("Wings of Fire")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Remind" }));
  expect(api.library.remind).toHaveBeenCalledWith("l1");
  expect(await screen.findByText("Reminder sent to 2 family accounts.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Remind all overdue" }));
  expect(api.library.remindOverdue).toHaveBeenCalledWith("s1");
});

test("a student reserves a book that's out and sees their place", async () => {
  api.library.reservations.mockResolvedValue({ data: [] });
  api.library.books
    .mockResolvedValueOnce({ data: [
      { id: "b1", school: "s1", title: "Wings of Fire", copies: 1, issued: 1, available: 0, onHold: 0, waiting: 1, myReservation: null },
      { id: "b2", school: "s1", title: "Malgudi Days", copies: 2, issued: 0, available: 2, onHold: 0, waiting: 0, myReservation: null },
    ] })
    .mockResolvedValue({ data: [{ id: "b1", school: "s1", title: "Wings of Fire", copies: 1, issued: 1, available: 0, onHold: 0, waiting: 2, myReservation: { id: "r1", status: "waiting" } }] });
  api.library.reserve.mockResolvedValue({ message: "Reserved. Asha is number 2 in the queue; you'll be told when it's ready to collect." });
  const user = userEvent.setup();
  await renderAs(<Library />, "student");
  expect(await screen.findByText("On the shelf: ask at the library desk")).toBeInTheDocument();
  expect(screen.getByText("1 waiting")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reserve" }));
  expect(api.library.reserve).toHaveBeenCalledWith("b1");
  expect(await screen.findByText(/number 2 in the queue/)).toBeInTheDocument();
  expect(await screen.findByText("Reserved · in the queue")).toBeInTheDocument();
});

test("librarian can lend a copy kept for a reservation, and sees the queue", async () => {
  api.library.books.mockResolvedValue({ data: [{ id: "b1", school: "s1", title: "Wings of Fire", copies: 1, issued: 0, available: 0, onHold: 1, waiting: 1 }] });
  await renderAs(<Library />, "librarian");
  expect(await screen.findByText("1 kept for reservations · 1 waiting")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Lend" })).toBeEnabled();
});

test("loans: renew on time, remind when overdue, remind all", async () => {
  useRouter().query.tab = "loans";
  useRouter().query.status = "overdue";
  api.library.books.mockResolvedValue({ data: [] });
  api.library.issues.mockResolvedValue({ data: [
    { id: "l1", book: { title: "Malgudi Days" }, student: { name: "Ravi Kumar", className: "7" }, dueAt: "2026-11-20T00:00:00Z", overdue: true, renewals: 1, remindedAt: "2026-11-25T00:00:00Z" },
  ] });
  api.library.remind.mockResolvedValue({ message: "Reminder sent to 1 family account." });
  const user = userEvent.setup();
  await renderAs(<Library />, "librarian");
  await waitFor(() => expect(api.library.issues).toHaveBeenCalledWith({ school: "s1", status: "overdue" }));
  const row = (await screen.findAllByRole("row"))[1];
  expect(within(row).getByText("Renewed 1×")).toBeInTheDocument();
  expect(within(row).getByText("Reminded 25 Nov 2026")).toBeInTheDocument();
  expect(within(row).queryByRole("button", { name: "Renew" })).not.toBeInTheDocument();
  await user.click(within(row).getByRole("button", { name: "Remind" }));
  expect(api.library.remind).toHaveBeenCalledWith("l1");
  expect(screen.getByRole("button", { name: "Remind all overdue" })).toBeInTheDocument();
});

test("import: check the file, see row problems, nothing imported", async () => {
  useRouter().query.tab = "import";
  api.library.books.mockResolvedValue({ data: [] });
  const { ApiError } = jest.requireActual("../services/api");
  api.library.importBooks.mockResolvedValueOnce({ message: "Ready to import 2 new books and add copies to 1.", data: { rows: 3, newBooks: 2, addedCopiesTo: 1, copies: 6, errors: [] } })
    .mockRejectedValueOnce(new ApiError("Nothing was imported: fix the problems and upload again.", { status: 400, errors: [{ row: 3, field: "title", message: "Enter the title" }] }));
  const user = userEvent.setup();
  await renderAs(<Library />, "librarian");
  expect(await screen.findByRole("link", { name: "Download the template" })).toHaveAttribute("href", "/api/library/books/import/template");
  const file = new File(["title\nX\n"], "books.csv", { type: "text/csv" });
  await user.upload(screen.getByLabelText("CSV file"), file);
  await user.click(screen.getByRole("button", { name: "Check file" }));
  expect(api.library.importBooks).toHaveBeenCalledWith("s1", file, true);
  expect(await screen.findByText("3 rows · 2 new books · 1 existing books get more copies · 6 copies in total")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Import" }));
  expect(await screen.findByText("Row 3 (title): Enter the title")).toBeInTheDocument();
});
