const { test, expect, ADMIN } = require("./fixtures");

test.describe("signed out", () => {
  test.use({ signedIn: false });

  test("private pages redirect to sign in and return afterwards", async ({ page }) => {
    await page.goto("/admissions");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmissions$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    await page.getByLabel("Username").fill(ADMIN.username);
    await page.getByLabel("Password").fill("wrong password");
    await page.getByRole("button", { name: "Sign in" }).click();
    // (Next.js also renders a hidden role="alert" route announcer.)
    await expect(page.locator(".alert-error")).toHaveText("Incorrect username or password.");
    await expect(page.getByLabel("Password")).toHaveValue("");

    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admissions$/);
    await expect(page.getByRole("heading", { level: 1, name: "Admissions" })).toBeVisible();
    await expect(page.getByText("E2E Admin")).toBeVisible();
  });

  test("the API refuses data without a session", async ({ page }) => {
    for (const path of ["/api/students", "/api/admissions", "/api/dashboard"]) {
      const res = await page.request.get(path);
      expect(res.status()).toBe(401);
    }
  });

  test("the session cookie is HttpOnly and SameSite=Strict", async ({ page }) => {
    await page.request.post("/api/auth/login", { data: ADMIN });
    const [cookie] = (await page.context().cookies()).filter((c) => c.name === "edupro_session");
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Strict");
    // Page scripts cannot read it.
    await page.goto("/login");
    expect(await page.evaluate(() => document.cookie)).not.toContain("edupro_session");
  });
});

test("sign out ends the session everywhere", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible(); // admin home
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/dashboard")).status()).toBe(401);
  await page.goto("/students");
  await expect(page).toHaveURL(/\/login\?next=%2Fstudents$/);
});
