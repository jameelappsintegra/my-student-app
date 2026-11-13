const { test, expect } = require("./fixtures");

test("pages fit a phone screen and the menu works", async ({ page }) => {
  for (const path of ["/", "/admissions", "/newadmission", "/myclass"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
  await page.goto("/");
  await page.getByLabel("Open menu").click();
  await page.getByRole("link", { name: "New Admission" }).click();
  await expect(page).toHaveURL(/\/newadmission$/);
  await expect(page.getByRole("heading", { level: 1, name: "New Admission" })).toBeVisible();
  // The drawer closes after navigating.
  await expect(page.locator(".drawer-toggle")).not.toBeChecked();
});
