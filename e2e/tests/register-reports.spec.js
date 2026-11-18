const fs = require("fs");
const { test, expect, uniqueChild, seedStudent } = require("./fixtures");

test("mark a whole class in the register; it shows on each student's calendar", async ({ page }) => {
  // A fresh class so earlier tests don't affect counts.
  const section = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  const kids = [uniqueChild(), uniqueChild(), uniqueChild()];
  const ids = [];
  for (const [i, k] of kids.entries()) ids.push((await seedStudent(page.request, k, { className: "8", section, rollNumber: i + 1 })).id);

  await page.goto("/attendance");
  await page.getByLabel("School").selectOption({ label: "E2E Test School" });
  await page.getByLabel("Class").selectOption("8");
  await page.getByLabel("Section").fill(section);
  await expect(page.getByText("3 students · 0 present · 0 absent · 3 not marked")).toBeVisible();

  await page.getByRole("radiogroup", { name: `Attendance for ${kids[1].firstName} ${kids[1].lastName}` }).getByRole("radio", { name: "Absent" }).click();
  await page.getByRole("button", { name: "Mark rest present" }).click();
  await page.getByRole("button", { name: "Save attendance (3 changes)" }).click();
  await expect(page.getByText("Attendance saved for 3 students")).toBeVisible();
  await expect(page.getByRole("button", { name: "All saved" })).toBeDisabled();

  // Re-opening the register shows the saved marks.
  await page.reload();
  await expect(page.getByText("3 students · 2 present · 1 absent")).toBeVisible();

  // The absent student's calendar has today marked absent.
  await page.getByRole("link", { name: `${kids[1].firstName} ${kids[1].lastName}` }).click();
  await expect(page.getByRole("tab", { name: "Attendance" })).toHaveAttribute("aria-selected", "true");
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  await expect(page.getByRole("gridcell", { name: `${iso}: Absent` })).toBeVisible();
});

test("fee defaulters report lists an overdue student and downloads as CSV", async ({ page }) => {
  const child = uniqueChild();
  const s = await seedStudent(page.request, child);
  await page.request.post(`/api/students/${s.id}/fees`, { data: { academicYear: "2026-2027", title: "Term 1", amount: 8800, dueDate: "2026-06-15" } });

  await page.goto("/reports");
  await expect(page.getByRole("link", { name: `${child.firstName} ${child.lastName}` })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Download CSV/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^edupro-fee-defaulters-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = fs.readFileSync(await download.path(), "utf8");
  expect(text.startsWith("﻿Admission no.,Name")).toBe(true);
  expect(text).toContain(`${child.firstName} ${child.lastName},E2E Test School,5,C`);
  expect(text).toContain(",8800,8800,1,2026-06-15");

  await page.getByRole("tab", { name: "Student list" }).click();
  await expect(page.getByRole("link", { name: /Download CSV/ })).toHaveAttribute("href", "/api/reports/students?format=csv");
});
