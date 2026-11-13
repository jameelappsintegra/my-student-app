const request = require("supertest");
const mongoose = require("mongoose");
const { createApp } = require("../../src/app");
const Student = require("../../src/models/Student");
const Admission = require("../../src/models/Admission");
const { searchFilter } = require("../../src/utils/query");
const { startDb, clearDb, stopDb } = require("./setup");
const { signIn, validApplication, createApproved, enrolNew } = require("./helpers");

const app = createApp();
jest.setTimeout(60000);

beforeAll(startDb);
let agent;
beforeEach(async () => {
  agent = await signIn(app);
});
afterEach(clearDb);
afterAll(stopDb);

describe("concurrency", () => {
  test("simultaneous identical applications create exactly one", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => agent.post("/api/admissions").send(validApplication()))
    );
    const codes = results.map((r) => r.status).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(7);
    expect(await Admission.countDocuments()).toBe(1);
  });

  test("enrolling the same application twice at once creates one student", async () => {
    const id = await createApproved(agent);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => agent.post(`/api/admissions/${id}/enroll`).send({}))
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    results.filter((r) => r.status !== 201).forEach((r) => expect([400, 409]).toContain(r.status));
    expect(await Student.countDocuments()).toBe(1);
  });

  test("parallel enrolments get unique, gap-free admission numbers", async () => {
    const ids = [];
    for (let i = 0; i < 6; i++) ids.push(await createApproved(agent, { firstName: `Child${i}` }));
    const results = await Promise.all(ids.map((id) => agent.post(`/api/admissions/${id}/enroll`).send({})));
    results.forEach((r) => expect(r.status).toBe(201));
    const numbers = results.map((r) => r.body.data.student.admissionNumber).sort();
    expect(numbers).toEqual(
      Array.from({ length: 6 }, (_, i) => `ADM-2026-${String(i + 1).padStart(5, "0")}`)
    );
  });

  test("a failed enrolment rolls back completely", async () => {
    await enrolNew(agent, { firstName: "First" }, { section: "A", rollNumber: 1 });
    const id = await createApproved(agent, { firstName: "Second" });
    const res = await agent.post(`/api/admissions/${id}/enroll`).send({ section: "A", rollNumber: 1 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/roll number/i);
    const admission = await Admission.findById(id);
    expect(admission.status).toBe("approved");
    expect(await Student.countDocuments()).toBe(1);
    // The admission-number counter rolled back too, so the next number is 2.
    const ok = await agent.post(`/api/admissions/${id}/enroll`).send({ section: "A", rollNumber: 2 });
    expect(ok.body.data.student.admissionNumber).toBe("ADM-2026-00002");
  });

  test("stale concurrent edits are rejected, not silently lost", async () => {
    const s = await enrolNew(agent);
    const a = await Student.findById(s.id);
    const b = await Student.findById(s.id);
    a.address = "New address A";
    await a.save();
    b.address = "New address B";
    await expect(b.save()).rejects.toBeInstanceOf(mongoose.Error.VersionError);
  });
});

describe("duplicates and business rules", () => {
  test("same name and birthday in a different academic year is still blocked once enrolled", async () => {
    await enrolNew(agent);
    const res = await agent.post("/api/admissions").send(validApplication({ academicYear: "2027-2028" }));
    expect(res.status).toBe(409);
  });

  test("siblings with different birthdays can both apply", async () => {
    await agent.post("/api/admissions").send(validApplication());
    const res = await agent.post("/api/admissions").send(validApplication({ dateOfBirth: "2016-05-01" }));
    expect(res.status).toBe(201);
  });

  test("roll numbers are unique per section and freed on delete", async () => {
    const a = await enrolNew(agent, { firstName: "A" }, { section: "A", rollNumber: 5 });
    const b = await enrolNew(agent, { firstName: "B" }, { section: "B", rollNumber: 5 });
    const clash = await agent.put(`/api/students/${b.id}`).send({ section: "A" });
    expect(clash.status).toBe(409);
    await agent.delete(`/api/students/${a.id}`);
    expect((await agent.put(`/api/students/${b.id}`).send({ section: "A" })).status).toBe(200);
  });

  test("full status transition matrix", async () => {
    const { body } = await agent.post("/api/admissions").send(validApplication());
    const id = body.data.id;
    const patch = (status) => agent.patch(`/api/admissions/${id}/status`).send({ status });
    expect((await patch("submitted")).status).toBe(400);
    expect((await patch("documents_required")).status).toBe(400);
    expect((await patch("under_review")).status).toBe(200);
    expect((await patch("documents_required")).status).toBe(200);
    expect((await patch("approved")).status).toBe(400);
    expect((await patch("under_review")).status).toBe(200);
    expect((await patch("approved")).status).toBe(200);
    expect((await patch("enrolled")).status).toBe(400);
    expect((await patch("rejected")).status).toBe(200);
    expect((await patch("under_review")).status).toBe(400);
    const detail = await agent.get(`/api/admissions/${id}`);
    expect(detail.body.data.statusHistory.map((h) => h.status)).toEqual([
      "submitted", "under_review", "documents_required", "under_review", "approved", "rejected",
    ]);
  });

  test("deleted students disappear from lists, lookups and repeat deletes", async () => {
    const s = await enrolNew(agent);
    expect((await agent.delete(`/api/students/${s.id}`)).status).toBe(200);
    expect((await agent.delete(`/api/students/${s.id}`)).status).toBe(404);
    expect((await agent.put(`/api/students/${s.id}`).send({ rollNumber: 1 })).status).toBe(404);
    expect((await agent.get("/api/students")).body.data).toEqual([]);
    expect((await agent.get("/api/dashboard")).body.data.totalStudents).toBe(0);
  });

  test("restricted and internal fields never leave the API", async () => {
    const s = await enrolNew(agent);
    await agent.put(`/api/students/${s.id}`).send({ medicalNotes: "Allergy" });
    for (const path of [`/api/students/${s.id}`, "/api/students", "/api/admissions", "/api/dashboard"]) {
      const text = JSON.stringify((await agent.get(path)).body);
      expect(text).not.toMatch(/Allergy|medicalNotes|dedupeKey|searchTokens|"_id"|"__v"/);
    }
  });
});

describe("hostile and invalid input", () => {
  test("operator injection in query and body has no effect", async () => {
    await agent.post("/api/admissions").send(validApplication());
    expect((await agent.get("/api/admissions?status[$ne]=x")).status).toBe(400);
    expect((await agent.get("/api/students?search[$regex]=.*")).status).toBe(400);
    const body = { ...validApplication(), firstName: { $gt: "" } };
    expect((await agent.post("/api/admissions").send(body)).status).toBe(400);
  });

  test("regex metacharacters in search are literal", async () => {
    await enrolNew(agent);
    const res = await agent.get("/api/students?search=" + encodeURIComponent(".*"));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test("multi-word and number search", async () => {
    await enrolNew(agent, { firstName: "Mary Ann", lastName: "Lee" });
    await enrolNew(agent, { firstName: "Mary", lastName: "Jones" });
    const q = (s) => agent.get(`/api/students?search=${encodeURIComponent(s)}`);
    expect((await q("mary")).body.data).toHaveLength(2);
    expect((await q("mary le")).body.data).toHaveLength(1);
    expect((await q("ADM-2026-00002")).body.data[0].lastName).toBe("Jones");
    expect((await q("ary")).body.data).toHaveLength(0);
  });

  test("pagination bounds", async () => {
    expect((await agent.get("/api/students?limit=1000")).status).toBe(400);
    expect((await agent.get("/api/students?page=-1")).status).toBe(400);
    const far = await agent.get("/api/students?page=50");
    expect(far.status).toBe(200);
    expect(far.body.data).toEqual([]);
  });

  test("malformed JSON, oversized bodies, wrong content", async () => {
    const bad = await agent.post("/api/admissions").set("Content-Type", "application/json").send("{bad");
    expect(bad.status).toBe(400);
    expect(bad.body.success).toBe(false);
    const big = await agent.post("/api/admissions").send({ ...validApplication(), address: "x".repeat(200000) });
    expect(big.status).toBe(413);
    const text = await agent.post("/api/admissions").set("Content-Type", "text/plain").send("hi");
    expect(text.status).toBe(415);
  });

  test("invalid ids", async () => {
    for (const path of ["/api/admissions/123", "/api/students/zzz", "/api/admissions/123/enroll"]) {
      const method = path.endsWith("enroll") ? "post" : "get";
      expect((await agent[method](path).send({})).status).toBe(400);
    }
  });
});

describe("platform behaviour", () => {
  test("liveness and readiness", async () => {
    expect((await agent.get("/api/health")).status).toBe(200);
    const ready = await agent.get("/api/ready");
    expect(ready.status).toBe(200);
    expect(ready.body.data.database).toBe("up");
  });

  test("security headers, request ids and CORS", async () => {
    const res = await agent.get("/api/health").set("Origin", "http://localhost:3000");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-request-id"]).toMatch(/[0-9a-f-]{36}/);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");

    const echoed = await agent.get("/api/health").set("X-Request-Id", "abc-123");
    expect(echoed.headers["x-request-id"]).toBe("abc-123");
    const injected = await agent.get("/api/health").set("X-Request-Id", "bad id <script>");
    expect(injected.headers["x-request-id"]).not.toBe("bad id <script>");

    const evil = await agent.get("/api/health").set("Origin", "https://evil.example");
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("rate limiting returns 429 with the standard body", async () => {
    const limited = createApp({ rateLimit: 3 });
    for (let i = 0; i < 3; i++) await request(limited).get("/api/meta/classes");
    const res = await request(limited).get("/api/meta/classes");
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    // Health checks are never rate limited.
    expect((await request(limited).get("/api/health")).status).toBe(200);
  });

  test("list and search queries use indexes (no collection scans)", async () => {
    for (let i = 0; i < 3; i++) await enrolNew(agent, { firstName: `Kid${i}` }, { section: "A", rollNumber: i + 1 });
    const plans = [
      Student.find({ deletedAt: null, ...searchFilter("kid") }),
      Student.find({ deletedAt: null }).sort({ lastName: 1 }),
      Student.find({ deletedAt: null, className: "2", section: "A" }).sort({ rollNumber: 1 }),
      Admission.find({ status: "enrolled" }).sort({ createdAt: -1 }),
      Admission.find({}).sort({ createdAt: -1 }),
    ];
    for (const q of plans) {
      const text = JSON.stringify(await q.explain("queryPlanner"));
      expect(text).toMatch(/IXSCAN/);
      expect(text).not.toMatch(/COLLSCAN/);
    }
  });
});
