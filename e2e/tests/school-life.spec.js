// Day-to-day flows across roles: announcements, homework, results
// publishing, report card, leave, notifications and the audit log.
const { test, expect, uniqueChild, ensureSchool, api } = require("./fixtures");

const PW = "e2e-life-password-123";

async function setup(request) {
  const tag = Date.now().toString(36).slice(-4);
  const school = await ensureSchool(request);
  const kid = uniqueChild();
  const section = "L";
  const student = await api(request, "POST", "/students", {
    school: school.id, firstName: kid.firstName, lastName: "Life", dateOfBirth: kid.dobIso, gender: "female",
    address: "3 Lake Road", className: "4", section, academicYear: "2026-2027", father: { name: "Life Father", phone: "9876543210" },
  });
  const t = `t.life.${tag}`, p = `p.life.${tag}`, par = `par.life.${tag}`;
  await api(request, "POST", "/users", { username: t, password: PW, role: "teacher", name: `Life Teacher ${tag}`, assignments: [{ school: school.id, className: "4", section }] });
  await api(request, "POST", "/users", { username: p, password: PW, role: "principal", name: `Life Head ${tag}`, schools: [school.id] });
  await api(request, "POST", "/users", { username: par, password: PW, role: "parent", name: `Life Parent ${tag}`, children: [student.id] });
  return { school, student, kid, section, teacher: t, principal: p, parent: par, tag };
}

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

test("a school week: homework, marks, publishing, report card, leave and notifications", async ({ page, browser }) => {
  const s = await setup(page.request);
  const { ctx: tc, page: teacher } = await signInAs(browser, s.teacher);
  const { ctx: pc, page: principal } = await signInAs(browser, s.principal);
  const { ctx: rc, page: parent } = await signInAs(browser, s.parent);

  // Principal posts an announcement for the school.
  await principal.goto("/announcements");
  await principal.getByLabel("Title").fill(`Science fair ${s.tag}`);
  await principal.getByLabel("Message").fill("Projects on display in the hall from 10 am.");
  await principal.getByLabel("School").selectOption({ label: "E2E Test School" });
  await principal.getByRole("button", { name: "Post and notify" }).click();
  await expect(principal.getByText(/Announcement posted and sent to \d+ people/)).toBeVisible();

  // Teacher posts homework to their class.
  await teacher.goto("/homework");
  await teacher.getByLabel("School").selectOption({ label: "E2E Test School" });
  await teacher.getByLabel("Class").selectOption("4");
  await teacher.getByLabel(/Section/).fill(s.section);
  await teacher.getByLabel("Subject").fill("English");
  await teacher.getByLabel("Homework title").fill(`Read chapter 3 ${s.tag}`);
  const due = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await teacher.getByLabel("Due date").fill(due);
  await teacher.getByRole("button", { name: "Post homework" }).click();
  await expect(teacher.getByText("Homework posted to 1 students' parents.")).toBeVisible();

  // Teacher enters marks: a draft, hidden from the parent.
  await teacher.goto(`/students/${s.student.id}?tab=academics`);
  await teacher.getByRole("button", { name: "Add marks" }).click();
  const d = teacher.getByRole("dialog");
  await d.getByLabel("Exam", { exact: true }).fill("Term 1");
  await d.getByLabel("English marks").fill("91");
  await d.getByLabel("Mathematics marks").fill("84");
  await d.getByRole("button", { name: "Save marks" }).click();
  await expect(teacher.getByText("Draft", { exact: true })).toBeVisible();
  expect((await (await parent.request.get(`/api/students/${s.student.id}/results`)).json()).data).toEqual([]);

  // Principal publishes; the parent can now see the marks and the report card.
  await principal.goto("/results");
  await principal.getByLabel("School").selectOption({ label: "E2E Test School" });
  await principal.getByLabel("Class").selectOption("4");
  await principal.getByLabel(/Section/).fill(s.section);
  const row = principal.locator("tr", { hasText: "Term 1" });
  await row.getByRole("button", { name: "Publish" }).click();
  await expect(principal.getByText(/1 results published; 1 parents notified/)).toBeVisible();

  // Parent: bell shows the announcement, homework and results notifications.
  await parent.goto("/");
  const bell = parent.getByRole("button", { name: /Notifications, \d+ unread/ }).first();
  await expect(bell).toBeVisible();
  await bell.click();
  const panel = parent.getByRole("dialog", { name: "Notifications" });
  await expect(panel.getByText(`Science fair ${s.tag}`)).toBeVisible();
  await expect(panel.getByText("Homework: English")).toBeVisible();
  await expect(panel.getByText("Term 1 results published")).toBeVisible();
  await panel.getByRole("button", { name: "Mark all read" }).click();
  await parent.goto("/homework");
  await expect(parent.getByText(`Read chapter 3 ${s.tag}`)).toBeVisible();
  await parent.goto(`/students/${s.student.id}/report-card`);
  await expect(parent.getByText("PROGRESS REPORT · 2026-2027")).toBeVisible();
  await expect(parent.getByRole("cell", { name: "175" })).toBeVisible(); // 91 + 84
  await expect(parent.getByText("Includes draft marks")).toHaveCount(0);

  // Parent requests leave; the teacher approves; attendance shows leave.
  await parent.goto("/leave");
  const day = new Date(Date.now() + 86400000);
  while (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
  const iso = day.toISOString().slice(0, 10);
  await parent.getByLabel("From").fill(iso);
  await parent.getByLabel("To").fill(iso);
  await parent.getByLabel("Reason").fill("Dentist appointment");
  await parent.getByRole("button", { name: "Send to class teacher" }).click();
  await expect(parent.getByText("Leave request sent to the class teacher.")).toBeVisible();

  await teacher.goto("/leave");
  await teacher.locator("li", { hasText: "Dentist appointment" }).getByRole("button", { name: "Review" }).click();
  await teacher.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(teacher.getByText("Leave approved; 1 school days marked as leave.")).toBeVisible();
  const att = await (await teacher.request.get(`/api/students/${s.student.id}/attendance?from=${iso}&to=${iso}`)).json();
  // Approved future days are already recorded as leave.
  expect(att.data.records).toEqual([expect.objectContaining({ date: iso, status: "leave" })]);
  const parentNote = await (await parent.request.get("/api/notifications?unread=true")).json();
  expect(parentNote.data.items[0]).toMatchObject({ title: "Leave approved" });

  // Admin sees all of it in the audit log.
  await page.goto("/audit");
  await expect(page.getByRole("cell", { name: "leave.decision" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "results.publish" }).first()).toBeVisible();

  await Promise.all([tc.close(), pc.close(), rc.close()]);
});

test("new pages fit a phone screen", async ({ page, browser }) => {
  const s = await setup(page.request);
  const { ctx, page: parent } = await signInAs(browser, s.parent, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await parent.goto("/");
  const tabs = parent.getByRole("navigation", { name: "Tabs" });
  await expect(tabs.getByRole("link")).toHaveText(["Home", "Homework", "Progress", "Leave", "Account"]);
  for (const path of ["/", "/homework", "/leave", "/announcements", "/timetable", "/account", `/students/${s.student.id}/report-card`]) {
    await parent.goto(path);
    await parent.waitForLoadState("networkidle");
    const overflow = await parent.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
  await ctx.close();
});
