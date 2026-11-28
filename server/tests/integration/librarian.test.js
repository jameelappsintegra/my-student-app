// Librarian accounts, reservations, renewals, reminders, book import and
// the library dashboard.
const request = require("supertest");
const { createApp } = require("../../src/app");
const BookIssue = require("../../src/models/BookIssue");
const { todayIn } = require("../../src/services/schoolSettings");
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
let admin, other, A, B, C, Z, librarian, otherLibrarian, parent, studentA, studentB, teacher;
const login = async (username) => {
  const a = request.agent(app);
  const r = await a.post("/api/auth/login").send({ username, password: PW });
  if (r.status !== 200) throw new Error(`${username}: ${r.body.message}`);
  return a;
};
const unread = async (agent) => (await agent.get("/api/notifications?unread=true")).body.data;
const localDaysAgo = (n) => new Date(new Date(`${todayIn("Asia/Kolkata")}T00:00:00.000Z`).getTime() - n * DAY);

beforeEach(async () => {
  admin = await signIn(app);
  other = await createSchool({ name: "Other School", code: "OTH" });
  const add = async (n, o = {}) => (await admin.post("/api/students").send({
    school: schoolId(), firstName: `Reader${n}`, lastName: "Lib", dateOfBirth: `2014-06-0${n}`, gender: "female",
    address: "1 Road", className: "8", section: "A", rollNumber: n, academicYear: YEAR, father: { name: "F", phone: "9876543210" }, ...o,
  })).body.data;
  A = await add(1);
  B = await add(2);
  C = await add(3, { className: "4" });
  Z = await add(4, { school: other, rollNumber: undefined });
  const mk = (b) => admin.post("/api/users").send({ password: PW, ...b });
  expect((await mk({ username: "lib.nolink", role: "librarian", name: "X" })).status).toBe(400);
  expect((await mk({ username: "librarian1", role: "librarian", name: "Lata Librarian", schools: [schoolId()] })).status).toBe(201);
  await mk({ username: "librarian2", role: "librarian", name: "Other Librarian", schools: [other] });
  await mk({ username: "parent1", role: "parent", name: "P", children: [A.id] });
  await mk({ username: "kid1", role: "student", name: "Reader1 Lib", student: A.id });
  await mk({ username: "kid2", role: "student", name: "Reader2 Lib", student: B.id });
  await mk({ username: "teach1", role: "teacher", name: "T", assignments: [{ school: schoolId(), className: "8", section: "A" }] });
  [librarian, otherLibrarian, parent, studentA, studentB, teacher] = await Promise.all(["librarian1", "librarian2", "parent1", "kid1", "kid2", "teach1"].map(login));
});

const addBook = (o = {}) => librarian.post("/api/library/books").send({ school: schoolId(), title: "Wings of Fire", author: "A. P. J. Abdul Kalam", copies: 1, ...o });

describe("librarian account", () => {
  test("finds any student in their school to lend, but can't open records or other schools", async () => {
    const me = (await librarian.get("/api/auth/me")).body.data.user;
    expect(me.permissions).toEqual(["library.manage", "students.search", "schools.view"]);
    // Search covers the whole school, not just one class.
    const found = (await librarian.get("/api/search?q=Reader")).body.data.map((s) => s.id).sort();
    expect(found).toEqual([A.id, B.id, C.id].sort());
    expect((await librarian.get(`/api/students/${A.id}`)).status).toBe(403);
    expect((await librarian.get(`/api/students/${A.id}/fees`)).status).toBe(403);
    expect((await librarian.get("/api/schools")).body.data.map((s) => s.id)).toEqual([schoolId()]);
    expect((await librarian.post("/api/library/books").send({ school: other, title: "X", copies: 1 })).status).toBe(404);
    const b = (await addBook()).body.data;
    expect((await librarian.post("/api/library/issues").send({ book: b.id, student: C.id })).status).toBe(201);
    expect((await otherLibrarian.get("/api/library/issues")).body.data).toEqual([]);
    expect((await otherLibrarian.post("/api/library/issues").send({ book: b.id, student: A.id })).status).toBe(404);
  });
});

describe("reservations", () => {
  test("queue for a book that's out; the returned copy is kept for the first in line", async () => {
    const b = (await addBook()).body.data;
    // On the shelf: no reservation needed.
    expect((await studentA.post(`/api/library/books/${b.id}/reserve`).send({})).status).toBe(400);
    const loan = (await librarian.post("/api/library/issues").send({ book: b.id, student: C.id })).body.data;
    const r1 = await studentA.post(`/api/library/books/${b.id}/reserve`).send({});
    expect(r1.status).toBe(201);
    expect(r1.body.message).toMatch(/number 1 in the queue/);
    expect((await studentA.post(`/api/library/books/${b.id}/reserve`).send({})).status).toBe(409);
    expect((await parent.post(`/api/library/books/${b.id}/reserve`).send({ student: B.id })).status).toBe(404);
    const r2 = await librarian.post(`/api/library/books/${b.id}/reserve`).send({ student: B.id });
    expect(r2.body.data.place).toBe(2);
    expect((await teacher.post(`/api/library/books/${b.id}/reserve`).send({ student: B.id })).status).toBe(403);

    const cat = (await studentA.get("/api/library/books")).body.data[0];
    expect(cat).toMatchObject({ available: 0, waiting: 2, myReservation: { status: "waiting" } });

    // Can't renew while others wait.
    expect((await librarian.post(`/api/library/issues/${loan.id}/renew`).send({})).status).toBe(409);

    const ret = await librarian.post(`/api/library/issues/${loan.id}/return`).send({});
    expect(ret.body.message).toMatch(/reserved for the next student/);
    expect((await unread(studentA)).items[0]).toMatchObject({ type: "library", title: "Ready to collect: Wings of Fire" });
    expect((await unread(parent)).items[0].title).toBe("Ready to collect: Wings of Fire");
    expect((await studentA.get("/api/library/books")).body.data[0]).toMatchObject({ available: 0, onHold: 1 });

    // The held copy can only go to A.
    expect((await librarian.post("/api/library/issues").send({ book: b.id, student: B.id })).body.message).toBe("The free copies are kept for students who reserved this book.");
    expect((await librarian.post("/api/library/issues").send({ book: b.id, student: A.id })).status).toBe(201);
    const left = (await librarian.get(`/api/library/reservations?school=${schoolId()}`)).body.data;
    expect(left).toEqual([expect.objectContaining({ status: "waiting", student: expect.objectContaining({ id: B.id }) })]);
    expect((await studentB.get("/api/library/reservations")).body.data).toHaveLength(1);
    expect((await studentA.get("/api/library/reservations")).body.data).toHaveLength(0);
  });

  test("cancelling a ready hold passes the copy to the next in line", async () => {
    const b = (await addBook()).body.data;
    const loan = (await librarian.post("/api/library/issues").send({ book: b.id, student: C.id })).body.data;
    const r1 = (await studentA.post(`/api/library/books/${b.id}/reserve`).send({})).body.data;
    await studentB.post(`/api/library/books/${b.id}/reserve`).send({});
    await librarian.post(`/api/library/issues/${loan.id}/return`).send({});
    expect((await studentB.delete(`/api/library/reservations/${r1.id}`)).status).toBe(404);
    expect((await studentA.delete(`/api/library/reservations/${r1.id}`)).status).toBe(200);
    expect((await unread(studentB)).items[0].title).toBe("Ready to collect: Wings of Fire");
    expect((await librarian.post("/api/library/issues").send({ book: b.id, student: B.id })).status).toBe(201);
  });
});

describe("renewals and reminders", () => {
  test("renew up to twice; not when overdue", async () => {
    const b = (await addBook()).body.data;
    const loan = (await librarian.post("/api/library/issues").send({ book: b.id, student: A.id })).body.data;
    const r = await librarian.post(`/api/library/issues/${loan.id}/renew`).send({});
    expect(r.status).toBe(200);
    expect(new Date(r.body.data.dueAt) - new Date(loan.dueAt)).toBe(14 * DAY);
    expect((await librarian.post(`/api/library/issues/${loan.id}/renew`).send({})).status).toBe(200);
    expect((await librarian.post(`/api/library/issues/${loan.id}/renew`).send({})).body.message).toBe("A loan can be renewed at most 2 times.");
    await BookIssue.updateOne({ _id: loan.id }, { $set: { dueAt: localDaysAgo(3), renewals: 0 } });
    expect((await librarian.post(`/api/library/issues/${loan.id}/renew`).send({})).status).toBe(400);
  });

  test("overdue reminders reach the family; bulk skips those reminded recently", async () => {
    const b1 = (await addBook()).body.data;
    const b2 = (await addBook({ title: "Malgudi Days", author: "R. K. Narayan" })).body.data;
    const l1 = (await librarian.post("/api/library/issues").send({ book: b1.id, student: A.id })).body.data;
    const l2 = (await librarian.post("/api/library/issues").send({ book: b2.id, student: B.id })).body.data;
    expect((await librarian.post(`/api/library/issues/${l1.id}/remind`).send({})).status).toBe(400);
    await BookIssue.updateMany({ _id: { $in: [l1.id, l2.id] } }, { $set: { dueAt: localDaysAgo(4) } });
    const one = await librarian.post(`/api/library/issues/${l1.id}/remind`).send({});
    expect(one.body.message).toBe("Reminder sent to 2 family accounts.");
    expect((await unread(parent)).items[0]).toMatchObject({ title: "Library book overdue: Wings of Fire" });
    expect((await unread(parent)).items[0].body).toMatch(/4 days late\)\. Fine so far ₹8/);
    const bulk = await librarian.post("/api/library/remind-overdue").send({ school: schoolId() });
    expect(bulk.body.data).toEqual({ loans: 1, sent: 1 });
    expect((await unread(studentB)).items[0].title).toBe("Library book overdue: Malgudi Days");
    expect((await otherLibrarian.post("/api/library/remind-overdue").send({ school: schoolId() })).status).toBe(404);
  });
});

describe("book import", () => {
  const csv = (text) => librarian.post("/api/library/books/import").set("X-Requested-With", "EduPro").field("school", schoolId()).attach("file", Buffer.from(text), "books.csv");

  test("dry run, row errors, then import that adds copies to matching books", async () => {
    await addBook({ isbn: "978-8173711466", copies: 2 });
    const bad = await csv("title,author,isbn,copies\n,Nobody,,1\nGood Book,Someone,,abc\n");
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e) => e.row)).toEqual([2, 3]);
    expect((await librarian.get("/api/library/books")).body.data).toHaveLength(1);
    const text = "Title,Author,ISBN,Category,Shelf,Copies\nWings of Fire,Kalam,9788173711466,Biography,B-2,3\nThe Jungle Book,Rudyard Kipling,,Fiction,A-1,\n";
    const dry = await librarian.post("/api/library/books/import?dryRun=true").set("X-Requested-With", "EduPro").field("school", schoolId()).attach("file", Buffer.from(text), "books.csv");
    expect(dry.body.data).toMatchObject({ rows: 2, newBooks: 1, addedCopiesTo: 1, copies: 4 });
    expect((await librarian.get("/api/library/books")).body.data).toHaveLength(1);
    const done = await csv(text);
    expect(done.status).toBe(201);
    const books = (await librarian.get("/api/library/books")).body.data;
    expect(books.map((b) => [b.title, b.copies])).toEqual([["The Jungle Book", 1], ["Wings of Fire", 5]]);
    expect((await teacher.post("/api/library/books/import").set("X-Requested-With", "EduPro").field("school", schoolId()).attach("file", Buffer.from(text), "b.csv")).status).toBe(403);
    expect((await librarian.get("/api/library/books/import/template")).text).toMatch(/^﻿title,author,isbn,category,publisher,shelf,copies/);
  });
});

describe("dashboard", () => {
  test("counts loans, overdue, fines this month and popular books", async () => {
    const b1 = (await addBook({ copies: 3 })).body.data;
    const b2 = (await addBook({ title: "Malgudi Days", copies: 2 })).body.data;
    const l1 = (await librarian.post("/api/library/issues").send({ book: b1.id, student: A.id })).body.data;
    await librarian.post("/api/library/issues").send({ book: b1.id, student: B.id });
    await librarian.post("/api/library/issues").send({ book: b2.id, student: C.id });
    await BookIssue.updateOne({ _id: l1.id }, { $set: { dueAt: localDaysAgo(5) } });
    await librarian.post(`/api/library/issues/${l1.id}/return`).send({ fine: "collect" });
    const d = (await librarian.get(`/api/library/dashboard?school=${schoolId()}`)).body.data;
    expect(d.books).toEqual({ titles: 2, copies: 5, onShelf: 3 });
    expect(d.loans).toMatchObject({ onLoan: 2, overdue: 0, thisMonth: 3, returnsThisMonth: 1 });
    expect(d.fines).toMatchObject({ due: 0, collectedThisMonth: 10, finePerDay: 2 });
    expect(d.popular[0]).toMatchObject({ title: "Wings of Fire", loans: 2 });
    expect((await teacher.get("/api/library/dashboard")).status).toBe(403);
  });
});
