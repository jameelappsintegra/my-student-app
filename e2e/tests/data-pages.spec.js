// Progress, fees & receipts for parents; class insights for teachers.
const { test, expect, uniqueChild, ensureSchool, api } = require("./fixtures");

const PW = "e2e-data-password-123";

async function signInAs(browser, username, opts = {}) {
  const ctx = await browser.newContext({ baseURL: process.env.E2E_WEB_URL || "http://localhost:3055", ...opts });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await expect(page.locator("main h1")).toBeVisible();
  return { ctx, page };
}

test("parent sees progress and prints a receipt; teacher sees who needs attention", async ({ page, browser }) => {
  const tag = Date.now().toString(36).slice(-4);
  const school = await ensureSchool(page.request);
  const section = "D";
  const kid = uniqueChild();
  const s = await api(page.request, "POST", "/students", {
    school: school.id, firstName: kid.firstName, lastName: "Data", dateOfBirth: kid.dobIso, gender: "female",
    address: "5 Garden Road", className: "3", section, rollNumber: 1, academicYear: "2026-2027", father: { name: "Data Father", phone: "9876543210" },
  });
  await api(page.request, "POST", "/users", { username: `t.data.${tag}`, password: PW, role: "teacher", name: "Data Teacher", assignments: [{ school: school.id, className: "3", section }] });
  await api(page.request, "POST", "/users", { username: `p.data.${tag}`, password: PW, role: "parent", name: "Data Parent", children: [s.id] });
  await api(page.request, "POST", `/students/${s.id}/results`, { academicYear: "2026-2027", exam: "Unit 1", subjects: [{ subject: "Maths", maxMarks: 50, marks: 10 }] });
  await api(page.request, "POST", "/results/publish", { school: school.id, className: "3", section, academicYear: "2026-2027", exam: "Unit 1" });
  const inv = await api(page.request, "POST", `/students/${s.id}/fees`, { academicYear: "2026-2027", title: "Annual fee", amount: 2000, dueDate: "2026-12-31" });
  await api(page.request, "POST", `/students/${s.id}/fees/${inv.id}/payments`, { amount: 500, method: "cash" });

  // Parent on a phone.
  const { ctx: pc, page: parent } = await signInAs(browser, `p.data.${tag}`, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await parent.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Progress" }).click();
  await expect(parent.getByText("Latest: Unit 1")).toBeVisible();
  await expect(parent.getByText("20% E").first()).toBeVisible();
  await expect(parent.getByText("₹1,500")).toBeVisible();
  await parent.goto("/fees");
  await parent.getByRole("link", { name: "Receipt", exact: true }).click();
  await expect(parent.getByRole("heading", { name: "Fee receipt" })).toBeVisible();
  await expect(parent.getByText("₹500").first()).toBeVisible();
  await expect(parent.getByText("Data Father for")).toBeVisible();
  expect(await parent.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  // Teacher: the class insights flag the failing student.
  const { ctx: tc, page: teacher } = await signInAs(browser, `t.data.${tag}`);
  await teacher.getByRole("link", { name: "Insights" }).first().click();
  await expect(teacher.getByRole("heading", { name: "Class insights" })).toBeVisible();
  await expect(teacher.getByText("Failed latest exam", { exact: true })).toBeVisible();
  await teacher.getByRole("tab", { name: /Need attention \(1\)/ }).click();
  await expect(teacher.getByRole("link", { name: new RegExp(kid.firstName) })).toBeVisible();
  await Promise.all([pc.close(), tc.close()]);
});
