// Student logins and online homework; school settings; bus, library and
// certificates, end to end in the browser.
const { test, expect, uniqueChild, api } = require("./fixtures");

const PW = "e2e-campus-password-123";

async function signInAs(browser, username, opts = {}) {
  const ctx = await browser.newContext({ baseURL: process.env.E2E_WEB_URL || "http://localhost:3055", ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await expect(page.locator("main h1")).toBeVisible();
  return { ctx, page, errors };
}

// A school of its own, so settings changes here don't affect other tests.
async function setup(request) {
  const tag = Date.now().toString(36).slice(-4);
  const code = `C${tag.toUpperCase()}`.slice(0, 8);
  const school = await api(request, "POST", "/schools", { name: `Campus School ${tag}`, code, city: "Madurai", address: "9 College Road", principalName: "Dr. Campus" });
  const add = async (section, n) => {
    const kid = uniqueChild();
    return api(request, "POST", "/students", {
      school: school.id, firstName: kid.firstName, lastName: `Campus${n}`, dateOfBirth: kid.dobIso, gender: "male",
      address: "4 Hill Road", className: "8", section, rollNumber: n, academicYear: "2026-2027", father: { name: "Campus Father", phone: "9876501234" },
    });
  };
  const a = await add("C", 1);
  const b = await add("C", 2);
  const u = (s) => `${s}.cmp.${tag}`;
  await api(request, "POST", "/users", { username: u("t"), password: PW, role: "teacher", name: `Campus Teacher ${tag}`, assignments: [{ school: school.id, className: "8", section: "C" }], grants: ["library.manage"] });
  await api(request, "POST", "/users", { username: u("p"), password: PW, role: "principal", name: `Campus Head ${tag}`, schools: [school.id] });
  await api(request, "POST", "/users", { username: u("par"), password: PW, role: "parent", name: `Campus Parent ${tag}`, children: [a.id] });
  await api(request, "POST", "/users", { username: u("s"), password: PW, role: "student", name: `${a.firstName} Campus1`, student: a.id });
  return { tag, school, a, b, teacher: u("t"), principal: u("p"), parent: u("par"), student: u("s") };
}

test("student hands in homework online; teacher marks it; parent sees the mark", async ({ page, browser }) => {
  const s = await setup(page.request);
  const { ctx: tc, page: teacher } = await signInAs(browser, s.teacher);
  await teacher.goto("/homework");
  await teacher.getByLabel("School").selectOption({ label: s.school.name });
  await teacher.getByLabel("Class").selectOption("8");
  await teacher.getByLabel(/Section/).fill("C");
  await teacher.getByLabel("Subject").fill("History");
  await teacher.getByLabel("Homework title").fill(`Mughal empire summary ${s.tag}`);
  await teacher.getByLabel("Due date").fill(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
  await teacher.getByLabel("Students hand in online").check();
  await teacher.getByPlaceholder("Out of").fill("10");
  await teacher.getByRole("button", { name: "Post homework" }).click();
  await expect(teacher.getByText(/Homework posted to 2 students' parents\./)).toBeVisible();

  // The student, on a phone, hands it in.
  const { ctx: sc, page: student, errors } = await signInAs(browser, s.student, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await expect(student.getByRole("heading", { name: `Hi, ${s.a.firstName}` })).toBeVisible();
  await expect(student.getByText("1 to hand in online.")).toBeVisible();
  await student.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: "Homework" }).click();
  await student.getByLabel(`Answer for Mughal empire summary ${s.tag}`).fill("Founded by Babur in 1526 after the battle of Panipat.");
  await student.getByRole("button", { name: "Hand in" }).click();
  await expect(student.getByText("Handed in. Your teacher will see it.")).toBeVisible();
  expect(await student.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  // A student can't see other students.
  const other = await student.request.fetch(`/api/students/${s.b.id}`);
  expect(other.status()).toBe(404);

  // Teacher sees it and marks it.
  await teacher.reload();
  await teacher.getByRole("button", { name: "Submissions (1)" }).click();
  const dialog = teacher.getByRole("dialog");
  await expect(dialog.getByText("1 of 2 handed in · 0 marked · 1 missing")).toBeVisible();
  await dialog.getByLabel(/^Marks for /).fill("9");
  await dialog.getByLabel(/^Feedback for /).fill("Good, add the year 1526");
  await dialog.getByRole("button", { name: "Mark" }).click();
  await expect(dialog.getByText("Marked. The student and parents can see it.")).toBeVisible();

  // Parent sees the mark on the homework page.
  const { ctx: pc, page: parent } = await signInAs(browser, s.parent);
  await parent.goto("/homework");
  await expect(parent.getByText("Marked · 9/10")).toBeVisible();
  await expect(parent.getByText("Teacher: Good, add the year 1526")).toBeVisible();
  // ...and the student is told.
  await student.goto("/homework");
  await expect(student.getByText("Marked · 9/10")).toBeVisible();
  await expect(student.getByRole("button", { name: /Hand in/ })).toHaveCount(0);
  expect(errors).toEqual([]);
  await Promise.all([tc.close(), sc.close(), pc.close()]);
});

test("principal sets currency and holidays, runs a bus route, the library and certificates", async ({ page, browser }) => {
  const s = await setup(page.request);
  await api(page.request, "POST", `/students/${s.a.id}/fees`, { academicYear: "2026-2027", title: "Term 2 fee", amount: 1500, dueDate: "2026-12-31" });
  const { ctx: hc, page: head } = await signInAs(browser, s.principal);

  // Settings: dollars and a holiday.
  await head.goto("/settings");
  await expect(head.getByText("Region and money")).toBeVisible();
  await head.getByLabel("Currency").selectOption("USD");
  await head.getByLabel("Number format (locale)").fill("en-US");
  await head.getByRole("button", { name: "Add holiday" }).click();
  // The 25th of next month, so the calendar check works whenever this runs.
  const n = new Date();
  const next = new Date(Date.UTC(n.getFullYear(), n.getMonth() + 1, 25)).toISOString().slice(0, 10);
  await head.getByLabel("Holiday date").fill(next);
  await head.getByLabel("Holiday name").fill("Christmas");
  await head.getByRole("button", { name: "Save settings" }).click();
  await expect(head.getByText(`${s.school.name} settings saved`)).toBeVisible();
  await head.goto(`/students/${s.a.id}?tab=fees`);
  await expect(head.getByText("$1,500").first()).toBeVisible();
  await head.goto("/calendar");
  await expect(head.getByRole("heading", { name: "This month" })).toBeVisible();
  await head.getByRole("button", { name: "Next month" }).click();
  await expect(head.getByText("Christmas").first()).toBeVisible();

  // Transport: a route, and a student on it.
  await head.goto("/transport");
  await head.getByRole("button", { name: "New route" }).click();
  await head.getByLabel("Route name").fill(`Hill Route ${s.tag}`);
  await head.getByLabel("Seats").fill("20");
  await head.getByLabel("Driver", { exact: true }).fill("Kannan");
  await head.getByLabel("Stop 1 name").fill("Hill Top");
  await head.getByLabel("Stop 1 pickup").fill("07:15");
  await head.getByRole("button", { name: "Save route" }).click();
  await expect(head.getByText(`Hill Route ${s.tag} added`)).toBeVisible();
  await head.getByRole("button", { name: "Riders" }).click();
  await head.getByRole("button", { name: "Add student" }).click();
  await head.getByLabel("Find student").fill(s.a.firstName);
  await head.getByRole("button", { name: new RegExp(s.a.firstName) }).click();
  await head.getByRole("button", { name: "Assign" }).click();
  await expect(head.getByText(new RegExp(`assigned to Hill Route ${s.tag}, Hill Top`))).toBeVisible();

  // Library (teacher who runs it): add a book and lend it.
  const { ctx: tc, page: librarian } = await signInAs(browser, s.teacher);
  await librarian.goto("/library");
  await librarian.getByLabel("School").selectOption({ label: s.school.name });
  await librarian.getByRole("button", { name: "Add book" }).click();
  await librarian.getByLabel("Title").fill(`Discovery of India ${s.tag}`);
  await librarian.getByLabel("Author").fill("Jawaharlal Nehru");
  await librarian.getByRole("button", { name: "Save" }).click();
  await expect(librarian.getByText(`Discovery of India ${s.tag} added`)).toBeVisible();
  await librarian.getByRole("button", { name: "Lend" }).click();
  await librarian.getByLabel("Find student").fill(s.a.firstName);
  await librarian.getByRole("button", { name: new RegExp(s.a.firstName) }).click();
  await librarian.getByRole("button", { name: "Lend book" }).click();
  await expect(librarian.getByText(new RegExp(`lent to ${s.a.firstName}`))).toBeVisible();

  // Parent sees the bus and the book.
  const { ctx: pc, page: parent } = await signInAs(browser, s.parent);
  await parent.goto(`/students/${s.a.id}?tab=services`);
  await expect(parent.getByText(`Hill Route ${s.tag}`)).toBeVisible();
  await expect(parent.getByText("07:15")).toBeVisible();
  await expect(parent.getByText(`Discovery of India ${s.tag}`)).toBeVisible();

  // Certificates: TC is held back by unpaid fees, then issued; public check.
  await head.goto("/certificates");
  await head.getByRole("button", { name: "Issue certificate" }).click();
  await head.getByLabel("Find student").fill(s.a.firstName);
  await head.getByRole("button", { name: new RegExp(s.a.firstName) }).click();
  await head.getByRole("combobox", { name: "Certificate", exact: true }).selectOption("transfer");
  await head.getByLabel("Reason for leaving").fill("Family moving abroad");
  await head.getByRole("button", { name: "Issue", exact: true }).click();
  await expect(head.getByText("$1,500 in fees is still due. Collect it, or confirm to issue the TC anyway.")).toBeVisible();
  await head.getByRole("button", { name: "Issue TC with dues" }).click();
  await expect(head.getByText(/Transfer certificate .*\/TC\/\d{4}\/0001 issued\. The student is now marked as transferred\./)).toBeVisible();
  await head.getByRole("link", { name: "Open" }).first().click();
  await expect(head.getByRole("heading", { name: "Transfer certificate" })).toBeVisible();
  await expect(head.getByText("Family moving abroad")).toBeVisible();
  const code = (await head.locator("footer strong.font-mono").textContent()).trim();

  const anon = await browser.newContext({ baseURL: process.env.E2E_WEB_URL || "http://localhost:3055" });
  const v = await anon.newPage();
  await v.goto(`/verify/${code}`);
  await expect(v.getByText("This certificate is genuine.")).toBeVisible();
  await expect(v.getByText(s.school.name, { exact: false })).toBeVisible();
  await Promise.all([hc.close(), tc.close(), pc.close(), anon.close()]);
});
