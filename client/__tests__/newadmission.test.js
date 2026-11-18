import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewAdmission from "../pages/newadmission";
import { api, ApiError } from "../services/api";

jest.mock("../services/api", () => {
  const actual = jest.requireActual("../services/api");
  return {
    ...actual,
    api: {
      admissions: { create: jest.fn() },
      schools: { list: jest.fn(() => Promise.resolve({ data: [{ id: "s1", name: "Green Valley", code: "GVPS", active: true }, { id: "s2", name: "Closed School", code: "CS", active: false }] })) },
    },
  };
});

async function fillValid(user) {
  await screen.findByRole("option", { name: "Green Valley" });
  await user.selectOptions(screen.getByLabelText(/^school/i), "s1");
  await user.type(screen.getByLabelText(/^first name/i), "Aisha");
  await user.type(screen.getByLabelText(/^last name/i), "Rahman");
  await user.type(screen.getByLabelText(/date of birth/i), "14/03/2018");
  await user.keyboard("{Escape}");
  await user.selectOptions(screen.getByLabelText(/^gender/i), "female");
  await user.type(screen.getByLabelText(/^address/i), "12 Main Street");
  await user.selectOptions(screen.getByLabelText(/class applied for/i), "2");
  await user.type(screen.getByLabelText(/father's name/i), "Imran");
  await user.type(document.getElementById("father.phone"), "9876543210");
}

beforeEach(() => jest.clearAllMocks());

test("shows required-field errors and does not call the API", async () => {
  const user = userEvent.setup();
  render(<NewAdmission />);
  await user.click(screen.getByRole("button", { name: /submit application/i }));
  expect(screen.getByText("Please fix the highlighted fields.")).toBeInTheDocument();
  expect(screen.getByText("First name is required")).toBeInTheDocument();
  expect(screen.getByText("Date of birth is required")).toBeInTheDocument();
  expect(screen.getByText("Select a class")).toBeInTheDocument();
  expect(screen.getByText("Select a school")).toBeInTheDocument();
  expect(screen.getByText("Enter at least one parent or guardian name")).toBeInTheDocument();
  expect(api.admissions.create).not.toHaveBeenCalled();
});

test("only schools accepting students are offered", async () => {
  render(<NewAdmission />);
  expect(await screen.findByRole("option", { name: "Green Valley" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Closed School" })).not.toBeInTheDocument();
});

test("validates phone and email format", async () => {
  const user = userEvent.setup();
  render(<NewAdmission />);
  await user.type(document.getElementById("mother.phone"), "12ab");
  await user.type(document.getElementById("mother.email"), "not-an-email");
  await user.click(screen.getByRole("button", { name: /submit application/i }));
  expect(screen.getByText("Enter a valid phone number")).toBeInTheDocument();
  expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
});

test("clears a field's error when it is edited", async () => {
  const user = userEvent.setup();
  render(<NewAdmission />);
  await user.click(screen.getByRole("button", { name: /submit application/i }));
  await user.type(screen.getByLabelText(/^first name/i), "A");
  expect(screen.queryByText("First name is required")).not.toBeInTheDocument();
});

test("submits a valid application and shows the confirmation", async () => {
  let resolve;
  api.admissions.create.mockReturnValue(new Promise((r) => (resolve = r)));
  window.scrollTo = jest.fn();
  const user = userEvent.setup();
  render(<NewAdmission />);
  await fillValid(user);
  await user.click(screen.getByRole("button", { name: /submit application/i }));

  // Loading state: the button is disabled while the request is in flight.
  expect(screen.getByRole("button", { name: /submitting/i })).toBeDisabled();

  const payload = api.admissions.create.mock.calls[0][0];
  expect(payload).toMatchObject({
    school: "s1",
    firstName: "Aisha",
    lastName: "Rahman",
    dateOfBirth: "2018-03-14",
    gender: "female",
    classApplied: "2",
    father: { name: "Imran", phone: "9876543210" },
  });
  expect(payload.bloodGroup).toBeUndefined();

  resolve({ data: { applicationNumber: "APP-2026-00001", firstName: "Aisha", lastName: "Rahman" } });
  expect(await screen.findByText("APP-2026-00001")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /view admissions/i })).toHaveAttribute("href", "/admissions");

  await user.click(screen.getByRole("button", { name: /start another/i }));
  expect(screen.getByLabelText(/^first name/i)).toHaveValue("");
});

test("shows server errors next to the right fields", async () => {
  api.admissions.create.mockRejectedValue(
    new ApiError("An application for this child is already open (APP-2026-00001).", {
      status: 409,
    })
  );
  const user = userEvent.setup();
  render(<NewAdmission />);
  await fillValid(user);
  await user.click(screen.getByRole("button", { name: /submit application/i }));
  expect(await screen.findByText(/already open \(APP-2026-00001\)/)).toBeInTheDocument();
  // Form data is kept so the user can correct it.
  expect(screen.getByLabelText(/^first name/i)).toHaveValue("Aisha");

  api.admissions.create.mockRejectedValue(
    new ApiError("Validation failed", {
      status: 400,
      errors: [{ field: "address", message: "Address is too long" }],
    })
  );
  await user.click(screen.getByRole("button", { name: /submit application/i }));
  expect(await screen.findByText("Address is too long")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText(/^address/i)).toHaveAttribute("aria-invalid", "true"));
});
