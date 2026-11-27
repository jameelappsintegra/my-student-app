// Student logins, homework submissions, school settings, transport,
// library and certificates.
const request = require("supertest");
const { createApp } = require("../../src/app");
const Student = require("../../src/models/Student");
const BookIssue = require("../../src/models/BookIssue");
const { startDb, clearDb, stopDb } = require("./setup");
const { signIn, schoolId, createSchool } = require("./helpers");

const app = createApp({ loginLimit: 100000, rateLimit: 100000 });
jest.setTimeout(60000);
beforeAll(startDb);
afterEach(clearDb);
afterAll(stopDb);

const PW = "a long enough passphrase";
const YEAR = "2026-2027";
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
let admin, other, A, B, C, Z, teacher, principal, otherPrincipal, parent, otherParent, student, studentB;
const login = async (username, password = PW) => {
  const a = request.agent(app);
  const r = await a.post("/api/auth/login").send({ username, password });
  if (r.status !== 200) throw new Error(`login ${username}: ${r.body.message}`);
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
      school: schoolId(), firstName: `Kid${n}`, lastName: "Campus", dateOfBirth: `2016-05-${String(n).padStart(2, "0")}`, gender: "female",
      address: "1 Road", className: "7", section: "A", rollNumber: n, academicYear: YEAR, father: { name: `Father${n}`, phone: "9876543210" }, ...o,
    });
    if (r.status !== 201) throw new Error(r.body.message);
    return r.body.data;
  };
  A = await add();
  B = await add({ section: "B" });
  C = await add();
  Z = await add({ school: other, rollNumber: undefined });
  const mk = (b) => admin.post("/api/users").send({ password: PW, ...b });
  await mk({ username: "teach1", role: "teacher", name: "Teach One", assignments: [{ school: schoolId(), className: "7", section: "A" }] });
  await mk({ username: "head1", role: "principal", name: "Head One", schools: [schoolId()] });
  await mk({ username: "head2", role: "principal", name: "Head Two", schools: [other] });
  await mk({ username: "parent1", role: "parent", name: "Parent One", children: [A.id] });
  await mk({ username: "parent2", role: "parent", name: "Parent Two", children: [Z.id] });
  const s = await mk({ username: "kid1", role: "student", name: "Kid1 Campus", student: A.id });
  expect(s.status).toBe(201);
  await mk({ username: "kid2", role: "student", name: "Kid2 Campus", student: B.id });
  [teacher, principal, otherPrincipal, parent, otherParent, student, studentB] = await Promise.all(["teach1", "head1", "head2", "parent1", "parent2", "kid1", "kid2"].map((u) => login(u)));
});

describe("student logins", () => {
  test("a student account is linked to exactly one student record", async () => {
    expect((await admin.post("/api/users").send({ username: "nolink", password: PW, role: "student", name: "X" })).status).toBe(400);
    expect((await admin.post("/api/users").send({ username: "dupe", password: PW, role: "student", name: "X", student: A.id })).status).toBe(409);
    expect((await admin.post("/api/users").send({ username: "wrong", password: PW, role: "teacher", name: "X", student: A.id })).status).toBe(400);
    const me = (await student.get("/api/auth/me")).body.data.user;
    expect(me).toMatchObject({ role: "student", student: A.id });
    expect(me.permissions).toEqual(expect.arrayContaining(["students.view", "homework.submit"]));
  });

  test("a student sees only their own record, and only published results", async () => {
    const list = (await student.get("/api/students")).body.data;
    expect(list.map((s) => s.id)).toEqual([A.id]);
    expect((await student.get(`/api/students/${C.id}`)).status).toBe(404);
    expect((await student.get(`/api/students/${A.id}/fees`)).status).toBe(403);
    expect((await student.put(`/api/students/${A.id}`).send({ firstName: "Hack" })).status).toBe(403);
    await teacher.post(`/api/students/${A.id}/results`).send({ academicYear: YEAR, exam: "Term 1", subjects: [{ subject: "Maths", maxMarks: 100, marks: 75 }] });
    expect((await student.get(`/api/students/${A.id}/results`)).body.data).toEqual([]);
    await principal.post("/api/results/publish").send({ school: schoolId(), className: "7", section: "A", academicYear: YEAR, exam: "Term 1" });
    expect((await student.get(`/api/students/${A.id}/results`)).body.data[0]).toMatchObject({ exam: "Term 1", percentage: 75 });
    expect((await unread(student)).items[0]).toMatchObject({ type: "result" });
    expect((await student.get("/api/me/children")).body.data.map((k) => k.id)).toEqual([A.id]);
  });

  test("announcements for students reach students, not parents", async () => {
    await principal.post("/api/announcements").send({ title: "Quiz club", body: "Join on Friday", school: schoolId(), audience: "students" });
    expect((await student.get("/api/announcements")).body.data.map((a) => a.title)).toEqual(["Quiz club"]);
    expect((await parent.get("/api/announcements")).body.data).toEqual([]);
  });

  test("admin creates logins for a whole class at once", async () => {
    const r = await admin.post("/api/users/student-logins").send({ school: schoolId(), className: "7", section: "A" });
    expect(r.status).toBe(201);
    // A already has one (kid1); C gets a new login.
    expect(r.body.data.created).toHaveLength(1);
    expect(r.body.data.skipped).toBe(1);
    const { username, password, name } = r.body.data.created[0];
    expect(name).toBe("Kid3 Campus");
    expect(password).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
    const agent = await login(username, password);
    expect((await agent.get("/api/students")).body.data.map((s) => s.id)).toEqual([C.id]);
    expect((await admin.post("/api/users/student-logins").send({ school: schoolId(), className: "7", section: "A" })).body.data.created).toEqual([]);
    expect((await principal.post("/api/users/student-logins").send({ school: schoolId(), className: "7" })).status).toBe(403);
  });
});

describe("homework submissions", () => {
  const post = (body = {}) => teacher.post("/api/homework").send({ school: schoolId(), className: "7", section: "A", subject: "Science", title: "Plant cells", dueDate: iso(Date.now() + 3 * DAY), onlineSubmission: true, maxMarks: 10, ...body });

  test("student hands in; teacher sees the roster, marks it; family is told", async () => {
    const hw = (await post()).body.data;
    expect((await studentB.put(`/api/homework/${hw.id}/submission`).send({ text: "x" })).status).toBe(404);
    expect((await parent.put(`/api/homework/${hw.id}/submission`).send({ text: "x" })).status).toBe(403);
    expect((await student.put(`/api/homework/${hw.id}/submission`).send({})).status).toBe(400);
    expect((await student.put(`/api/homework/${hw.id}/submission`).send({ link: "javascript:alert(1)" })).status).toBe(400);
    const sub = await student.put(`/api/homework/${hw.id}/submission`).send({ text: "Cells have a wall and chloroplasts.", link: "https://example.com/my-diagram" });
    expect(sub.status).toBe(201);
    expect(sub.body.data).toMatchObject({ status: "submitted", late: false });
    expect((await unread(teacher)).items[0].title).toBe("Submitted: Plant cells");

    const mine = (await student.get("/api/homework")).body.data[0];
    expect(mine.submissions[0]).toMatchObject({ status: "submitted" });
    expect((await parent.get("/api/homework")).body.data[0].submissions).toHaveLength(1);
    expect((await teacher.get("/api/homework")).body.data[0].submissionCounts).toEqual({ submitted: 1, graded: 0 });

    const roster = (await teacher.get(`/api/homework/${hw.id}/submissions`)).body.data;
    expect(roster.summary).toEqual({ students: 2, submitted: 1, late: 0, graded: 0, missing: 1 });
    expect(roster.rows.find((r) => r.student.id === C.id).submission).toBeNull();

    const sid = sub.body.data.id;
    expect((await teacher.post(`/api/homework/${hw.id}/submissions/${sid}/review`).send({ action: "grade", marks: 11 })).status).toBe(400);
    expect((await teacher.post(`/api/homework/${hw.id}/submissions/${sid}/review`).send({ action: "grade" })).status).toBe(400);
    const g = await teacher.post(`/api/homework/${hw.id}/submissions/${sid}/review`).send({ action: "grade", marks: 9, feedback: "Good diagram" });
    expect(g.status).toBe(200);
    expect((await unread(parent)).items[0]).toMatchObject({ title: "Marked: Plant cells", body: "9/10. Good diagram" });
    expect((await unread(student)).items[0].title).toBe("Marked: Plant cells");
    expect((await student.put(`/api/homework/${hw.id}/submission`).send({ text: "change" })).status).toBe(409);
  });

  test("returned work can be handed in again; paper homework can't be submitted", async () => {
    const hw = (await post()).body.data;
    const sid = (await student.put(`/api/homework/${hw.id}/submission`).send({ text: "draft" })).body.data.id;
    expect((await teacher.post(`/api/homework/${hw.id}/submissions/${sid}/review`).send({ action: "return" })).status).toBe(400);
    await teacher.post(`/api/homework/${hw.id}/submissions/${sid}/review`).send({ action: "return", feedback: "Add a labelled diagram" });
    const again = await student.put(`/api/homework/${hw.id}/submission`).send({ text: "with diagram" });
    expect(again.status).toBe(200);
    expect(again.body.data.status).toBe("submitted");
    const paper = (await post({ onlineSubmission: false, title: "Notebook work" })).body.data;
    expect((await student.put(`/api/homework/${paper.id}/submission`).send({ text: "x" })).status).toBe(400);
  });

  test("late work is flagged, or refused when the school doesn't allow it", async () => {
    const hw = (await post({ dueDate: iso(Date.now() - 2 * DAY) })).body.data;
    const r = await student.put(`/api/homework/${hw.id}/submission`).send({ text: "sorry, late" });
    expect(r.body.data.late).toBe(true);
    await principal.put(`/api/schools/${schoolId()}/settings`).send({ homework: { allowLate: false } });
    const hw2 = (await post({ dueDate: iso(Date.now() - 2 * DAY), title: "Older" })).body.data;
    expect((await student.put(`/api/homework/${hw2.id}/submission`).send({ text: "late" })).status).toBe(400);
  });
});

describe("school settings and calendar", () => {
  test("who can read and change settings", async () => {
    const s = (await parent.get(`/api/schools/${schoolId()}/settings`)).body.data.settings;
    expect(s).toMatchObject({ currency: "INR", timezone: "Asia/Kolkata", academicYearStartMonth: 4, passPercentage: 33 });
    expect((await otherParent.get(`/api/schools/${schoolId()}/settings`)).status).toBe(404);
    expect((await teacher.put(`/api/schools/${schoolId()}/settings`).send({ currency: "USD" })).status).toBe(403);
    expect((await otherPrincipal.put(`/api/schools/${schoolId()}/settings`).send({ currency: "USD" })).status).toBe(404);
    expect((await principal.put(`/api/schools/${schoolId()}/settings`).send({ timezone: "Mars/Olympus" })).status).toBe(400);
    expect((await principal.put(`/api/schools/${schoolId()}/settings`).send({ currency: "XYZ1" })).status).toBe(400);
    expect((await principal.put(`/api/schools/${schoolId()}/settings`).send({ gradingScale: [{ min: 50, grade: "P" }, { min: 40, grade: "F" }] })).status).toBe(400);
    expect((await principal.put(`/api/schools/${schoolId()}/settings`).send({ holidays: [{ date: "2026-02-30", name: "Nope" }] })).status).toBe(400);
    const ok = await principal.put(`/api/schools/${schoolId()}/settings`).send({ currency: "USD", locale: "en-US", timezone: "America/New_York", weeklyOffs: [0, 6] });
    expect(ok.status).toBe(200);
    expect(ok.body.data.settings).toMatchObject({ currency: "USD", timezone: "America/New_York", weeklyOffs: [0, 6], passPercentage: 33 });
    // Other schools keep their own settings.
    expect((await admin.get(`/api/schools/${other}/settings`)).body.data.settings.currency).toBe("INR");
  });

  test("the school's grading scale and pass mark are used for results and reports", async () => {
    const put = await principal.put(`/api/schools/${schoolId()}/settings`).send({ passPercentage: 40, gradingScale: [{ min: 80, grade: "Distinction" }, { min: 60, grade: "First" }, { min: 40, grade: "Pass" }, { min: 0, grade: "Fail" }] });
    expect(put.body.message).toBe("Test School settings saved");
    const r = await teacher.post(`/api/students/${A.id}/results`).send({ academicYear: YEAR, exam: "Term 1", subjects: [{ subject: "Maths", maxMarks: 100, marks: 65 }, { subject: "Art", maxMarks: 100, marks: 35 }] });
    expect(r.body.data).toMatchObject({ grade: "Pass", passed: false });
    expect(r.body.data.subjects.map((s) => s.grade)).toEqual(["First", "Fail"]);
    const card = (await principal.get(`/api/students/${A.id}/report-card`)).body.data;
    expect(card.grading.passPercentage).toBe(40);
    const rep = (await principal.get(`/api/reports/exam-performance?school=${schoolId()}`)).body.data;
    expect(rep.rows[0]).toMatchObject({ averageGrade: "Pass", passRate: 0 });
  });

  test("currency shows in fee messages; holidays drive leave and the register", async () => {
    await principal.put(`/api/schools/${schoolId()}/settings`).send({ currency: "USD", locale: "en-US" });
    const inv = (await admin.post(`/api/students/${A.id}/fees`).send({ academicYear: YEAR, title: "Term fee", amount: 500, dueDate: "2026-12-31" })).body.data;
    expect((await admin.get(`/api/students/${A.id}/fees`)).body.data.summary.currency).toBe("USD");
    const over = await admin.post(`/api/students/${A.id}/fees/${inv.id}/payments`).send({ amount: 600, method: "cash" });
    expect(over.body.message).toBe("The payment is more than the $500 still due.");

    // Leave over Mon–Wed where Tuesday is a holiday: only Mon and Wed marked.
    const mon = new Date(Date.now() + 7 * DAY);
    while (mon.getUTCDay() !== 1) mon.setTime(mon.getTime() + DAY);
    const tue = iso(mon.getTime() + DAY);
    const past = iso(Date.now() - 2 * DAY);
    await principal.put(`/api/schools/${schoolId()}/settings`).send({ holidays: [{ date: tue, name: "Founders' Day" }, { date: past, name: "Local festival" }] });
    const lr = (await parent.post("/api/leave").send({ student: A.id, from: iso(mon), to: iso(mon.getTime() + 2 * DAY), reason: "Family wedding" })).body.data;
    const d = await teacher.post(`/api/leave/${lr.id}/decision`).send({ approve: true });
    expect(d.body.message).toBe("Leave approved; 2 school days marked as leave.");
    const reg = (await teacher.get(`/api/attendance/register?school=${schoolId()}&className=7&section=A&date=${past}`)).body.data;
    expect(reg.offDay).toBe("Local festival");

    const cal = (await student.get(`/api/schools/${schoolId()}/calendar?from=${iso(mon)}&to=${iso(mon.getTime() + 6 * DAY)}`)).body.data;
    expect(cal.holidays).toEqual([{ date: tue, name: "Founders' Day" }]);
    expect((await otherParent.get(`/api/schools/${schoolId()}/calendar`)).status).toBe(404);
  });
});

describe("transport", () => {
  const route = (o = {}) => ({ school: schoolId(), name: "Route 1", vehicleNumber: "ka-01-ab-1234", driverName: "Ravi", driverPhone: "9876500000", capacity: 1, stops: [{ name: "Market", pickupTime: "07:10", fee: 3000 }, { name: "Temple", pickupTime: "07:25" }], ...o });

  test("principal sets up a route; capacity is enforced; family sees the bus", async () => {
    expect((await teacher.post("/api/transport/routes").send(route())).status).toBe(403);
    expect((await otherPrincipal.post("/api/transport/routes").send(route())).status).toBe(404);
    expect((await principal.post("/api/transport/routes").send(route({ stops: [{ name: "A" }, { name: "a" }] }))).status).toBe(400);
    const r = (await principal.post("/api/transport/routes").send(route())).body.data;
    expect(r.vehicleNumber).toBe("KA-01-AB-1234");
    expect((await principal.post("/api/transport/routes").send(route())).status).toBe(409);
    expect((await principal.put("/api/transport/assign").send({ student: A.id, route: r.id, stop: "Nowhere" })).status).toBe(400);
    expect((await principal.put("/api/transport/assign").send({ student: A.id, route: r.id, stop: "Temple" })).status).toBe(200);
    expect((await principal.put("/api/transport/assign").send({ student: C.id, route: r.id, stop: "Market" })).status).toBe(409);
    expect((await principal.put("/api/transport/assign").send({ student: Z.id, route: r.id, stop: "Market" })).status).toBe(404);
    expect((await unread(parent)).items[0]).toMatchObject({ type: "transport", body: "Kid1 boards at Temple at 07:25." });

    const riders = (await teacher.get(`/api/transport/routes/${r.id}/riders`)).body.data.riders;
    expect(riders).toEqual([expect.objectContaining({ name: "Kid1 Campus", stop: "Temple", contact: "9876543210" })]);
    expect((await principal.get("/api/transport/routes")).body.data[0].riders).toBe(1);
    expect((await parent.get("/api/transport/routes")).status).toBe(403);

    const svc = (await parent.get(`/api/students/${A.id}/services`)).body.data;
    expect(svc.transport).toMatchObject({ route: { name: "Route 1", driverPhone: "9876500000" }, stop: { name: "Temple", pickupTime: "07:25" } });
    expect((await Student.findById(A.id).lean())).toMatchObject({ transport: "school_bus", busRoute: "Route 1" });

    expect((await principal.put(`/api/transport/routes/${r.id}`).send(route({ stops: [{ name: "Market" }] }))).status).toBe(400);
    expect((await principal.delete(`/api/transport/routes/${r.id}`)).status).toBe(409);
    await principal.put("/api/transport/assign").send({ student: A.id, route: null });
    expect((await principal.delete(`/api/transport/routes/${r.id}`)).status).toBe(200);
  });

  test("admin can let a teacher manage transport", async () => {
    const u = (await admin.get("/api/users?search=teach1")).body.data[0];
    expect((await admin.put(`/api/users/${u.id}`).send({ grants: ["transport.manage"] })).status).toBe(200);
    expect((await teacher.post("/api/transport/routes").send(route())).status).toBe(201);
  });
});

describe("library", () => {
  const book = (o = {}) => ({ school: schoolId(), title: "Wings of Fire", author: "A. P. J. Abdul Kalam", isbn: "978-8173711466", copies: 1, ...o });

  test("lend, run out of copies, return late with a fine", async () => {
    expect((await teacher.post("/api/library/books").send(book())).status).toBe(403);
    const b = (await principal.post("/api/library/books").send(book())).body.data;
    expect(b.available).toBe(1);
    // Students browse their own school's catalogue only.
    expect((await student.get("/api/library/books?search=wings")).body.data).toHaveLength(1);
    expect((await otherParent.get("/api/library/books")).body.data).toEqual([]);
    expect((await student.get("/api/library/issues")).status).toBe(403);

    const i = await principal.post("/api/library/issues").send({ book: b.id, student: A.id });
    expect(i.status).toBe(201);
    expect((await principal.get("/api/library/books")).body.data[0].available).toBe(0);
    expect((await principal.post("/api/library/issues").send({ book: b.id, student: C.id })).body.message).toBe("No copies are available right now.");
    expect((await principal.post("/api/library/issues").send({ book: b.id, student: Z.id })).status).toBe(400);
    expect((await principal.put(`/api/library/books/${b.id}`).send(book({ copies: 0 }))).status).toBe(400);

    // Make the loan 5 days overdue.
    await BookIssue.updateOne({ _id: i.body.data.id }, { $set: { dueAt: new Date(Date.now() - 5 * DAY) } });
    const overdue = (await principal.get("/api/library/issues?status=overdue")).body.data;
    expect(overdue).toEqual([expect.objectContaining({ overdue: true, student: expect.objectContaining({ name: "Kid1 Campus" }) })]);
    await principal.put(`/api/schools/${schoolId()}/settings`).send({ library: { finePerDay: 5 } });
    const ret = await principal.post(`/api/library/issues/${i.body.data.id}/return`).send({});
    expect(ret.body.data).toMatchObject({ fine: 25, fineStatus: "due" });
    expect(ret.body.message).toMatch(/^Returned 5 days late\. Fine ₹25(\.00)? is due\.$/);
    expect((await principal.post(`/api/library/issues/${i.body.data.id}/return`).send({})).status).toBe(409);
    expect((await principal.get("/api/library/books")).body.data[0].available).toBe(1);

    // No new loans until the fine is settled.
    expect((await principal.post("/api/library/issues").send({ book: b.id, student: A.id })).status).toBe(409);
    expect((await principal.post(`/api/library/issues/${i.body.data.id}/fine`).send({ action: "collect" })).body.data.fineStatus).toBe("paid");
    expect((await principal.post("/api/library/issues").send({ book: b.id, student: A.id })).status).toBe(201);
    const svc = (await student.get(`/api/students/${A.id}/services`)).body.data;
    expect(svc.library).toHaveLength(2);
  });

  test("the school's limit on books per student applies", async () => {
    await principal.put(`/api/schools/${schoolId()}/settings`).send({ library: { maxBooks: 1 } });
    const b1 = (await principal.post("/api/library/books").send(book())).body.data;
    const b2 = (await principal.post("/api/library/books").send(book({ title: "Malgudi Days", isbn: undefined }))).body.data;
    await principal.post("/api/library/issues").send({ book: b1.id, student: A.id });
    const r = await principal.post("/api/library/issues").send({ book: b2.id, student: A.id });
    expect(r.status).toBe(409);
    expect(r.body.message).toBe("Kid1 already has 1 books out (the limit is 1).");
  });
});

describe("certificates", () => {
  test("bonafide needs a purpose; family can view their own; public verification", async () => {
    expect((await teacher.post("/api/certificates").send({ student: A.id, type: "bonafide", purpose: "Passport" })).status).toBe(403);
    expect((await principal.post("/api/certificates").send({ student: A.id, type: "bonafide" })).status).toBe(400);
    expect((await otherPrincipal.post("/api/certificates").send({ student: A.id, type: "bonafide", purpose: "Passport" })).status).toBe(404);
    const c = (await principal.post("/api/certificates").send({ student: A.id, type: "bonafide", purpose: "Passport application" })).body.data;
    expect(c.serialNumber).toBe(`TS/BC/${new Date().getUTCFullYear()}/0001`);
    expect(c.snapshot).toMatchObject({ name: "Kid1 Campus", father: "Father1", className: "7" });
    expect((await parent.get(`/api/certificates/${c.id}`)).body.data).toMatchObject({ label: "Bonafide certificate", school: { name: "Test School" } });
    expect((await student.get(`/api/certificates/${c.id}`)).status).toBe(200);
    expect((await otherParent.get(`/api/certificates/${c.id}`)).status).toBe(404);
    expect((await otherPrincipal.get(`/api/certificates/${c.id}`)).status).toBe(404);
    expect((await unread(parent)).items[0].type).toBe("certificate");

    const pub = await request(app).get(`/api/certificates/verify/${c.verificationCode}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data).toMatchObject({ valid: true, name: "Kid1 Campus", school: "Test School", type: "Bonafide certificate" });
    expect(pub.body.data.snapshot).toBeUndefined();
    expect((await request(app).get("/api/certificates/verify/000000000000")).status).toBe(404);
  });

  test("TC checks dues, takes the student off the roll, and cancelling restores them", async () => {
    await admin.post(`/api/students/${A.id}/fees`).send({ academicYear: YEAR, title: "Term fee", amount: 1200, dueDate: "2026-12-31" });
    const blocked = await principal.post("/api/certificates").send({ student: A.id, type: "transfer", reason: "Family moving to Chennai" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/^₹1,200(\.00)? in fees is still due/);
    expect((await principal.post("/api/certificates").send({ student: A.id, type: "transfer" })).status).toBe(400);
    const tc = await principal.post("/api/certificates").send({ student: A.id, type: "transfer", reason: "Family moving to Chennai", ignoreDues: true, conduct: "Very good" });
    expect(tc.status).toBe(201);
    expect(tc.body.data).toMatchObject({ duesCleared: false, conduct: "Very good" });
    expect((await Student.findById(A.id).lean()).status).toBe("transferred");
    expect((await principal.post("/api/certificates").send({ student: A.id, type: "transfer", reason: "Again", ignoreDues: true })).status).toBe(409);
    expect((await principal.post("/api/certificates").send({ student: A.id, type: "bonafide", purpose: "x" })).status).toBe(400);
    expect((await principal.get("/api/certificates?type=transfer")).body.data).toHaveLength(1);

    const cancel = await principal.post(`/api/certificates/${tc.body.data.id}/cancel`).send({ reason: "Family decided to stay" });
    expect(cancel.body.message).toMatch(/back on the roll/);
    expect((await Student.findById(A.id).lean()).status).toBe("active");
    const pub = await request(app).get(`/api/certificates/verify/${tc.body.data.verificationCode}`);
    expect(pub.body.data).toMatchObject({ valid: false, status: "cancelled" });
  });
});
