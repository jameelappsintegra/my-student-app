const request = require("supertest");
const { createApp } = require("../../src/app");
const { startDb, clearDb, stopDb } = require("./setup");
const { signIn, schoolId, createSchool, validApplication } = require("./helpers");

const app = createApp({ loginLimit: 1000 });
jest.setTimeout(60000);
beforeAll(startDb);
afterEach(clearDb);
afterAll(stopDb);

const PW = "a long enough passphrase";
let admin, other, kids;
const today = new Date().toISOString().slice(0, 10);

beforeEach(async () => {
  admin = await signIn(app);
  other = await createSchool({ name: "Other School", code: "OTH" });
  kids = [];
  const specs = [
    { firstName: "Asha", gender: "female", marks: [90, 80] },
    { firstName: "Bala", gender: "male", marks: [40, 20] },
    { firstName: "Chitra", gender: "female", marks: [70, 75] },
  ];
  for (const [i, s] of specs.entries()) {
    const r = await admin.post("/api/students").send({
      school: schoolId(), firstName: s.firstName, lastName: "Rep", dateOfBirth: `2016-03-0${i + 1}`, gender: s.gender,
      address: "1 Road", className: "5", section: "A", rollNumber: i + 1, academicYear: "2026-2027", father: { name: "F", phone: "9876543210" },
    });
    kids.push(r.body.data);
    await admin.post(`/api/students/${r.body.data.id}/results`).send({
      academicYear: "2026-2027", exam: "Term 1",
      subjects: [{ subject: "English", maxMarks: 100, marks: s.marks[0] }, { subject: "Maths", maxMarks: 100, marks: s.marks[1] }],
    });
  }
  await admin.post("/api/students").send({
    school: other, firstName: "Dev", lastName: "Else", dateOfBirth: "2016-04-01", gender: "male", address: "x",
    className: "5", section: "A", academicYear: "2026-2027", father: { name: "F", phone: "9876543210" },
  });
});

const get = (agent, name, q = "") => agent.get(`/api/reports/${name}${q}`).then((r) => r.body.data.rows);

test("exam performance, subject performance and toppers", async () => {
  const perf = await get(admin, "exam-performance", `?school=${schoolId()}`);
  // Asha 85, Bala 30 (fails maths), Chitra 72.5 → avg 62.5, pass 2/3.
  expect(perf).toEqual([expect.objectContaining({ className: "5", section: "A", exam: "Term 1", students: 3, averagePercentage: 62.5, passRate: 66.7, highest: 85, topper: "Asha Rep", averageGrade: "B2" })]);
  const subj = await get(admin, "subject-performance", `?school=${schoolId()}`);
  expect(subj.find((r) => r.subject === "Maths")).toMatchObject({ averagePercentage: 58.3, highest: 80, lowest: 20, passRate: 66.7 });
  const top = await get(admin, "toppers", `?school=${schoolId()}&top=2`);
  expect(top.map((r) => [r.rank, r.name, r.percentage, r.grade])).toEqual([[1, "Asha Rep", 85, "A2"], [2, "Chitra Rep", 72.5, "B1"]]);
});

test("attendance reports: daily and class summary", async () => {
  const [a, b] = kids;
  await admin.put(`/api/students/${a.id}/attendance/${today}`).send({ status: "present" });
  await admin.put(`/api/students/${b.id}/attendance/${today}`).send({ status: "absent" });
  const daily = await get(admin, "daily-attendance", `?school=${schoolId()}&date=${today}`);
  expect(daily).toEqual([expect.objectContaining({ students: 3, marked: 2, present: 1, absent: 1, notMarked: 1 })]);
  const cls = await get(admin, "class-attendance", `?school=${schoolId()}&from=${today}&to=${today}`);
  expect(cls).toEqual([expect.objectContaining({ students: 3, recorded: 2, averagePercentage: 50, belowThreshold: 1 })]);
});

test("strength, fee collection and admissions", async () => {
  expect(await get(admin, "strength")).toEqual([
    expect.objectContaining({ schoolCode: "OTH", total: 1, boys: 1 }),
    expect.objectContaining({ schoolCode: "TS", total: 3, girls: 2, boys: 1 }),
  ]);
  const inv = await admin.post(`/api/students/${kids[0].id}/fees`).send({ academicYear: "2026-2027", title: "Fee", amount: 5000, dueDate: "2026-06-01" });
  await admin.post(`/api/students/${kids[0].id}/fees/${inv.body.data.id}/payments`).send({ amount: 3000, method: "upi" });
  await admin.post(`/api/students/${kids[0].id}/fees/${inv.body.data.id}/payments`).send({ amount: 1000, method: "cash" });
  const coll = await admin.get(`/api/reports/fee-collection?from=${today}&to=${today}`);
  expect(coll.body.data.collected).toBe(4000);
  expect(coll.body.data.rows.map((r) => [r.method, r.amount])).toEqual(expect.arrayContaining([["upi", 3000], ["cash", 1000]]));
  await admin.post("/api/admissions").send(validApplication());
  expect(await get(admin, "admissions")).toEqual([expect.objectContaining({ school: "Test School", total: 1, submitted: 1 })]);
  const csv = await admin.get("/api/reports/strength?format=csv");
  expect(csv.text.split("\r\n")[0]).toBe("﻿School,Class,Section,Students,Girls,Boys,Other");
});

test("principal sees only their schools, read-mostly", async () => {
  await admin.post("/api/users").send({ username: "principal.ts", password: PW, role: "principal", name: "Dr Head", schools: [schoolId()] });
  const p = request.agent(app);
  await p.post("/api/auth/login").send({ username: "principal.ts", password: PW });
  expect((await p.get("/api/students")).body.pagination.total).toBe(3);
  const dash = await p.get("/api/dashboard");
  expect(dash.status).toBe(200);
  expect(dash.body.data.totalStudents).toBe(3);
  expect(dash.body.data.studentsBySchool.map((s) => s.code)).toEqual(["TS"]);
  expect((await p.get(`/api/dashboard?school=${other}`)).status).toBe(403);
  expect((await get(p, "strength")).map((r) => r.schoolCode)).toEqual(["TS"]);
  expect((await p.get(`/api/reports/students?school=${other}`)).status).toBe(403);
  const ids = (await p.get("/api/reports")).body.data.map((r) => r.id);
  expect(ids).toEqual(expect.arrayContaining(["fee-defaulters", "fee-collection", "admissions", "toppers"]));
  // Register for any class in the school.
  expect((await p.get(`/api/attendance/register?school=${schoolId()}&className=5&date=${today}`)).status).toBe(200);
  expect((await p.get(`/api/attendance/register?school=${other}&className=5&date=${today}`)).status).toBe(403);
  for (const [m, url] of [["post", "/api/students"], ["get", "/api/users"], ["get", "/api/admissions"], ["post", `/api/students/${kids[0].id}/fees`], ["post", "/api/schools"]]) {
    expect([url, (await p[m](url).send({})).status]).toEqual([url, 403]);
  }
});

test("only teachers and principals can be given the import permission", async () => {
  const bad = await admin.post("/api/users").send({ username: "parent.x", password: PW, role: "parent", name: "P", grants: ["students.import"] });
  expect(bad.status).toBe(400);
  const ok = await admin.post("/api/users").send({ username: "teacher.x", password: PW, role: "teacher", name: "T", grants: ["students.import"], assignments: [{ school: schoolId(), className: "5" }] });
  expect(ok.body.data.permissions).toContain("students.import");
  const plain = await admin.post("/api/users").send({ username: "teacher.y", password: PW, role: "teacher", name: "T2" });
  expect(plain.body.data.permissions).not.toContain("students.import");
});
