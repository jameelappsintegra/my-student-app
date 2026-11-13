const base = require("@playwright/test");

const API = process.env.E2E_API_URL || "http://localhost:5055/api";
let counter = 0;

// Unique child per test so duplicate detection never couples tests.
function uniqueChild() {
  counter += 1;
  const tag = `${Date.now().toString(36)}${counter}`;
  const day = String((counter % 27) + 1).padStart(2, "0");
  return { firstName: `Kid${tag}`, lastName: "Tester", dobInput: `${day}/03/2018`, dobIso: `2018-03-${day}` };
}

async function api(request, method, path, data) {
  const res = await request.fetch(`${API}${path}`, { method, data });
  const body = await res.json();
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${body.message}`);
  return body.data;
}

// Seeds an application through the API (faster than the UI for setup).
async function seedApplication(request, child, status = "submitted") {
  const app = await api(request, "POST", "/admissions", {
    firstName: child.firstName,
    lastName: child.lastName,
    dateOfBirth: child.dobIso,
    gender: "female",
    address: "1 Test Road",
    classApplied: "3",
    academicYear: "2026-2027",
    father: { name: "Parent", phone: "9876543210" },
  });
  const path = { under_review: ["under_review"], approved: ["under_review", "approved"] }[status] || [];
  for (const s of path) await api(request, "PATCH", `/admissions/${app.id}/status`, { status: s });
  return app;
}

const test = base.test.extend({
  // Console messages a specific test expects, e.g. a request it aborts.
  allowConsole: [[], { option: true }],
  // Fails any test that logs an unexpected browser error.
  page: async ({ page, allowConsole }, use) => {
    const problems = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      // Expected: the browser logs 4xx responses the UI handles itself.
      if (/status of (400|409|404)/.test(m.text())) return;
      if (allowConsole.some((rx) => rx.test(m.text()))) return;
      problems.push(m.text());
    });
    await use(page);
    base.expect(problems, "unexpected browser console errors").toEqual([]);
  },
});

module.exports = { test, expect: base.expect, uniqueChild, seedApplication, api };
