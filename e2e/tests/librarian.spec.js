// A librarian imports books, lends one, a student reserves it, and the
// returned copy goes to the student who reserved it.
const { test, expect, uniqueChild, api } = require("./fixtures");

const PW = "e2e-librarian-password-1";

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

test("librarian: import, lend, reservation queue, return to the reserver", async ({ page, browser }) => {
  const tag = Date.now().toString(36).slice(-4);
  const school = await api(page.request, "POST", "/schools", { name: `Library School ${tag}`, code: `L${tag.toUpperCase()}`.slice(0, 8) });
  const add = async (n) => {
    const k = uniqueChild();
    return api(page.request, "POST", "/students", { school: school.id, firstName: k.firstName, lastName: `Reader${n}`, dateOfBirth: k.dobIso, gender: "male", address: "2 Lake View", className: "6", section: "B", rollNumber: n, academicYear: "2026-2027", father: { name: "Father", phone: "9876543210" } });
  };
  const first = await add(1);
  const second = await add(2);
  await api(page.request, "POST", "/users", { username: `lib.${tag}`, password: PW, role: "librarian", name: `Lata ${tag}`, schools: [school.id] });
  await api(page.request, "POST", "/users", { username: `kid.${tag}`, password: PW, role: "student", name: "Second Reader", student: second.id });

  const { ctx: lc, page: lib } = await signInAs(browser, `lib.${tag}`);
  await expect(lib.getByRole("heading", { name: new RegExp(`Good day, Lata`) })).toBeVisible();
  await expect(lib.getByRole("link", { name: "Students", exact: true })).toHaveCount(0);

  // Import two books from CSV.
  await lib.getByRole("link", { name: "Import books (CSV)" }).click();
  const csv = `title,author,isbn,category,shelf,copies\nThe Discovery of India ${tag},Jawaharlal Nehru,,History,C-1,1\nGitanjali ${tag},Rabindranath Tagore,,Poetry,C-2,2\n`;
  await lib.getByLabel("CSV file").setInputFiles({ name: "books.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await lib.getByRole("button", { name: "Check file" }).click();
  await expect(lib.getByText("Ready to import 2 new books and add copies to 0.")).toBeVisible();
  await lib.getByRole("button", { name: "Import", exact: true }).click();
  await expect(lib.getByText("Imported 2 new books and added copies to 0.").first()).toBeVisible();

  // Lend the single copy to the first reader (found by search across the school).
  await lib.getByRole("tab", { name: "Catalogue" }).click();
  const card = lib.locator("section", { hasText: `The Discovery of India ${tag}` });
  await card.getByRole("button", { name: "Lend" }).click();
  await lib.getByLabel("Find student").fill(first.firstName);
  await lib.getByRole("button", { name: new RegExp(first.firstName) }).click();
  await lib.getByRole("button", { name: "Lend book" }).click();
  await expect(lib.getByText(new RegExp(`lent to ${first.firstName}`))).toBeVisible();

  // The second reader reserves it on their phone.
  const { ctx: sc, page: kid } = await signInAs(browser, `kid.${tag}`, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await kid.goto("/library");
  await kid.locator("section", { hasText: `The Discovery of India ${tag}` }).getByRole("button", { name: "Reserve" }).click();
  await expect(kid.getByText(/number 1 in the queue/)).toBeVisible();
  await expect(kid.getByText("Reserved · in the queue")).toBeVisible();

  // Return: the copy is kept for the reserver and can only go to them.
  await lib.getByRole("tab", { name: "Loans" }).click();
  await lib.getByRole("row", { name: new RegExp(`The Discovery of India ${tag}`) }).getByRole("button", { name: "Renew" }).click();
  await expect(lib.getByText("Other students are waiting for this book, so it can't be renewed.")).toBeVisible();
  await lib.getByRole("row", { name: new RegExp(`The Discovery of India ${tag}`) }).getByRole("button", { name: "Return" }).click();
  await expect(lib.getByText(/reserved for the next student/)).toBeVisible();
  await kid.reload();
  await expect(kid.getByText(/Ready to collect by/).first()).toBeVisible();

  await lib.getByRole("tab", { name: "Reservations" }).click();
  await expect(lib.getByText(/Ready · collect by/)).toBeVisible();
  await lib.getByRole("tab", { name: "Catalogue" }).click();
  await card.getByRole("button", { name: "Lend" }).click();
  await lib.getByLabel("Find student").fill(second.firstName);
  await lib.getByRole("button", { name: new RegExp(second.firstName) }).click();
  await lib.getByRole("button", { name: "Lend book" }).click();
  await expect(lib.getByText(new RegExp(`lent to ${second.firstName}`))).toBeVisible();
  await Promise.all([lc.close(), sc.close()]);
});
