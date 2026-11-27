const request = require("supertest");
const sharp = require("sharp");
const mongoose = require("mongoose");
const { createApp } = require("../../src/app");
const Attendance = require("../../src/models/Attendance");
const { startDb, clearDb, stopDb } = require("./setup");
const { signIn, schoolId, createSchool } = require("./helpers");

const app = createApp();
jest.setTimeout(60000);
beforeAll(startDb);
let agent;
beforeEach(async () => {
  agent = await signIn(app);
});
afterEach(clearDb);
afterAll(stopDb);

const student = (o = {}) => ({
  school: schoolId(),
  firstName: "Kavya",
  lastName: "Iyer",
  dateOfBirth: "2016-04-02",
  gender: "female",
  address: "4 Temple Road",
  className: "5",
  academicYear: "2026-2027",
  section: "A",
  rollNumber: 3,
  father: { name: "Ganesh Iyer", phone: "9876543210" },
  transport: "school_bus",
  busRoute: "Route 2",
  ...o,
});
const add = async (o) => {
  const res = await agent.post("/api/students").send(student(o));
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.data;
};
const png = (w = 800, h = 600) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#4f46e5" } }).png().toBuffer();

describe("schools", () => {
  test("create, read, update, list with counts, delete", async () => {
    const res = await agent.post("/api/schools").send({ name: "Sunrise School", code: "sun", board: "ICSE", email: "office@sun.example.com" });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe("SUN");
    const id = res.body.data.id;
    expect((await agent.post("/api/schools").send({ name: "Other", code: "SUN" })).status).toBe(409);
    expect((await agent.put(`/api/schools/${id}`).send({ principalName: "Ms. Rao" })).body.data.principalName).toBe("Ms. Rao");
    await add({ school: id });
    const list = await agent.get("/api/schools");
    expect(list.body.data.find((s) => s.code === "SUN").activeStudents).toBe(1);
    expect(list.body.data.find((s) => s.code === "TS").activeStudents).toBe(0);
    // Schools with records can't be deleted or have their code changed.
    expect((await agent.delete(`/api/schools/${id}`)).status).toBe(409);
    expect((await agent.put(`/api/schools/${id}`).send({ code: "NEW" })).status).toBe(409);
    expect((await agent.delete(`/api/schools/${schoolId()}`)).status).toBe(200);
    expect((await agent.get(`/api/schools/${schoolId()}`)).status).toBe(404);
  });

  test("validation", async () => {
    const res = await agent.post("/api/schools").send({ name: "", code: "a", board: "Moon" });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field).sort()).toEqual(["board", "code", "name"]);
  });

  test("inactive schools refuse new students and applications", async () => {
    await agent.put(`/api/schools/${schoolId()}`).send({ active: false });
    const res = await agent.post("/api/students").send(student());
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toEqual({ field: "school", message: "Test School is not accepting new students" });
  });
});

describe("students CRUD", () => {
  test("direct create assigns a school-coded number and returns full details", async () => {
    const s = await add();
    expect(s.admissionNumber).toBe("TS-2026-00001");
    expect(s.school).toEqual({ id: schoolId(), name: "Test School", code: "TS" });
    expect(s.busRoute).toBe("Route 2");
    expect(s.photoUrl).toBeNull();
    const other = await createSchool({ name: "Second", code: "SEC" });
    expect((await add({ school: other, firstName: "Arjun" })).admissionNumber).toBe("SEC-2026-00001");
  });

  test("duplicates, unknown school and bad input are rejected", async () => {
    await add();
    expect((await agent.post("/api/students").send(student({ firstName: " kavya " }))).status).toBe(409);
    const ghost = await agent.post("/api/students").send(student({ school: "64b7f0f0f0f0f0f0f0f0f0f0", firstName: "X" }));
    expect(ghost.body.errors[0].field).toBe("school");
    const bad = await agent.post("/api/students").send(student({ email: "nope", transport: "rocket", admissionNumber: "X" }));
    expect(bad.status).toBe(400);
  });

  test("update, filter by school, status, delete", async () => {
    const s = await add();
    const other = await createSchool({ name: "Second", code: "SEC" });
    await add({ school: other, firstName: "Arjun" });
    const upd = await agent.put(`/api/students/${s.id}`).send({ phone: "9000000001", section: "B", school: other });
    expect(upd.status).toBe(400); // school can't change
    const ok = await agent.put(`/api/students/${s.id}`).send({ phone: "9000000001", section: "b" });
    expect(ok.body.data).toMatchObject({ phone: "9000000001", section: "B" });
    const bySchool = await agent.get(`/api/students?school=${other}`);
    expect(bySchool.body.data.map((x) => x.firstName)).toEqual(["Arjun"]);
    expect(bySchool.body.data[0].school.code).toBe("SEC");
    expect((await agent.patch(`/api/students/${s.id}/status`).send({ status: "transferred" })).body.data.status).toBe("transferred");
    expect((await agent.delete(`/api/students/${s.id}`)).status).toBe(200);
    expect((await agent.get(`/api/students/${s.id}`)).status).toBe(404);
  });

  test("renaming into another student's identity is blocked", async () => {
    await add();
    const b = await add({ firstName: "Meera", rollNumber: 4 });
    expect((await agent.put(`/api/students/${b.id}`).send({ firstName: "Kavya" })).status).toBe(409);
  });
});

describe("photos", () => {
  const upload = (id, buf, type = "image/png") =>
    agent.put(`/api/students/${id}/photo`).set("X-Requested-With", "EduPro").attach("photo", buf, { filename: "p.png", contentType: type });

  test("upload is re-encoded to a 512px JPEG, served privately, replaced and removed", async () => {
    const s = await add();
    const res = await upload(s.id, await png());
    expect(res.status).toBe(200);
    expect(res.body.data.photoUrl).toMatch(new RegExp(`^/api/students/${s.id}/photo\\?v=\\d+$`));

    const img = await agent.get(res.body.data.photoUrl).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toBe("image/jpeg");
    expect(img.headers["cache-control"]).toBe("private, max-age=86400");
    const meta = await sharp(img.body).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 512, height: 512 });
    expect(meta.exif).toBeUndefined();

    // 304 for an unchanged photo.
    expect((await agent.get(res.body.data.photoUrl).set("If-None-Match", img.headers.etag)).status).toBe(304);

    // Replacing deletes the old file from GridFS.
    await upload(s.id, await png(300, 300));
    const files = await mongoose.connection.db.collection("studentPhotos.files").countDocuments();
    expect(files).toBe(1);

    // The photo shows in lists and search.
    expect((await agent.get("/api/students")).body.data[0].photoUrl).toMatch(/photo\?v=/);

    const del = await agent.delete(`/api/students/${s.id}/photo`);
    expect(del.body.data.photoUrl).toBeNull();
    expect(await mongoose.connection.db.collection("studentPhotos.files").countDocuments()).toBe(0);
    expect((await agent.get(`/api/students/${s.id}/photo`)).status).toBe(404);
  });

  test("rejects non-images, disguised files, oversize files and missing CSRF header", async () => {
    const s = await add();
    const fake = Buffer.from("<html><script>alert(1)</script></html>");
    expect((await upload(s.id, fake)).status).toBe(400);
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).gif().toBuffer();
    expect((await upload(s.id, gif, "image/png")).body.message).toMatch(/not a supported image/);
    expect((await upload(s.id, Buffer.alloc(6 * 1024 * 1024, 1))).status).toBe(413);
    const noHeader = await agent.put(`/api/students/${s.id}/photo`).attach("photo", await png(), "p.png");
    expect(noHeader.status).toBe(415);
    expect((await request(app).get(`/api/students/${s.id}/photo`)).status).toBe(401);
  });
});

describe("attendance", () => {
  test("mark, correct, summarise and clear", async () => {
    const s = await add();
    const mark = (date, status) => agent.put(`/api/students/${s.id}/attendance/${date}`).send({ status });
    for (const [d, st] of [["2026-11-02", "present"], ["2026-11-03", "absent"], ["2026-11-04", "late"], ["2026-11-05", "half_day"], ["2026-11-06", "holiday"]]) {
      expect((await mark(d, st)).status).toBe(200);
    }
    // Correcting a day updates it instead of adding a duplicate.
    await mark("2026-11-03", "leave");
    expect(await Attendance.countDocuments()).toBe(5);
    const res = await agent.get(`/api/students/${s.id}/attendance?from=2026-11-01&to=2026-11-10`);
    expect(res.body.data.summary).toMatchObject({ present: 1, leave: 1, late: 1, half_day: 1, holiday: 1, workingDays: 4, percentage: 62.5 });
    expect(res.body.data.records[0]).toEqual({ date: "2026-11-06", status: "holiday" });
    expect((await agent.delete(`/api/students/${s.id}/attendance/2026-11-06`)).status).toBe(200);
    expect((await agent.delete(`/api/students/${s.id}/attendance/2026-11-06`)).status).toBe(404);
  });

  test("rejects future dates, bad statuses and bad ranges", async () => {
    const s = await add();
    expect((await agent.put(`/api/students/${s.id}/attendance/2099-01-01`).send({ status: "present" })).status).toBe(400);
    expect((await agent.put(`/api/students/${s.id}/attendance/2026-13-40`).send({ status: "present" })).status).toBe(400);
    expect((await agent.put(`/api/students/${s.id}/attendance/2026-11-02`).send({ status: "sleeping" })).status).toBe(400);
    expect((await agent.get(`/api/students/${s.id}/attendance?from=2026-11-10&to=2026-11-01`)).status).toBe(400);
    expect((await agent.get(`/api/students/${s.id}/attendance?from=2024-01-01&to=2026-11-01`)).status).toBe(400);
  });
});

describe("exam results", () => {
  const result = (o = {}) => ({
    academicYear: "2026-2027",
    exam: "Term 1",
    subjects: [
      { subject: "English", maxMarks: 100, marks: 92 },
      { subject: "Mathematics", maxMarks: 100, marks: 30 },
    ],
    ...o,
  });

  test("scores, grades, pass/fail; one result per exam; update and delete", async () => {
    const s = await add();
    const res = await agent.post(`/api/students/${s.id}/results`).send(result());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ total: 122, maxTotal: 200, percentage: 61, grade: "B2", passed: false });
    expect(res.body.data.subjects[0]).toMatchObject({ grade: "A1", passed: true });
    expect(res.body.data.subjects[1]).toMatchObject({ grade: "E", passed: false });
    expect((await agent.post(`/api/students/${s.id}/results`).send(result())).status).toBe(409);
    const upd = await agent.put(`/api/students/${s.id}/results/${res.body.data.id}`).send({ subjects: [{ subject: "Mathematics", maxMarks: 100, marks: 75 }] });
    expect(upd.body.data).toMatchObject({ percentage: 75, grade: "B1", passed: true });
    expect((await agent.get(`/api/students/${s.id}/results`)).body.data).toHaveLength(1);
    expect((await agent.delete(`/api/students/${s.id}/results/${res.body.data.id}`)).status).toBe(200);
  });

  test("validation: marks over maximum, duplicate subjects, empty list", async () => {
    const s = await add();
    const over = await agent.post(`/api/students/${s.id}/results`).send(result({ subjects: [{ subject: "English", maxMarks: 50, marks: 60 }] }));
    expect(over.body.errors[0]).toEqual({ field: "subjects.0.marks", message: "Marks can't exceed the maximum" });
    const dup = await agent.post(`/api/students/${s.id}/results`).send(result({ subjects: [{ subject: "English", maxMarks: 50, marks: 1 }, { subject: "english", maxMarks: 50, marks: 1 }] }));
    expect(dup.status).toBe(400);
    expect((await agent.post(`/api/students/${s.id}/results`).send(result({ subjects: [] }))).status).toBe(400);
  });

  test("records of one student can't be reached through another", async () => {
    const a = await add();
    const b = await add({ firstName: "Meera", rollNumber: 4 });
    const r = await agent.post(`/api/students/${a.id}/results`).send(result());
    expect((await agent.put(`/api/students/${b.id}/results/${r.body.data.id}`).send({ remarks: "x" })).status).toBe(404);
    expect((await agent.delete(`/api/students/${b.id}/results/${r.body.data.id}`)).status).toBe(404);
  });
});

describe("fees", () => {
  test("invoice, partial and full payment, receipts, overdue, guards", async () => {
    const s = await add();
    const inv = await agent.post(`/api/students/${s.id}/fees`).send({ academicYear: "2026-2027", title: "Term 1 fee", amount: 12000, dueDate: "2026-06-15" });
    expect(inv.status).toBe(201);
    expect(inv.body.data).toMatchObject({ status: "unpaid", balance: 12000, overdue: true });
    const id = inv.body.data.id;
    const pay = (amount, extra = {}) => agent.post(`/api/students/${s.id}/fees/${id}/payments`).send({ amount, method: "upi", ...extra });

    const p1 = await pay(5000, { reference: "UPI123" });
    expect(p1.status).toBe(201);
    expect(p1.body.message).toMatch(/Receipt RCPT-TS-2026-00001/);
    expect(p1.body.data).toMatchObject({ status: "partial", paid: 5000, balance: 7000 });
    expect((await pay(8000)).body.message).toMatch(/more than the ₹7,000 still due/);
    expect((await pay(100, { paidAt: "2099-01-01" })).status).toBe(400);
    expect((await pay(10.5)).status).toBe(400);
    expect((await agent.put(`/api/students/${s.id}/fees/${id}`).send({ amount: 4000 })).status).toBe(400);
    expect((await agent.delete(`/api/students/${s.id}/fees/${id}`)).status).toBe(409);

    const p2 = await pay(7000);
    expect(p2.body.data).toMatchObject({ status: "paid", balance: 0, overdue: false });
    expect((await pay(1)).status).toBe(409);

    const list = await agent.get(`/api/students/${s.id}/fees`);
    expect(list.body.data.summary).toMatchObject({ billed: 12000, paid: 12000, balance: 0, status: "paid" });

    const paymentId = p2.body.data.payments[1].id;
    const removed = await agent.delete(`/api/students/${s.id}/fees/${id}/payments/${paymentId}`);
    expect(removed.body.data).toMatchObject({ status: "partial", balance: 7000 });
  });

  test("simultaneous payments can't overpay", async () => {
    const s = await add();
    const inv = await agent.post(`/api/students/${s.id}/fees`).send({ academicYear: "2026-2027", title: "Term 2", amount: 1000, dueDate: "2027-01-15" });
    const results = await Promise.all(
      Array.from({ length: 4 }, () => agent.post(`/api/students/${s.id}/fees/${inv.body.data.id}/payments`).send({ amount: 1000, method: "cash" }))
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const list = await agent.get(`/api/students/${s.id}/fees`);
    expect(list.body.data.summary.paid).toBe(1000);
  });
});

describe("search and dashboard", () => {
  test("global search finds students across schools with photo and school", async () => {
    const other = await createSchool({ name: "Second", code: "SEC" });
    await add();
    await add({ school: other, firstName: "Kavin", lastName: "Raj" });
    const res = await agent.get("/api/search?q=kav");
    expect(res.body.data.map((s) => `${s.firstName} ${s.school.code}`).sort()).toEqual(["Kavin SEC", "Kavya TS"]);
    expect((await agent.get("/api/search?q=TS-2026-00001")).body.data[0].firstName).toBe("Kavya");
    expect((await agent.get("/api/search?q=")).status).toBe(400);
    expect((await request(app).get("/api/search?q=kav")).status).toBe(401);
  });

  test("dashboard includes schools, attendance and fee totals, and filters by school", async () => {
    const s = await add();
    await agent.put(`/api/students/${s.id}/attendance/2026-11-02`).send({ status: "present" });
    const inv = await agent.post(`/api/students/${s.id}/fees`).send({ academicYear: "2026-2027", title: "Fee", amount: 1000, dueDate: "2026-06-01" });
    await agent.post(`/api/students/${s.id}/fees/${inv.body.data.id}/payments`).send({ amount: 400, method: "cash" });
    const d = (await agent.get("/api/dashboard")).body.data;
    expect(d.studentsBySchool).toEqual([{ id: schoolId(), name: "Test School", code: "TS", active: true, count: 1 }]);
    expect(d.attendance).toMatchObject({ date: "2026-11-02", marked: 1, present: 1, percentage: 100 });
    expect(d.fees).toEqual({ billed: 1000, collected: 400, outstanding: 600, overdue: 600, overdueInvoices: 1 });
    const other = await createSchool({ name: "Second", code: "SEC" });
    const scoped = (await agent.get(`/api/dashboard?school=${other}`)).body.data;
    expect(scoped.totalStudents).toBe(0);
    expect(scoped.fees.billed).toBe(0);
    expect((await agent.get("/api/dashboard?school=bad")).status).toBe(400);
  });
});
