const request = require("supertest");
const { createApp } = require("../../src/app");
const { startDb, clearDb, stopDb } = require("./setup");
const { signIn, validApplication } = require("./helpers");

const app = createApp();
jest.setTimeout(60000);

beforeAll(startDb);
let agent;
beforeEach(async () => {
  agent = await signIn(app);
});
afterEach(clearDb);
afterAll(stopDb);



async function approve(id) {
  await agent.patch(`/api/admissions/${id}/status`).send({ status: "under_review" });
  return agent.patch(`/api/admissions/${id}/status`).send({ status: "approved" });
}

describe("admissions", () => {
  test("creates a submitted application", async () => {
    const res = await agent.post("/api/admissions").send(validApplication());
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("submitted");
    expect(res.body.data.applicationNumber).toBe("APP-2026-00001");
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data._id).toBeUndefined();
    expect(res.body.data.dedupeKey).toBeUndefined();
  });

  test("rejects invalid input with field errors", async () => {
    const res = await agent
      .post("/api/admissions")
      .send({ ...validApplication(), firstName: "", classApplied: "99", father: {} , mother: {} });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(["firstName", "classApplied"]));
  });

  test("requires a parent contact number", async () => {
    const body = validApplication();
    body.father.phone = "";
    const res = await agent.post("/api/admissions").send(body);
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe("father.phone");
  });

  test("rejects unknown fields and operator injection", async () => {
    const res = await agent
      .post("/api/admissions")
      .send({ ...validApplication(), status: "enrolled" });
    expect(res.status).toBe(400);

    const list = await agent.get("/api/admissions?status[$ne]=x");
    expect(list.status).toBe(400);
  });

  test("blocks duplicate open applications", async () => {
    await agent.post("/api/admissions").send(validApplication());
    const dup = await agent
      .post("/api/admissions")
      .send({ ...validApplication(), firstName: "  aisha " });
    expect(dup.status).toBe(409);
  });

  test("enforces status transitions", async () => {
    const { body } = await agent.post("/api/admissions").send(validApplication());
    const res = await agent
      .patch(`/api/admissions/${body.data.id}/status`)
      .send({ status: "approved" });
    expect(res.status).toBe(400);
  });

  test("enrols an approved application into a student record", async () => {
    const { body } = await agent.post("/api/admissions").send(validApplication());
    const id = body.data.id;

    const early = await agent.post(`/api/admissions/${id}/enroll`).send({});
    expect(early.status).toBe(400);

    expect((await approve(id)).status).toBe(200);
    const res = await agent
      .post(`/api/admissions/${id}/enroll`)
      .send({ section: "a", rollNumber: 7 });
    expect(res.status).toBe(201);
    const { student, admission } = res.body.data;
    expect(student.admissionNumber).toBe("TS-2026-00001");
    expect(student.className).toBe("2");
    expect(student.section).toBe("A");
    expect(admission.status).toBe("enrolled");

    const again = await agent.post(`/api/admissions/${id}/enroll`).send({});
    expect(again.status).toBe(400);

    // The same child cannot apply again once enrolled.
    const reapply = await agent.post("/api/admissions").send(validApplication());
    expect(reapply.status).toBe(409);
  });

  test("a rejected child may re-apply", async () => {
    const { body } = await agent.post("/api/admissions").send(validApplication());
    await agent
      .patch(`/api/admissions/${body.data.id}/status`)
      .send({ status: "rejected", note: "Class full" });
    const res = await agent.post("/api/admissions").send(validApplication());
    expect(res.status).toBe(201);
  });

  test("lists with pagination and filters", async () => {
    await agent.post("/api/admissions").send(validApplication());
    await agent
      .post("/api/admissions")
      .send({ ...validApplication(), firstName: "Omar", classApplied: "5" });
    const res = await agent.get("/api/admissions?classApplied=5&limit=1");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].firstName).toBe("Omar");
    expect(res.body.pagination).toEqual({ page: 1, limit: 1, total: 1, totalPages: 1 });
  });
});

describe("students and dashboard", () => {
  async function enrolOne(overrides = {}) {
    const { body } = await agent
      .post("/api/admissions")
      .send({ ...validApplication(), ...overrides });
    await approve(body.data.id);
    const res = await agent.post(`/api/admissions/${body.data.id}/enroll`).send({ section: "B" });
    return res.body.data.student;
  }

  test("searches, updates, and soft-deletes students", async () => {
    const s = await enrolOne();
    await enrolOne({ firstName: "Omar" });

    const search = await agent.get("/api/students?search=oma");
    expect(search.body.data).toHaveLength(1);

    const upd = await agent.put(`/api/students/${s.id}`).send({ rollNumber: 3, medicalNotes: "Asthma" });
    expect(upd.status).toBe(200);
    expect(upd.body.data.rollNumber).toBe(3);
    expect(upd.body.data.medicalNotes).toBeUndefined();

    expect((await agent.delete(`/api/students/${s.id}`)).status).toBe(200);
    expect((await agent.get(`/api/students/${s.id}`)).status).toBe(404);
    const list = await agent.get("/api/students");
    expect(list.body.pagination.total).toBe(1);
  });

  test("dashboard reflects real data", async () => {
    await enrolOne();
    await agent.post("/api/admissions").send({ ...validApplication(), firstName: "Omar" });
    const res = await agent.get("/api/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.data.totalStudents).toBe(1);
    expect(res.body.data.pendingAdmissions).toBe(1);
    expect(res.body.data.studentsByClass).toEqual([{ className: "2", count: 1 }]);
  });

  test("invalid ids and unknown routes", async () => {
    expect((await agent.get("/api/students/not-an-id")).status).toBe(400);
    expect((await agent.get("/api/students/64b7f0f0f0f0f0f0f0f0f0f0")).status).toBe(404);
    const nf = await agent.get("/api/nope");
    expect(nf.status).toBe(404);
    expect(nf.body.success).toBe(false);
  });
});
