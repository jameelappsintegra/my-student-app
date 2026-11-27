const request = require("supertest");
const { createApp } = require("../../src/app");
const Attendance = require("../../src/models/Attendance");
const AuditLog = require("../../src/models/AuditLog");
const { startDb, clearDb, stopDb } = require("./setup");
const { signIn, schoolId, createSchool } = require("./helpers");

const app = createApp({ loginLimit: 1000 });
jest.setTimeout(60000);
beforeAll(startDb);
afterEach(clearDb);
afterAll(stopDb);

const PW = "a long enough passphrase";
const YEAR = "2026-2027";
let admin, other, A, B, Z, teacher, principal, parent, otherParent;
const login = async (username) => {
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ username, password: PW });
  return a;
};
const unread = async (agent) => (await agent.get("/api/notifications?unread=true")).body.data;

beforeEach(async () => {
  admin = await signIn(app);
  other = await createSchool({ name: "Other School", code: "OTH" });
  let n = 0;
  const add = async (o) => {
    n += 1;
    const r = await admin.post("/api/students").send({
      school: schoolId(), firstName: `Kid${n}`, lastName: "Mod", dateOfBirth: `2016-05-${String(n).padStart(2, "0")}`, gender: "male",
      address: "1 Road", className: "5", section: "A", rollNumber: n, academicYear: YEAR, father: { name: "F", phone: "9876543210" }, ...o,
    });
    return r.body.data;
  };
  A = await add();
  B = await add({ section: "B" });
  Z = await add({ school: other, rollNumber: undefined });
  await admin.post("/api/users").send({ username: "teach1", password: PW, role: "teacher", name: "Teach One", assignments: [{ school: schoolId(), className: "5", section: "A" }] });
  await admin.post("/api/users").send({ username: "head1", password: PW, role: "principal", name: "Head One", schools: [schoolId()] });
  await admin.post("/api/users").send({ username: "parent1", password: PW, role: "parent", name: "Parent One", children: [A.id] });
  await admin.post("/api/users").send({ username: "parent2", password: PW, role: "parent", name: "Parent Two", children: [Z.id] });
  [teacher, principal, parent, otherParent] = await Promise.all(["teach1", "head1", "parent1", "parent2"].map(login));
});

describe("announcements and notifications", () => {
  test("principal posts to their school; only that school's people see and are notified", async () => {
    expect((await teacher.post("/api/announcements").send({ title: "Hello", body: "x" })).status).toBe(403);
    expect((await principal.post("/api/announcements").send({ title: "Wrong school", body: "x", school: other })).status).toBe(403);
    const res = await principal.post("/api/announcements").send({ title: "Sports day", body: "Friday 9 am on the ground", school: schoolId(), eventDate: "2026-12-05" });
    expect(res.status).toBe(201);
    expect((await parent.get("/api/announcements")).body.data.map((a) => a.title)).toEqual(["Sports day"]);
    expect((await otherParent.get("/api/announcements")).body.data).toEqual([]);
    expect((await teacher.get("/api/announcements")).body.data).toHaveLength(1);
    const n = await unread(parent);
    expect(n.unread).toBe(1);
    expect(n.items[0]).toMatchObject({ type: "announcement", title: "Sports day" });
    expect((await unread(otherParent)).unread).toBe(0);
    expect((await unread(teacher)).unread).toBe(1);
    await parent.post("/api/notifications/read").send({ all: true });
    expect((await unread(parent)).unread).toBe(0);
  });

  test("staff-only and expired announcements are hidden from parents", async () => {
    await principal.post("/api/announcements").send({ title: "Staff meeting", body: "4 pm", school: schoolId(), audience: "staff" });
    await admin.post("/api/announcements").send({ title: "Old news", body: "x", expiresAt: "2020-01-01" });
    await admin.post("/api/announcements").send({ title: "All schools", body: "Holiday on Monday" });
    expect((await parent.get("/api/announcements")).body.data.map((a) => a.title)).toEqual(["All schools"]);
    expect((await teacher.get("/api/announcements")).body.data.map((a) => a.title).sort()).toEqual(["All schools", "Staff meeting"]);
  });
});

describe("homework", () => {
  test("teacher posts to their class; parents of that class see it and are notified", async () => {
    const hw = await teacher.post("/api/homework").send({ school: schoolId(), className: "5", section: "A", subject: "Maths", title: "Exercise 4.2", dueDate: "2026-12-01" });
    expect(hw.status).toBe(201);
    expect(hw.body.message).toBe("Homework posted to 1 students' parents.");
    expect((await teacher.post("/api/homework").send({ school: schoolId(), className: "5", section: "B", subject: "Maths", title: "Not mine", dueDate: "2026-12-01" })).status).toBe(403);
    expect((await parent.post("/api/homework").send({})).status).toBe(403);
    expect((await parent.get("/api/homework")).body.data.map((h) => h.title)).toEqual(["Exercise 4.2"]);
    expect((await otherParent.get("/api/homework")).body.data).toEqual([]);
    expect((await unread(parent)).items[0]).toMatchObject({ type: "homework", title: "Homework: Maths" });
    expect((await teacher.delete(`/api/homework/${hw.body.data.id}`)).status).toBe(200);
  });
});

describe("timetable", () => {
  test("clash detection for teachers and rooms; class and teacher views", async () => {
    const t1 = (await admin.get("/api/users?role=teacher")).body.data[0].id;
    const set = (o) => principal.put("/api/timetable/slot").send({ school: schoolId(), className: "5", section: "A", day: 1, period: 1, subject: "English", teacher: t1, room: "R1", ...o });
    expect((await set()).status).toBe(200);
    const clashT = await set({ section: "B", room: "R2" });
    expect(clashT.status).toBe(409);
    expect(clashT.body.message).toBe("That teacher already has Class 5 A in this period.");
    const clashR = await set({ section: "B", teacher: undefined, room: "R1" });
    expect(clashR.body.message).toBe("Room R1 is already used by Class 5 A in this period.");
    expect((await set({ section: "B", teacher: undefined, room: "R2", subject: "Science" })).status).toBe(200);
    // Editing the same slot is not a clash with itself.
    expect((await set({ subject: "English Grammar" })).status).toBe(200);
    expect((await teacher.put("/api/timetable/slot").send({})).status).toBe(403);
    expect((await principal.put("/api/timetable/slot").send({ school: other, className: "5", section: "A", day: 1, period: 1, subject: "X" })).status).toBe(403);
    const forParent = await parent.get(`/api/timetable?school=${schoolId()}&className=5&section=A`);
    expect(forParent.body.data.map((e) => [e.day, e.period, e.subject, e.teacher?.name])).toEqual([[1, 1, "English Grammar", "Teach One"]]);
    expect((await otherParent.get(`/api/timetable?school=${schoolId()}&className=5&section=A`)).body.data).toEqual([]);
    expect((await teacher.get("/api/timetable/mine")).body.data).toHaveLength(1);
  });
});

describe("result publishing and report cards", () => {
  test("draft → published; parents see only published; published marks are locked for teachers", async () => {
    const r = await teacher.post(`/api/students/${A.id}/results`).send({ academicYear: YEAR, exam: "Term 1", subjects: [{ subject: "English", maxMarks: 100, marks: 88 }] });
    expect(r.body.data.status).toBe("draft");
    expect((await parent.get(`/api/students/${A.id}/results`)).body.data).toEqual([]);
    expect((await teacher.post("/api/results/publish").send({ school: schoolId(), className: "5", section: "A", academicYear: YEAR, exam: "Term 1" })).status).toBe(403);
    const status = await teacher.get(`/api/results/status?school=${schoolId()}&className=5&section=A&academicYear=${YEAR}`);
    expect(status.body.data).toEqual({ students: 1, exams: [{ exam: "Term 1", results: 1, published: 0 }] });
    const pub = await principal.post("/api/results/publish").send({ school: schoolId(), className: "5", section: "A", academicYear: YEAR, exam: "Term 1" });
    expect(pub.body.message).toBe("1 results published; 1 parents notified.");
    expect((await parent.get(`/api/students/${A.id}/results`)).body.data[0]).toMatchObject({ exam: "Term 1", status: "published", percentage: 88 });
    expect((await unread(parent)).items[0].type).toBe("result");
    expect((await teacher.put(`/api/students/${A.id}/results/${r.body.data.id}`).send({ remarks: "x" })).status).toBe(403);
    expect((await principal.put(`/api/students/${A.id}/results/${r.body.data.id}`).send({ remarks: "Well done" })).status).toBe(200);
    expect((await principal.post("/api/results/publish").send({ school: other, className: "5", academicYear: YEAR, exam: "Term 1" })).status).toBe(403);
    expect((await principal.post("/api/results/publish").send({ school: schoolId(), className: "5", academicYear: YEAR, exam: "Nope" })).status).toBe(404);

    const card = await parent.get(`/api/students/${A.id}/report-card`);
    expect(card.body.data).toMatchObject({ academicYear: YEAR, student: { name: "Kid1 Mod", className: "5" }, school: { name: "Test School" }, includesDrafts: false });
    expect(card.body.data.results).toHaveLength(1);
    await teacher.post(`/api/students/${A.id}/results`).send({ academicYear: YEAR, exam: "Unit 2", subjects: [{ subject: "English", maxMarks: 20, marks: 15 }] });
    expect((await parent.get(`/api/students/${A.id}/report-card`)).body.data.results).toHaveLength(1);
    expect((await teacher.get(`/api/students/${A.id}/report-card`)).body.data.includesDrafts).toBe(true);
    expect((await otherParent.get(`/api/students/${A.id}/report-card`)).status).toBe(404);
  });
});

describe("leave requests", () => {
  test("parent requests, teacher approves, days are marked leave (holidays kept), parent notified", async () => {
    await admin.put(`/api/students/${A.id}/attendance/2026-11-24`).send({ status: "holiday" });
    const bad = await parent.post("/api/leave").send({ student: B.id, from: "2026-11-23", to: "2026-11-25", reason: "Not my child" });
    expect(bad.status).toBe(404);
    expect((await parent.post("/api/leave").send({ student: A.id, from: "2026-11-25", to: "2026-11-23", reason: "Backwards dates" })).status).toBe(400);
    const r = await parent.post("/api/leave").send({ student: A.id, from: "2026-11-23", to: "2026-11-25", reason: "Family function" });
    expect(r.status).toBe(201);
    expect((await parent.post("/api/leave").send({ student: A.id, from: "2026-11-25", to: "2026-11-26", reason: "Overlapping days" })).status).toBe(409);
    expect((await unread(teacher)).items[0]).toMatchObject({ type: "leave", title: "Leave request: Kid1 Mod" });
    expect((await teacher.get("/api/leave?status=pending")).body.data).toHaveLength(1);
    expect((await otherParent.get("/api/leave")).body.data).toEqual([]);
    expect((await parent.post(`/api/leave/${r.body.data.id}/decision`).send({ approve: true })).status).toBe(403);
    const ok = await teacher.post(`/api/leave/${r.body.data.id}/decision`).send({ approve: true, note: "Get well" });
    expect(ok.body.message).toBe("Leave approved; 2 school days marked as leave.");
    const days = await Attendance.find({ student: A.id }).sort({ date: 1 }).lean();
    expect(days.map((d) => [d.date.toISOString().slice(0, 10), d.status])).toEqual([["2026-11-23", "leave"], ["2026-11-24", "holiday"], ["2026-11-25", "leave"]]);
    expect((await unread(parent)).items[0]).toMatchObject({ type: "leave", title: "Leave approved" });
    expect((await teacher.post(`/api/leave/${r.body.data.id}/decision`).send({ approve: false })).status).toBe(400);
  });

  test("cancel a pending request", async () => {
    const r = await parent.post("/api/leave").send({ student: A.id, from: "2026-12-01", to: "2026-12-01", reason: "Doctor visit" });
    expect((await parent.post(`/api/leave/${r.body.data.id}/cancel`).send({})).body.data.status).toBe("cancelled");
    expect((await teacher.post(`/api/leave/${r.body.data.id}/decision`).send({ approve: true })).status).toBe(400);
  });
});

describe("absence alerts", () => {
  test("parents are told once when their child is newly marked absent", async () => {
    const date = new Date().toISOString().slice(0, 10);
    const save = (status) => teacher.put("/api/attendance/register").send({ school: schoolId(), className: "5", section: "A", date, entries: [{ student: A.id, status }] });
    await save("present");
    expect((await unread(parent)).unread).toBe(0);
    await save("absent");
    await save("absent"); // saving again doesn't repeat the alert
    const n = await unread(parent);
    expect(n.unread).toBe(1);
    expect(n.items[0]).toMatchObject({ type: "attendance", title: "Kid1 Mod was absent today", link: `/students/${A.id}?tab=attendance` });
  });
});

describe("audit log", () => {
  test("sign-ins and changes are recorded; only admins can read them", async () => {
    await principal.post("/api/announcements").send({ title: "Audited", body: "x", school: schoolId() });
    await new Promise((r) => setTimeout(r, 200));
    expect(await AuditLog.countDocuments({ event: "auth.login" })).toBeGreaterThanOrEqual(5);
    const res = await admin.get("/api/audit?event=announcement");
    expect(res.body.data.items[0]).toMatchObject({ event: "announcement.create", actorName: "Head One", actorRole: "principal" });
    expect(res.body.data.events).toEqual(expect.arrayContaining(["auth.login", "announcement.create", "user.create"]));
    // Each event is stored once, not once per logger level.
    expect(await AuditLog.countDocuments({ event: "announcement.create" })).toBe(1);
    expect((await principal.get("/api/audit")).status).toBe(403);
  });
});

describe("year-end promotion", () => {
  test("preview, then promote with one student repeating; roll numbers cleared", async () => {
    const keep = B.id;
    await admin.put(`/api/students/${B.id}`).send({ section: "A", rollNumber: 9 });
    const body = { school: schoolId(), className: "5", section: "A", fromYear: YEAR, toYear: "2027-2028", keep: [keep] };
    const preview = await principal.post("/api/promotion").send(body);
    expect(preview.body.data.counts).toEqual({ promote: 1, repeat: 1 });
    expect((await admin.get(`/api/students/${A.id}`)).body.data.className).toBe("5");
    const done = await principal.post("/api/promotion").send({ ...body, dryRun: false });
    expect(done.body.message).toBe("Done: 1 promoted to class 6, 0 graduated, 1 repeating.");
    const a = (await admin.get(`/api/students/${A.id}`)).body.data;
    expect([a.className, a.academicYear, a.rollNumber]).toEqual(["6", "2027-2028", undefined]);
    const b = (await admin.get(`/api/students/${B.id}`)).body.data;
    expect([b.className, b.academicYear]).toEqual(["5", "2027-2028"]);
    expect((await teacher.post("/api/promotion").send(body)).status).toBe(403);
    expect((await principal.post("/api/promotion").send({ ...body, school: other })).status).toBe(403);
    expect((await principal.post("/api/promotion").send({ ...body, toYear: "2030-2031" })).status).toBe(400);
  });

  test("class 12 graduates", async () => {
    const s = (await admin.post("/api/students").send({ school: schoolId(), firstName: "Senior", lastName: "Kid", dateOfBirth: "2008-01-01", gender: "female", address: "x", className: "12", academicYear: YEAR, father: { name: "F", phone: "9876543210" } })).body.data;
    const res = await admin.post("/api/promotion").send({ school: schoolId(), className: "12", fromYear: YEAR, toYear: "2027-2028", dryRun: false });
    expect(res.body.data.counts).toEqual({ graduate: 1 });
    expect((await admin.get(`/api/students/${s.id}`)).body.data.status).toBe("graduated");
  });
});
