const fs = require("fs");
const { test, expect, uniqueChild, seedStudent, ensureSchool, api } = require("./fixtures");

const PW = "e2e-role-password-123";

// Creates a school (with one student) and staff accounts through the admin API.
async function setup(request) {
  const tag = Date.now().toString(36).slice(-4).toUpperCase();
  const home = await ensureSchool(request);
  const away = await api(request, "POST", "/schools", { name: `Away School ${tag}`, code: `AW${tag}` });
  const kid = uniqueChild();
  const awayKid = await api(request, "POST", "/students", {
    school: away.id, firstName: kid.firstName, lastName: "Away", dateOfBirth: kid.dobIso, gender: "female",
    address: "7 Private Road", className: "6", section: "A", academicYear: "2026-2027", father: { name: "Hidden Father", phone: "9123456789" },
  });
  await api(request, "POST", `/students/${awayKid.id}/results`, { academicYear: "2026-2027", exam: "Term 1", subjects: [{ subject: "English", maxMarks: 100, marks: 77 }] });
  const t = `teacher.${tag.toLowerCase()}`;
  const p = `principal.${tag.toLowerCase()}`;
  await api(request, "POST", "/users", { username: t, password: PW, role: "teacher", name: `Home Teacher ${tag}`, assignments: [{ school: home.id, className: "5", section: "C" }], grants: ["students.import"] });
  await api(request, "POST", "/users", { username: p, password: PW, role: "principal", name: `Away Head ${tag}`, schools: [away.id] });
  return { home, away, awayKid, teacher: t, principal: p, tag };
}

async function signInAs(browser, username) {
  const ctx = await browser.newContext({ baseURL: process.env.E2E_WEB_URL || "http://localhost:3055" });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for the redirect to finish and the home page to load.
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Sign in");
  await expect(page.locator("main h1")).toBeVisible();
  return { ctx, page };
}

test("teacher asks another school for a student; its principal approves part; teacher sees only that", async ({ page, browser }) => {
  const s = await setup(page.request);

  const { ctx: tctx, page: teacher } = await signInAs(browser, s.teacher);
  // Teacher theme is green, and the menu has no admin items.
  expect(await teacher.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("edupro-teacher");
  await expect(teacher.getByRole("link", { name: "Users" })).toHaveCount(0);
  await expect(teacher.getByRole("heading", { level: 1, name: /Good day/ })).toBeVisible();

  await teacher.goto("/shares");
  await teacher.getByLabel("Student's admission number").fill(s.awayKid.admissionNumber);
  await teacher.getByLabel("Personal details (address, parents, contacts)").check();
  await teacher.getByLabel(/Reason/).fill("Student is joining our class next term");
  await teacher.getByRole("button", { name: "Send request" }).click();
  await expect(teacher.getByText(`Request sent to Away School ${s.tag}.`)).toBeVisible();
  await expect(teacher.getByText("pending")).toBeVisible();
  // Before approval: not visible.
  expect((await teacher.request.get(`/api/students/${s.awayKid.id}`)).status()).toBe(404);

  const { ctx: pctx, page: principal } = await signInAs(browser, s.principal);
  expect(await principal.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("edupro-principal");
  await principal.goto("/shares");
  await principal.getByRole("tab", { name: /To approve/ }).click();
  await principal.getByRole("button", { name: "Review" }).click();
  const d = principal.getByRole("dialog");
  await d.getByLabel(/Personal details/).uncheck(); // share academic only
  await d.getByRole("button", { name: "Approve" }).click();
  await expect(principal.getByText(/Access approved until/)).toBeVisible();

  await teacher.reload();
  await teacher.getByRole("link", { name: "Open" }).click();
  await expect(teacher.getByText(/Shared with you by Away School/)).toBeVisible();
  await expect(teacher.getByRole("tab", { name: "Academics" })).toBeVisible();
  await expect(teacher.getByRole("tab", { name: "Parents" })).toHaveCount(0);
  await expect(teacher.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(teacher.getByText("7 Private Road")).toHaveCount(0);
  await teacher.getByRole("tab", { name: "Academics" }).click();
  await expect(teacher.getByText("77 / 100").first()).toBeVisible();
  await expect(teacher.getByRole("button", { name: "Add marks" })).toHaveCount(0);

  // Principal revokes; the teacher loses access.
  await principal.reload();
  await principal.getByRole("tab", { name: /To approve/ }).click();
  await principal.getByRole("button", { name: "Revoke" }).click();
  await expect(principal.getByText("Access revoked.")).toBeVisible();
  expect((await teacher.request.get(`/api/students/${s.awayKid.id}`)).status()).toBe(404);
  await tctx.close();
  await pctx.close();
});

test("a teacher with the import permission imports a CSV into their own class", async ({ page, browser }, testInfo) => {
  const s = await setup(page.request);
  const { ctx, page: teacher } = await signInAs(browser, s.teacher);
  await teacher.goto("/students/import");
  const csv = testInfo.outputPath("students.csv");
  const name = `Imp${s.tag}`;
  fs.writeFileSync(csv, [
    "school_code,first_name,last_name,date_of_birth,gender,class,address,section",
    `E2E,${name},One,02/01/2016,F,5,1 Road,C`,
    `E2E,${name},Two,03/01/2016,M,V,2 Road,c`,
    `E2E,${name},Bad,03/01/2016,M,6,3 Road,C`,
  ].join("\n"));
  await teacher.getByLabel("CSV file").setInputFiles(csv);
  await teacher.getByRole("button", { name: "Check file" }).click();
  await expect(teacher.getByText("You can't import into E2E class 6 C")).toBeVisible();
  // Fix the file and import.
  fs.writeFileSync(csv, fs.readFileSync(csv, "utf8").split("\n").slice(0, 3).join("\n"));
  await teacher.getByLabel("CSV file").setInputFiles(csv);
  await teacher.getByRole("button", { name: "Check file" }).click();
  await teacher.getByRole("button", { name: "Import 2 students" }).click();
  await expect(teacher.getByText(/2 students imported \(E2E-2026-\d{5} to E2E-2026-\d{5}\)/)).toBeVisible();
  await teacher.getByRole("link", { name: "View students" }).click();
  await expect(teacher.locator("tbody").getByText(`${name} One`)).toBeVisible();
  await ctx.close();
});

test("everyone can change their own photo from My account", async ({ page, browser }, testInfo) => {
  const s = await setup(page.request);
  const { ctx, page: teacher } = await signInAs(browser, s.teacher);
  await teacher.goto("/account");
  const png = testInfo.outputPath("me.png");
  fs.writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAF0lEQVR42mNkYPjPQApgHNUwqmFUAwMAvF4BEKGoTHAAAAAASUVORK5CYII=", "base64"));
  await teacher.getByTestId("my-photo-input").setInputFiles(png);
  await expect(teacher.getByText("Your photo was updated")).toBeVisible();
  await expect(teacher.getByRole("img", { name: new RegExp(`Photo of Home Teacher ${s.tag}`) }).first()).toBeVisible();
  await ctx.close();
});
