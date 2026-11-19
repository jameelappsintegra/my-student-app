const request = require("supertest");
const { createApp } = require("../../src/app");
const Attendance = require("../../src/models/Attendance");
const { startDb, clearDb, stopDb } = require("./setup");
const { signIn, schoolId, createSchool } = require("./helpers");
const { toCsv } = require("../../src/utils/csv");

const app = createApp();
jest.setTimeout(60000);
beforeAll(startDb);
let agent;
beforeEach(async () => {
  agent = await signIn(app);
  n = 0;
});
afterEach(clearDb);
afterAll(stopDb);

let n;
const add = async (o = {}) => {
  n += 1;
  const res = await agent.post("/api/students").send({
    school: schoolId(), firstName: `Kid${n}`, lastName: "Test", dateOfBirth: `2016-01-${String(n).padStart(2, "0")}`,
    gender: "male", address: "1 Road", className: "5", section: "A", rollNumber: n, academicYear: "2026-2027",
    father: { name: `Father ${n}`, phone: `98765000${String(n).padStart(2, "0")}` }, ...o,
  });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.data;
};
const reg = (q) => agent.get(`/api/attendance/register?${new URLSearchParams({ school: schoolId(), className: "5", section: "A", date: "2026-11-16", ...q })}`);

describe("class register", () => {
  test("lists the class in roll order with today's marks, then saves everyone at once", async () => {
    const a = await add();
    const b = await add();
    await add({ section: "B" });
    await add({ className: "6" });
    const inactive = await add();
    await agent.patch(`/api/students/${inactive.id}/status`).send({ status: "withdrawn" });

    const before = await reg();
    expect(before.status).toBe(200);
    expect(before.body.data.students.map((s) => s.id)).toEqual([a.id, b.id]);
    expect(before.body.data.students[0].attendance).toBeNull();

    const save = await agent.put("/api/attendance/register").send({
      school: schoolId(), className: "5", section: "a", date: "2026-11-16",
      entries: [{ student: a.id, status: "present" }, { student: b.id, status: "absent", note: "Fever" }],
    });
    expect(save.status).toBe(200);
    expect(save.body.data).toEqual({ date: "2026-11-16", saved: 2, counts: { present: 1, absent: 1 } });

    const after = await reg();
    expect(after.body.data.marked).toBe(2);
    expect(after.body.data.students[1].attendance).toEqual({ status: "absent", note: "Fever" });

    // Saving again corrects instead of duplicating.
    await agent.put("/api/attendance/register").send({
      school: schoolId(), className: "5", section: "A", date: "2026-11-16", entries: [{ student: b.id, status: "present" }],
    });
    expect(await Attendance.countDocuments()).toBe(2);
    const individual = await agent.get(`/api/students/${b.id}/attendance?from=2026-11-16&to=2026-11-16`);
    expect(individual.body.data.records).toEqual([{ date: "2026-11-16", status: "present" }]);
  });

  test("refuses students from another class, duplicates and future dates", async () => {
    const a = await add();
    const other = await add({ section: "B" });
    const body = (entries, extra = {}) => ({ school: schoolId(), className: "5", section: "A", date: "2026-11-16", entries, ...extra });
    const cross = await agent.put("/api/attendance/register").send(body([{ student: a.id, status: "present" }, { student: other.id, status: "absent" }]));
    expect(cross.status).toBe(400);
    expect(cross.body.message).toMatch(/not in this class/);
    expect(await Attendance.countDocuments()).toBe(0);
    expect((await agent.put("/api/attendance/register").send(body([{ student: a.id, status: "present" }, { student: a.id, status: "absent" }]))).status).toBe(400);
    expect((await agent.put("/api/attendance/register").send(body([{ student: a.id, status: "present" }], { date: "2099-01-01" }))).status).toBe(400);
    expect((await agent.put("/api/attendance/register").send(body([]))).status).toBe(400);
    expect((await reg({ school: "64b7f0f0f0f0f0f0f0f0f0f0" })).status).toBe(404);
    expect((await request(app).get("/api/attendance/register")).status).toBe(401);
  });
});

describe("reports", () => {
  test("fee defaulters lists only overdue balances, largest first, as JSON and CSV", async () => {
    const a = await add();
    const b = await add();
    const c = await add();
    const fee = (s, amount, dueDate) => agent.post(`/api/students/${s.id}/fees`).send({ academicYear: "2026-2027", title: "Fee", amount, dueDate });
    const fa = await fee(a, 5000, "2026-06-01");
    await agent.post(`/api/students/${a.id}/fees/${fa.body.data.id}/payments`).send({ amount: 1000, method: "cash" });
    await fee(b, 9000, "2026-07-01");
    await fee(c, 3000, "2099-01-01"); // not due yet

    const res = await agent.get("/api/reports/fee-defaulters");
    expect(res.body.data.rows.map((r) => [r.name, r.overdue])).toEqual([["Kid2 Test", 9000], ["Kid1 Test", 4000]]);
    expect(res.body.data.overdue).toBe(13000);
    expect(res.body.data.rows[0].parentPhone).toMatch(/^98765/);

    const csv = await agent.get("/api/reports/fee-defaulters?format=csv");
    expect(csv.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(csv.headers["content-disposition"]).toMatch(/^attachment; filename="edupro-fee-defaulters-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(csv.headers["cache-control"]).toBe("private, no-store");
    const lines = csv.text.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Admission no.,Name,School,Class,Section,Roll,Parent,Parent phone,Overdue (INR),Total balance (INR),Overdue bills,Oldest due date");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^TS-2026-00002,Kid2 Test,Test School,5,A,2,Father 2,98765000\d\d,9000,9000,1,2026-07-01$/);
  });

  test("low attendance uses the threshold and school days only", async () => {
    const a = await add();
    const b = await add();
    const mark = async (s, statuses) => {
      for (const [i, st] of statuses.entries()) await agent.put(`/api/students/${s.id}/attendance/2026-11-${String(i + 2).padStart(2, "0")}`).send({ status: st });
    };
    await mark(a, ["present", "absent", "absent", "holiday"]); // 1/3 = 33.3%
    await mark(b, ["present", "present", "late", "half_day"]); // 3.5/4 = 87.5%
    const res = await agent.get("/api/reports/low-attendance?from=2026-11-01&to=2026-11-30");
    expect(res.body.data.rows).toEqual([expect.objectContaining({ name: "Kid1 Test", days: 3, absent: 2, percentage: 33.3 })]);
    const high = await agent.get("/api/reports/low-attendance?from=2026-11-01&to=2026-11-30&threshold=90");
    expect(high.body.data.rows.map((r) => r.name)).toEqual(["Kid1 Test", "Kid2 Test"]);
  });

  test("student list filters by school and class; CSV neutralises formulas", async () => {
    await add({ firstName: "=HYPERLINK(\"http://evil\")", address: "Flat 2, \"Rose\" Villa" });
    const other = await createSchool({ name: "Second", code: "SEC" });
    await add({ school: other });
    const res = await agent.get(`/api/reports/students?school=${schoolId()}`);
    expect(res.body.data.total).toBe(1);
    const csv = await agent.get(`/api/reports/students?school=${schoolId()}&format=csv`);
    expect(csv.text).toContain(`"'=HYPERLINK(""http://evil"") Test"`);
    expect(csv.text).toContain(`"Flat 2, ""Rose"" Villa"`);
    expect((await agent.get("/api/reports/students?format=xls")).status).toBe(400);
    expect((await request(app).get("/api/reports/students?format=csv")).status).toBe(401);
  });
});

test("toCsv escapes quotes, commas, newlines and formula prefixes", () => {
  const out = toCsv([{ label: "A", value: "a" }, { label: "B", value: (r) => r.b }], [{ a: "+1", b: "x\ny" }, { a: "-2", b: "@sum" }, { a: null, b: 3 }]);
  expect(out).toBe('﻿A,B\r\n\'+1,"x\ny"\r\n\'-2,\'@sum\r\n,3\r\n');
});
