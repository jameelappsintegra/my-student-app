const { test, expect, uniqueChild, seedStudent } = require("./fixtures");

test("pages fit a phone screen and the menu works", async ({ page }) => {
  for (const path of ["/", "/admissions", "/newadmission", "/students", "/students/new", "/schools", "/attendance", "/reports"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
  await page.goto("/");
  // Bottom tabs like a native app.
  const tabs = page.getByRole("navigation", { name: "Tabs" });
  await expect(tabs).toBeVisible();
  await tabs.getByRole("link", { name: "Attendance" }).click();
  await expect(page).toHaveURL(/\/attendance$/);
  await expect(tabs.getByRole("link", { name: "Attendance" })).toHaveAttribute("aria-current", "page");
  // The side menu still opens for the rest.
  await page.getByLabel("Open menu").click();
  await page.getByRole("link", { name: "New Admission" }).click();
  await expect(page).toHaveURL(/\/newadmission$/);
  await expect(page.locator(".drawer-toggle")).not.toBeChecked();
});

test("phone search opens a student profile", async ({ page }) => {
  const child = uniqueChild();
  await seedStudent(page.request, child);
  await page.goto("/");
  await page.getByRole("button", { name: "Search students" }).click();
  const box = page.getByRole("dialog", { name: "Search students" }).getByRole("combobox");
  await expect(box).toBeFocused();
  await box.fill(child.firstName);
  await page.getByRole("option", { name: new RegExp(child.firstName) }).click();
  await expect(page.getByRole("heading", { level: 1, name: `${child.firstName} ${child.lastName}` })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // The installable-app manifest is served.
  const manifest = await page.request.get("/manifest.json");
  expect((await manifest.json()).display).toBe("standalone");
});

test("lists show as cards on a phone: nothing scrolls sideways or is cut off", async ({ page }) => {
  await seedStudent(page.request, uniqueChild());
  for (const path of ["/students", "/admissions", "/reports", "/audit", "/users", "/certificates", "/library", "/transport", "/timetable"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const problems = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("main *")) {
        if (el.offsetParent === null) continue;
        const cs = getComputedStyle(el);
        if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2) out.push(`scrolls: ${el.tagName} ${el.className}`);
        if (el.matches("table, tr") && el.getBoundingClientRect().right > window.innerWidth + 1) out.push(`cut off: ${el.tagName}`);
      }
      return out;
    });
    expect(problems, path).toEqual([]);
  }
  // Rows are cards with labelled values.
  await page.goto("/reports");
  const card = page.locator("tbody tr").first();
  await expect(card).toBeVisible();
  expect(await card.evaluate((tr) => getComputedStyle(tr).display)).toBe("flex");
  expect(await page.locator("thead").first().evaluate((t) => getComputedStyle(t).display)).toBe("none");
});
