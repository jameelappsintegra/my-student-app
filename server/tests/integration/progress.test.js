// Progress page, class insights and fee receipts.
const request = require("supertest");
const { createApp } = require("../../src/app");
const Attendance = require("../../src/models/Attendance");
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
let admin, other, A, B, Z, teacher, otherTeacher, principal, parent, student;
const login = async (username) => {
  const a = request.agent(app);
  const r = await a.post("/api/auth/login").send({ username, password: PW });
  if (r.status !== 200) throw new Error(r.body.message);
  return a;
};

beforeEach(async () => {
  admin = await signIn(app);
  other = await createSchool({ name: "Other School", code: "OTH" });
  const add = async (n, o = {}) => (await admin.post("/api/students").send({
    school: schoolId(), firstName: `Kid${n}`, lastName: "Prog", dateOfBirth: `2015-04-0${n}`, gender: "male",
    address: "1 Road", className: "6", section: "A", rollNumber: n, academicYear: YEAR, father: { name: "F", phone: "9876543210" }, ...o,
  })).body.data;
  A = await add(1);
  B = await add(2);
  Z = await add(3, { school: other, rollNumber: undefined });
  const mk = (b) => admin.post("/api/users").send({ password: PW, ...b });
  await mk({ username: "teach1", role: "teacher", name: "T", assignments: [{ school: schoolId(), className: "6", section: "A" }] });
  await mk({ username: "teach2", role: "teacher", name: "T2", assignments: [{ school: other, className: "6" }] });
  await mk({ username: "head1", role: "principal", name: "H", schools: [schoolId()] });
  await mk({ username: "parent1", role: "parent", name: "P", children: [A.id] });
  await mk({ username: "kid1", role: "student", name: "Kid1 Prog", student: A.id });
  [teacher, otherTeacher, principal, parent, student] = await Promise.all(["teach1", "teach2", "head1", "parent1", "kid1"].map(login));

  // Two exams: Term 1 published, Term 2 a draft.
  await teacher.post(`/api/students/${A.id}/results`).send({ academicYear: YEAR, exam: "Term 1", examDate: "2026-07-10", subjects: [{ subject: "Maths", maxMarks: 100, marks: 60 }, { subject: "English", maxMarks: 100, marks: 80 }] });
  await principal.post("/api/results/publish").send({ school: schoolId(), className: "6", section: "A", academicYear: YEAR, exam: "Term 1" });
  await teacher.post(`/api/students/${A.id}/results`).send({ academicYear: YEAR, exam: "Term 2", examDate: "2026-10-10", subjects: [{ subject: "Maths", maxMarks: 100, marks: 75 }, { subject: "English", maxMarks: 100, marks: 70 }] });
  await teacher.post(`/api/students/${B.id}/results`).send({ academicYear: YEAR, exam: "Term 1", examDate: "2026-07-10", subjects: [{ subject: "Maths", maxMarks: 100, marks: 20 }] });

  // Attendance: A present 3 days, absent 1; B absent 3 of 4.
  const days = [1, 2, 3, 4].map((n) => new Date(`${iso(Date.now() - n * DAY)}T00:00:00.000Z`));
  await Attendance.insertMany([
    ...days.map((d, i) => ({ student: A.id, school: schoolId(), date: d, status: i === 0 ? "absent" : "present" })),
    ...days.map((d, i) => ({ student: B.id, school: schoolId(), date: d, status: i === 0 ? "present" : "absent" })),
  ]);

  // Online homework: two past due (A hands in one), one upcoming.
  const hw = async (title, due) => (await teacher.post("/api/homework").send({ school: schoolId(), className: "6", section: "A", subject: "Science", title, dueDate: iso(due), onlineSubmission: true, maxMarks: 10 })).body.data;
  const h1 = await hw("Past one", Date.now() + DAY);
  await student.put(`/api/homework/${h1.id}/submission`).send({ text: "done" });
  const sub = (await teacher.get(`/api/homework/${h1.id}/submissions`)).body.data.rows.find((r) => r.student.id === A.id).submission;
  await teacher.post(`/api/homework/${h1.id}/submissions/${sub.id}/review`).send({ action: "grade", marks: 8 });
  await require("../../src/models/Homework").updateOne({ _id: h1.id }, { $set: { dueDate: new Date(Date.now() - 3 * DAY) } });
  const h2 = await hw("Past two", Date.now() + DAY);
  await require("../../src/models/Homework").updateOne({ _id: h2.id }, { $set: { dueDate: new Date(Date.now() - 2 * DAY) } });
  await hw("Upcoming", Date.now() + 5 * DAY);
});

describe("student progress", () => {
  test("parents and students see published exams only; staff see drafts too", async () => {
    const fam = (await parent.get(`/api/students/${A.id}/progress`)).body.data;
    expect(fam.results.exams.map((e) => e.exam)).toEqual(["Term 1"]);
    expect(fam.results.latest).toMatchObject({ exam: "Term 1", percentage: 70 });
    expect(fam.results.change).toBeNull();
    const mine = (await student.get(`/api/students/${A.id}/progress`)).body.data;
    expect(mine.results.exams).toHaveLength(1);
    const staff = (await teacher.get(`/api/students/${A.id}/progress`)).body.data;
    expect(staff.results.exams.map((e) => e.exam)).toEqual(["Term 1", "Term 2"]);
    expect(staff.results.change).toBe(2.5);
    expect(staff.results.subjects).toEqual([
      expect.objectContaining({ subject: "Maths", percentage: 75, previous: 60, change: 15 }),
      expect.objectContaining({ subject: "English", percentage: 70, previous: 80, change: -10 }),
    ]);
  });

  test("attendance by month, homework hand-in and fees for those who may see them", async () => {
    await admin.post(`/api/students/${A.id}/fees`).send({ academicYear: YEAR, title: "Term fee", amount: 900, dueDate: "2026-12-31" });
    const p = (await parent.get(`/api/students/${A.id}/progress`)).body.data;
    expect(p.attendance).toMatchObject({ percentage: 75, schoolDays: 4, absent: 1 });
    expect(p.attendance.monthly.reduce((a, m) => a + m.schoolDays, 0)).toBe(4);
    expect(p.homework.summary).toMatchObject({ online: 3, handedIn: 1, marked: 1, missing: 1, pending: 1, handInRate: 50, averageMarkPercent: 80 });
    expect(p.homework.recent.map((r) => r.status)).toEqual(["pending", "missing", "graded"]);
    expect(p.fees).toMatchObject({ balance: 900 });
    // Students don't see fees.
    expect((await student.get(`/api/students/${A.id}/progress`)).body.data.fees).toBeNull();
  });

  test("out of scope → 404", async () => {
    expect((await parent.get(`/api/students/${B.id}/progress`)).status).toBe(404);
    expect((await student.get(`/api/students/${B.id}/progress`)).status).toBe(404);
    expect((await otherTeacher.get(`/api/students/${A.id}/progress`)).status).toBe(404);
  });
});

describe("class insights", () => {
  test("teacher sees each student with flags; principal also sees fees", async () => {
    await admin.post(`/api/students/${B.id}/fees`).send({ academicYear: YEAR, title: "Term fee", amount: 500, dueDate: "2026-01-01" });
    const q = `school=${schoolId()}&className=6&section=A`;
    const t = (await teacher.get(`/api/insights/class?${q}`)).body.data;
    expect(t.summary).toMatchObject({ students: 2, averageAttendance: 50, needsAttention: 1, passRate: 50 });
    expect(t.summary.feesOverdue).toBeUndefined();
    const a = t.rows.find((r) => r.student.id === A.id);
    const b = t.rows.find((r) => r.student.id === B.id);
    expect(a).toMatchObject({ attendance: { percentage: 75 }, latestResult: { exam: "Term 2", status: "draft" }, homework: { due: 2, handedIn: 1 }, flags: [] });
    expect(b.flags).toEqual(["low_attendance", "failing", "missing_homework"]);
    expect(b.fees).toBeUndefined();
    expect(t.daily.length).toBe(4);
    const p = (await principal.get(`/api/insights/class?${q}`)).body.data;
    expect(p.rows.find((r) => r.student.id === B.id).flags).toContain("fees_overdue");
    expect(p.summary.feesOverdue).toBe(500);
  });

  test("only for an assigned class; families can't use it", async () => {
    expect((await teacher.get(`/api/insights/class?school=${schoolId()}&className=6&section=B`)).status).toBe(403);
    expect((await otherTeacher.get(`/api/insights/class?school=${schoolId()}&className=6&section=A`)).status).toBe(403);
    expect((await parent.get(`/api/insights/class?school=${schoolId()}&className=6&section=A`)).status).toBe(403);
    expect((await student.get(`/api/insights/class?school=${schoolId()}&className=6&section=A`)).status).toBe(403);
  });
});

describe("fee receipts", () => {
  test("parent gets a receipt for their child's payment; others can't", async () => {
    const inv = (await admin.post(`/api/students/${A.id}/fees`).send({ academicYear: YEAR, title: "Term fee", amount: 1000, dueDate: "2026-12-31" })).body.data;
    const paid = (await admin.post(`/api/students/${A.id}/fees/${inv.id}/payments`).send({ amount: 400, method: "upi", reference: "UPI123" })).body.data;
    const pay = paid.payments[0];
    const url = `/api/students/${A.id}/fees/${inv.id}/payments/${pay.id}/receipt`;
    const r = (await parent.get(url)).body.data;
    expect(r).toMatchObject({ receiptNumber: pay.receiptNumber, amount: 400, amountText: "₹400", method: "upi", reference: "UPI123", invoice: { title: "Term fee", balanceAfter: 600 }, student: { name: "Kid1 Prog" }, school: { name: "Test School" } });
    expect((await student.get(url)).status).toBe(403);
    expect((await teacher.get(url)).status).toBe(403);
    expect((await parent.get(`/api/students/${A.id}/fees/${inv.id}/payments/${"0".repeat(24)}/receipt`)).status).toBe(404);
  });
});
