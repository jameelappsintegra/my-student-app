const { test, expect, uniqueChild, seedApplication, ensureSchool } = require("./fixtures");

async function fillForm(page, child) {
  await page.getByLabel("School *").selectOption({ label: "E2E Test School" });
  await page.getByLabel("First name *").fill(child.firstName);
  await page.getByLabel("Last name *").fill(child.lastName);
  await page.getByLabel("Date of birth *").fill(child.dobInput);
  await page.keyboard.press("Escape");
  await page.getByLabel("Gender *").selectOption("female");
  await page.getByLabel("Address *").fill("12 Main Street, Parangipettai");
  await page.getByLabel("Class applied for *").selectOption("2");
  await page.getByLabel("Father's name").fill("Imran Rahman");
  await page.locator("#father\\.phone").fill("+91 98765 43210");
}

test("apply → review → approve → enrol → appears in students and dashboard", async ({ page }) => {
  await ensureSchool(page.request);
  const child = uniqueChild();
  await page.goto("/");
  const before = Number(await page.getByText("Active students").locator("..").locator("p").nth(1).innerText());

  await page.getByRole("link", { name: "New Admission" }).first().click();
  await fillForm(page, child);
  await page.getByRole("button", { name: "Submit application" }).click();
  const success = page.locator(".alert-success");
  await expect(success).toContainText(`${child.firstName} ${child.lastName} has been submitted`);
  const appNumber = (await success.locator("strong").innerText()).trim();
  expect(appNumber).toMatch(/^APP-\d{4}-\d{5}$/);

  await page.getByRole("link", { name: "View admissions" }).click();
  await page.getByLabel("Search admissions").fill(child.firstName);
  await page.getByRole("button", { name: "Search" }).click();
  const row = page.locator("tr", { hasText: appNumber });
  await expect(row).toContainText("Submitted");

  for (const [action, label] of [["Start review", "under review"], ["Approve", "approved"]]) {
    await row.getByRole("button", { name: action }).click();
    await page.getByRole("dialog").getByRole("button", { name: action }).click();
    await expect(page.locator(".alert-success")).toContainText(`marked ${label}`);
  }

  await row.getByRole("button", { name: "Enrol" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("spinbutton").fill("7");
  await dialog.getByRole("button", { name: "Enrol" }).click();
  await expect(page.locator(".alert-success")).toContainText(/admission number E2E-\d{4}-\d{5}/);
  await expect(row).toContainText("Enrolled");
  await expect(row.getByRole("button")).toHaveCount(0);

  await page.getByRole("link", { name: "Students", exact: true }).click();
  await page.getByLabel("Filter students").fill(child.firstName);
  await page.getByRole("button", { name: "Search" }).click();
  const studentRow = page.locator("tbody tr").first();
  await expect(studentRow).toContainText(`${child.firstName} ${child.lastName}`);
  await expect(studentRow).toContainText("Second Standard – A");
  await expect(studentRow).toContainText("E2E Test School");

  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.getByText("Active students").locator("..").locator("p").nth(1)).toHaveText(String(before + 1));
  await expect(page.locator("canvas")).toBeVisible();
});

test("client-side validation blocks an incomplete form", async ({ page }) => {
  await ensureSchool(page.request);
  let posted = false;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/admissions")) posted = true;
  });
  await page.goto("/newadmission");
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText("Please fix the highlighted fields.")).toBeVisible();
  await expect(page.getByText("First name is required")).toBeVisible();
  await expect(page.getByLabel("First name *")).toHaveAttribute("aria-invalid", "true");
  expect(posted).toBe(false);
});

test("duplicate application is refused with a clear message and the form is kept", async ({ page }) => {
  const child = uniqueChild();
  const existing = await seedApplication(page.request, child);
  await page.goto("/newadmission");
  await fillForm(page, child);
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.locator(".alert-error")).toContainText(`already open (${existing.applicationNumber})`);
  await expect(page.getByLabel("First name *")).toHaveValue(child.firstName);
});

test("rejecting with a reason closes the application", async ({ page }) => {
  const child = uniqueChild();
  const app = await seedApplication(page.request, child, "under_review");
  await page.goto("/admissions");
  const row = page.locator("tr", { hasText: app.applicationNumber });
  await row.getByRole("button", { name: "Reject" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("Class is full");
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect(row).toContainText("Rejected");
  await expect(row.getByRole("button")).toHaveCount(0);
});

test("enrolment conflict is shown in the dialog and nothing changes", async ({ page }) => {
  const a = await seedApplication(page.request, uniqueChild(), "approved");
  const b = await seedApplication(page.request, uniqueChild(), "approved");
  await page.request.post(`/api/admissions/${a.id}/enroll`, { data: { section: "Z", rollNumber: 1 } });

  await page.goto("/admissions?");
  await page.getByLabel("Filter by status").selectOption("approved");
  const row = page.locator("tr", { hasText: b.applicationNumber });
  await row.getByRole("button", { name: "Enrol" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("Z");
  await dialog.getByRole("spinbutton").fill("1");
  await dialog.getByRole("button", { name: "Enrol" }).click();
  await expect(dialog.locator(".alert-error")).toContainText("roll number is already used");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(row).toContainText("Approved");
});

test.describe("outage", () => {
  test.use({ allowConsole: [/ERR_FAILED/] });

  test("API outage shows an error state and recovers on retry", async ({ page }) => {
  await page.route("**/api/dashboard", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByText("Cannot reach the EduPro server")).toBeVisible();
  await page.unroute("**/api/dashboard");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Active students")).toBeVisible();
  });
});

test("every page loads without errors and placeholder pages are honest", async ({ page }) => {
  for (const [path, heading, title] of [
    ["/", "Dashboard", "Home"],
    ["/admissions", "Admissions"],
    ["/newadmission", "New Admission"],
    ["/students", "Students"],
    ["/students/new", "Add student"],
    ["/schools", "Schools"],
    ["/users", "Users"],
    ["/shares", "Shared records"],
    ["/students/import", "Import students from a spreadsheet", "Import students"],
    ["/account", "My account"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page).toHaveTitle(`${title || heading} · EduPro`);
  }
  // The old class page now redirects to Students.
  await page.goto("/myclass");
  await expect(page).toHaveURL(/\/students$/);
});
