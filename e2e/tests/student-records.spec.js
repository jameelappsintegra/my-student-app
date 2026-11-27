const fs = require("fs");
const { test, expect, uniqueChild, seedStudent, ensureSchool } = require("./fixtures");

// A real PNG (64x64 indigo square) for the photo upload.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAkElEQVR4nO3PUQkAABDCUNPdr/0DrMfFEEF4ATb5qKZ4gTdANcULvAGqKV7gDVBN8QJvgGqKF3gDVFO8wBugmuIF3gDVFC/wBqimeIE3QDXFC7wBqile4A1QTfECb4Bqihd4A1RTvMAboJriBd4A1RQv8AaopniBN0A1xQu8AaopXuANUE3xAm+AaooXeANUezb0oVr0yZTQAAAAAElFTkSuQmCC",
  "base64"
);

test("add a student, upload a photo, edit, then delete", async ({ page }, testInfo) => {
  await ensureSchool(page.request);
  const child = uniqueChild();
  await page.goto("/students/new");
  await page.getByLabel("School *").selectOption({ label: "E2E Test School" });
  await page.getByLabel("Class *").selectOption("7");
  await page.getByLabel("Section").fill("b");
  await page.getByLabel("Roll number").fill("12");
  await page.getByLabel("First name *").fill(child.firstName);
  await page.getByLabel("Last name *").fill(child.lastName);
  await page.getByLabel("Date of birth *").fill("2014-02-10");
  await page.getByLabel("Gender *").selectOption("female");
  await page.getByLabel("Home address *").fill("5 Church Street, Parangipettai");
  await page.getByLabel("Transport").selectOption("school_bus");
  await page.getByLabel("Bus route").fill("Route 4");
  await page.getByLabel("Father's name").fill("Thomas Tester");
  await page.locator("#s-father-phone").fill("9876501234");
  await page.getByRole("button", { name: "Add student" }).click();

  await expect(page.getByText("Student added.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: `${child.firstName} ${child.lastName}` })).toBeVisible();
  await expect(page.getByText(/E2E-2026-\d{5} · E2E Test School/)).toBeVisible();
  await expect(page.getByText("Seventh Standard – Section B · Roll 12")).toBeVisible();
  await expect(page.getByText("Route 4")).toBeVisible();

  // Photo upload: the initials avatar is replaced by the photo.
  const file = testInfo.outputPath("photo.png");
  fs.writeFileSync(file, PNG);
  await page.getByTestId("photo-input").setInputFiles(file);
  await expect(page.getByText("Photo updated")).toBeVisible();
  const img = page.getByRole("img", { name: `Photo of ${child.firstName} ${child.lastName}` });
  await expect(img).toBeVisible();
  expect(await img.evaluate((el) => el.naturalWidth)).toBe(512);

  // Parents tab shows the parent with a call link.
  await page.getByRole("tab", { name: "Parents" }).click();
  await expect(page.getByRole("link", { name: "9876501234" })).toHaveAttribute("href", "tel:9876501234");

  // Edit.
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Section").fill("A");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved.")).toBeVisible();
  await expect(page.getByText("Seventh Standard – Section A · Roll 12")).toBeVisible();

  // Delete with confirmation; the student disappears from search.
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/students$/);
  const res = await page.request.get(`/api/search?q=${child.firstName}`);
  expect((await res.json()).data).toEqual([]);
});

test("global search, marks, attendance and fee payment on the profile", async ({ page }) => {
  const child = uniqueChild();
  const s = await seedStudent(page.request, child);
  await page.request.post(`/api/students/${s.id}/fees`, {
    data: { academicYear: "2026-2027", title: "Term 2 tuition fee", amount: 15000, dueDate: "2026-10-15" },
  });

  await page.goto("/");
  await page.getByRole("combobox", { name: "Search students" }).fill(child.firstName);
  // The first suggestion is pre-selected; Enter opens it.
  await expect(page.getByRole("option", { name: new RegExp(child.firstName) })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/students/${s.id}$`));

  // Academics: add marks; grade and total are computed.
  await page.getByRole("tab", { name: "Academics" }).click();
  await page.getByRole("button", { name: "Add marks" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Exam", { exact: true }).fill("Term 1");
  await d.getByLabel("English marks").fill("92");
  await d.getByLabel("Mathematics marks").fill("78");
  await d.getByRole("button", { name: "Save marks" }).click();
  await expect(page.getByText("Term 1 marks saved")).toBeVisible();
  await expect(page.getByText("170 / 200")).toBeVisible();
  await expect(page.getByText("85%", { exact: true })).toBeVisible();

  // Attendance: mark a day on the calendar.
  await page.getByRole("tab", { name: "Attendance" }).click();
  const day = page.getByRole("gridcell", { name: /: not marked$/ }).first();
  const label = await day.getAttribute("aria-label");
  await day.click();
  await page.getByRole("dialog").getByRole("button", { name: "Absent" }).click();
  await expect(page.getByRole("gridcell", { name: label.replace("not marked", "Absent") })).toBeVisible();

  // Fees: overdue bill, record full payment, receipt shown.
  await page.getByRole("tab", { name: "Fees" }).click();
  await expect(page.getByText("1 overdue")).toBeVisible();
  await page.getByRole("button", { name: "Record payment" }).click();
  const pay = page.getByRole("dialog");
  await expect(pay.getByLabel("Amount (₹)")).toHaveValue("15000");
  await pay.getByLabel("Reference").fill("UPI-E2E-1");
  await pay.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(/Receipt RCPT-E2E-2026-\d{5}/).first()).toBeVisible();
  await expect(page.getByText("All fees paid")).toBeVisible();
  await expect(page.getByText("Fees due").locator("..").getByText("Paid")).toBeVisible();
});

test("schools: add, edit and the guard on deleting a school with students", async ({ page }) => {
  const code = `S${Date.now().toString(36).slice(-5).toUpperCase()}`;
  await page.goto("/schools");
  await page.getByRole("button", { name: "Add school" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("School name *").fill(`Harbour School ${code}`);
  await d.getByLabel("Short code *").fill(code);
  await d.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`Harbour School ${code} added`)).toBeVisible();
  const card = page.locator("section", { hasText: `Harbour School ${code}` });
  await card.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("School deleted")).toBeVisible();

  const e2e = page.locator("section", { hasText: "E2E Test School" });
  await e2e.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("dialog").locator(".alert-error")).toContainText("Mark it inactive instead");
});
