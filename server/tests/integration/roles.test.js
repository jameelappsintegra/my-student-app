const request = require("supertest");
const sharp = require("sharp");
const { createApp } = require("../../src/app");
const { startDb, clearDb, stopDb } = require("./setup");
const { signIn, schoolId, createSchool } = require("./helpers");

const app = createApp({ loginLimit: 1000 });
jest.setTimeout(60000);
beforeAll(startDb);
afterEach(clearDb);
afterAll(stopDb);

const PW = "a long enough passphrase";
let admin, teacher, parent, A, B, C, D, other;

async function login(username) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ username, password: PW });
  if (res.status !== 200) throw new Error(res.body.message);
  return agent;
}
const png = () => sharp({ create: { width: 64, height: 64, channels: 3, background: "#123456" } }).png().toBuffer();

beforeEach(async () => {
  admin = await signIn(app);
  other = await createSchool({ name: "Other School", code: "OTH" });
  let n = 0;
  const add = async (o) => {
    n += 1;
    const r = await admin.post("/api/students").send({
      school: schoolId(), firstName: `Kid${n}`, lastName: "Roles", dateOfBirth: `2016-02-${String(n).padStart(2, "0")}`,
      gender: "female", address: "1 Road", className: "5", section: "A", academicYear: "2026-2027",
      father: { name: "F", phone: "9876543210" }, ...o,
    });
    if (r.status !== 201) throw new Error(JSON.stringify(r.body));
    return r.body.data;
  };
  A = await add();
  B = await add({ section: "B" });
  C = await add({ className: "6" });
  D = await add({ school: other });
  const t = await admin.post("/api/users").send({ username: "teacher.one", password: PW, role: "teacher", name: "Ms Teacher", assignments: [{ school: schoolId(), className: "5", section: "a" }] });
  expect(t.status).toBe(201);
  const p = await admin.post("/api/users").send({ username: "parent.one", password: PW, role: "parent", name: "Mr Parent", children: [A.id] });
  expect(p.status).toBe(201);
  teacher = await login("teacher.one");
  parent = await login("parent.one");
});

describe("teacher", () => {
  test("sees only assigned students, everywhere", async () => {
    const me = await teacher.get("/api/auth/me");
    expect(me.body.data.user.permissions).toContain("attendance.mark");
    expect(me.body.data.user.permissions).not.toContain("fees.view");
    expect((await teacher.get("/api/students")).body.data.map((s) => s.id)).toEqual([A.id]);
    expect((await teacher.get("/api/search?q=kid")).body.data.map((s) => s.id)).toEqual([A.id]);
    expect((await teacher.get(`/api/students/${A.id}`)).status).toBe(200);
    for (const s of [B, C, D]) {
      expect((await teacher.get(`/api/students/${s.id}`)).status).toBe(404);
      expect((await teacher.get(`/api/students/${s.id}/attendance`)).status).toBe(404);
      expect((await teacher.put(`/api/students/${s.id}/attendance/2026-11-02`).send({ status: "present" })).status).toBe(404);
    }
    expect((await teacher.get("/api/schools")).body.data.map((s) => s.code)).toEqual(["TS"]);
    const classes = await teacher.get("/api/me/classes");
    expect(classes.body.data).toEqual([expect.objectContaining({ className: "5", section: "A", students: 1, markedToday: 0 })]);
  });

  test("marks attendance and enters results, but can't edit records, fees or admin areas", async () => {
    expect((await teacher.put(`/api/students/${A.id}/attendance/2026-11-02`).send({ status: "late" })).status).toBe(200);
    expect((await teacher.post(`/api/students/${A.id}/results`).send({ academicYear: "2026-2027", exam: "Unit test", subjects: [{ subject: "English", maxMarks: 20, marks: 18 }] })).status).toBe(201);
    const denied = [
      ["put", `/api/students/${A.id}`, { phone: "9000000000" }],
      ["delete", `/api/students/${A.id}`],
      ["patch", `/api/students/${A.id}/status`, { status: "inactive" }],
      ["post", "/api/students", {}],
      ["get", `/api/students/${A.id}/fees`],
      ["post", `/api/students/${A.id}/fees`, {}],
      ["get", "/api/dashboard"],
      ["get", "/api/admissions"],
      ["get", "/api/reports/fee-defaulters"],
      ["get", "/api/users"],
      ["post", "/api/schools", { name: "X", code: "XX" }],
    ];
    for (const [m, url, body] of denied) {
      const res = await teacher[m](url).send(body || {});
      expect([m, url, res.status]).toEqual([m, url, 403]);
    }
  });

  test("reports are limited to the teacher's students", async () => {
    const list = (await teacher.get("/api/reports")).body.data.map((r) => r.id);
    expect(list).toEqual(expect.arrayContaining(["students", "class-attendance", "exam-performance", "toppers"]));
    expect(list).not.toContain("fee-defaulters");
    expect(list).not.toContain("admissions");
    expect((await teacher.get("/api/reports/students")).body.data.rows.map((r) => r.id)).toEqual([A.id]);
    expect((await teacher.get(`/api/reports/strength`)).body.data.rows).toEqual([expect.objectContaining({ className: "5", section: "A", total: 1, girls: 1 })]);
    expect((await teacher.get(`/api/reports/students?school=${other.id || other}`)).status).toBe(403);
  });

  test("register: own class only", async () => {
    const q = (o) => `/api/attendance/register?${new URLSearchParams({ school: schoolId(), className: "5", date: "2026-11-16", ...o })}`;
    expect((await teacher.get(q({ section: "A" }))).status).toBe(200);
    expect((await teacher.get(q({ section: "B" }))).status).toBe(403);
    expect((await teacher.get(q({}))).status).toBe(403); // whole class includes section B
    const save = (entries, section = "A") => teacher.put("/api/attendance/register").send({ school: schoolId(), className: "5", section, date: "2026-11-16", entries });
    expect((await save([{ student: A.id, status: "present" }])).status).toBe(200);
    expect((await save([{ student: B.id, status: "present" }])).status).toBe(400);
    expect((await save([{ student: B.id, status: "present" }], "B")).status).toBe(403);
  });

  test("assignment changes take effect immediately", async () => {
    const t = (await admin.get("/api/users?role=teacher")).body.data[0];
    await admin.put(`/api/users/${t.id}`).send({ assignments: [{ school: schoolId(), className: "6" }] });
    expect((await teacher.get("/api/students")).body.data.map((s) => s.id)).toEqual([C.id]);
  });
});

describe("parent", () => {
  test("sees only their child, read-only, including fees", async () => {
    expect((await parent.get("/api/students")).body.data.map((s) => s.id)).toEqual([A.id]);
    expect((await parent.get(`/api/students/${A.id}/fees`)).status).toBe(200);
    expect((await parent.get(`/api/students/${A.id}/results`)).status).toBe(200);
    expect((await parent.get(`/api/students/${B.id}`)).status).toBe(404);
    expect((await parent.get(`/api/students/${B.id}/fees`)).status).toBe(404);
    for (const [m, url] of [
      ["put", `/api/students/${A.id}/attendance/2026-11-02`],
      ["post", `/api/students/${A.id}/results`],
      ["post", `/api/students/${A.id}/fees`],
      ["put", `/api/students/${A.id}`],
      ["get", "/api/search?q=kid"],
      ["get", "/api/schools"],
      ["get", `/api/attendance/register?school=${schoolId()}&className=5&date=2026-11-16`],
    ]) {
      expect([url, (await parent[m](url).send({ status: "present" })).status]).toEqual([url, 403]);
    }
    const kids = await parent.get("/api/me/children");
    expect(kids.body.data).toEqual([expect.objectContaining({ id: A.id, fees: expect.objectContaining({ balance: 0 }), latestResult: null })]);
  });
});

describe("photos", () => {
  const up = async (agent, url) => agent.put(url).set("X-Requested-With", "EduPro").attach("photo", await png(), { filename: "p.png", contentType: "image/png" });

  test("teacher and parent can change photos of their own students only", async () => {
    const buf = await png();
    const upload = (agent, id) => agent.put(`/api/students/${id}/photo`).set("X-Requested-With", "EduPro").attach("photo", buf, { filename: "p.png", contentType: "image/png" });
    expect((await upload(teacher, A.id)).status).toBe(200);
    expect((await upload(parent, A.id)).status).toBe(200);
    expect((await upload(teacher, B.id)).status).toBe(404);
    expect((await upload(parent, B.id)).status).toBe(404);
    expect((await parent.delete(`/api/students/${A.id}/photo`)).body.data.photoUrl).toBeNull();
  });

  test("everyone can set their own profile photo; staff photos are visible, parent photos private", async () => {
    const buf = await png();
    const self = (agent) => agent.put("/api/me/photo").set("X-Requested-With", "EduPro").attach("photo", buf, { filename: "me.png", contentType: "image/png" });
    const t = await self(teacher);
    expect(t.status).toBe(200);
    expect(t.body.data.photoUrl).toMatch(/^\/api\/users\/[a-f0-9]{24}\/photo\?v=\d+$/);
    const p = await self(parent);
    expect((await parent.get(t.body.data.photoUrl)).status).toBe(200); // parent sees teacher
    expect((await teacher.get(p.body.data.photoUrl)).status).toBe(404); // teacher can't see parent
    expect((await admin.get(p.body.data.photoUrl)).status).toBe(200);
    expect((await request(app).get(t.body.data.photoUrl)).status).toBe(401);
    expect((await teacher.get("/api/auth/me")).body.data.user.photoUrl).toBe(t.body.data.photoUrl);
    expect((await teacher.delete("/api/me/photo")).body.data.photoUrl).toBeNull();
    // Only admins set photos for other people.
    expect((await up(teacher, `/api/users/${p.body.data.id}/photo`)).status).toBe(403);
  });
});

describe("account management", () => {
  test("validation and conflicts", async () => {
    const bad = [
      [{ username: "teacher.one", password: PW, role: "teacher", name: "Dup" }, 409],
      [{ username: "x1", password: PW, role: "teacher", name: "X" }, 400],
      [{ username: "abc", password: "short", role: "teacher", name: "X" }, 400],
      [{ username: "abc", password: PW, role: "teacher", name: "X", children: [A.id] }, 400],
      [{ username: "abc", password: PW, role: "parent", name: "X", children: ["64b7f0f0f0f0f0f0f0f0f0f0"] }, 400],
      [{ username: "abc", password: PW, role: "teacher", name: "X", assignments: [{ school: "64b7f0f0f0f0f0f0f0f0f0f0", className: "5" }] }, 400],
      [{ username: "abc", password: PW, role: "superuser", name: "X" }, 400],
    ];
    for (const [body, code] of bad) expect([body.username, (await admin.post("/api/users").send(body)).status]).toEqual([body.username, code]);
    expect(JSON.stringify((await admin.get("/api/users")).body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  test("deactivation and password reset sign people out", async () => {
    const list = (await admin.get("/api/users")).body.data;
    const t = list.find((u) => u.username === "teacher.one");
    const p = list.find((u) => u.username === "parent.one");
    expect(p.childDetails).toEqual([expect.objectContaining({ id: A.id, school: "TS" })]);
    expect(t.assignments[0]).toMatchObject({ schoolCode: "TS", className: "5", section: "A" });
    await admin.put(`/api/users/${t.id}`).send({ active: false });
    expect((await teacher.get("/api/students")).status).toBe(401);
    await admin.post(`/api/users/${p.id}/password`).send({ password: "brand new passphrase" });
    expect((await parent.get("/api/students")).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ username: "parent.one", password: "brand new passphrase" })).status).toBe(200);
  });

  test("admins can't remove themselves or the last admin", async () => {
    const me = (await admin.get("/api/auth/me")).body.data.user;
    expect((await admin.put(`/api/users/${me.id}`).send({ active: false })).status).toBe(400);
    expect((await admin.delete(`/api/users/${me.id}`)).status).toBe(400);
    const t = (await admin.get("/api/users?role=teacher")).body.data[0];
    expect((await admin.delete(`/api/users/${t.id}`)).status).toBe(200);
  });

  test("changing your own password keeps this session and ends the others", async () => {
    const second = await login("teacher.one");
    const wrong = await teacher.post("/api/auth/password").send({ currentPassword: "nope", newPassword: "another long passphrase" });
    expect(wrong.body.errors[0].field).toBe("currentPassword");
    expect((await teacher.post("/api/auth/password").send({ currentPassword: PW, newPassword: "another long passphrase" })).status).toBe(200);
    expect((await teacher.get("/api/students")).status).toBe(200);
    expect((await second.get("/api/students")).status).toBe(401);
  });
});
