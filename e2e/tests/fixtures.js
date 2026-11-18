const base = require("@playwright/test");

const ADMIN = {
  username: process.env.E2E_ADMIN_USERNAME || "e2e-admin",
  password: process.env.E2E_ADMIN_PASSWORD || "e2e-password-only-for-tests",
};
let counter = 0;

// Unique child per test so duplicate detection never couples tests.
function uniqueChild() {
  counter += 1;
  const tag = `${Date.now().toString(36)}${counter}`;
  const day = String((counter % 27) + 1).padStart(2, "0");
  return { firstName: `Kid${tag}`, lastName: "Tester", dobInput: `${day}/03/2018`, dobIso: `2018-03-${day}` };
}

// `request` is page.request, so calls go through the web origin's /api proxy
// and carry the signed-in session cookie.
async function api(request, method, path, data) {
  const res = await request.fetch(`/api${path}`, { method, data });
  const body = await res.json();
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${body.message}`);
  return body.data;
}

// One shared school for the whole run, created on first use.
let schoolPromise;
function ensureSchool(request) {
  schoolPromise =
    schoolPromise ||
    (async () => {
      const list = await api(request, "GET", "/schools");
      return list.find((s) => s.code === "E2E") || api(request, "POST", "/schools", { name: "E2E Test School", code: "E2E" });
    })();
  return schoolPromise;
}

// Seeds an application through the API (faster than the UI for setup).
async function seedApplication(request, child, status = "submitted") {
  const school = await ensureSchool(request);
  const app = await api(request, "POST", "/admissions", {
    school: school.id,
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
  // Tests start signed in unless they opt out.
  signedIn: [true, { option: true }],
  // Fails any test that logs an unexpected browser error.
  page: async ({ page, allowConsole, signedIn }, use) => {
    if (signedIn) {
      const res = await page.request.post("/api/auth/login", { data: ADMIN });
      base.expect(res.ok(), "sign in for test").toBe(true);
    }
    const problems = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      // Expected: the browser logs 4xx responses the UI handles itself.
      if (/status of (400|401|409|404)/.test(m.text())) return;
      if (allowConsole.some((rx) => rx.test(m.text()))) return;
      problems.push(m.text());
    });
    await use(page);
    base.expect(problems, "unexpected browser console errors").toEqual([]);
  },
});

async function seedStudent(request, child, extra = {}) {
  const school = await ensureSchool(request);
  return api(request, "POST", "/students", {
    school: school.id,
    firstName: child.firstName,
    lastName: child.lastName,
    dateOfBirth: child.dobIso,
    gender: "male",
    address: "9 Harbour Lane",
    className: "5",
    section: "C",
    academicYear: "2026-2027",
    father: { name: "Parent Tester", phone: "9876543210", occupation: "Engineer" },
    ...extra,
  });
}

module.exports = { test, expect: base.expect, uniqueChild, seedApplication, seedStudent, ensureSchool, api, ADMIN };
