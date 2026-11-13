const request = require("supertest");
const User = require("../../src/models/User");
const { hashPassword } = require("../../src/services/authService");

const ADMIN = { username: "admin", password: "correct horse battery staple" };

async function createAdmin(overrides = {}) {
  return User.create({
    username: ADMIN.username,
    passwordHash: await hashPassword(ADMIN.password),
    ...overrides,
  });
}

// Returns a supertest agent that carries the session cookie.
async function signIn(app) {
  await createAdmin();
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send(ADMIN);
  if (res.status !== 200) throw new Error(`login failed: ${res.body.message}`);
  return agent;
}

const validApplication = (overrides = {}) => ({
  firstName: "Aisha",
  lastName: "Rahman",
  dateOfBirth: "2018-03-14",
  gender: "female",
  address: "12 Main Street, Parangipettai",
  classApplied: "2",
  academicYear: "2026-2027",
  father: { name: "Imran Rahman", phone: "+91 98765 43210" },
  ...overrides,
});

async function createApproved(app, overrides) {
  const { body } = await app.post("/api/admissions").send(validApplication(overrides));
  if (!body.success) throw new Error(body.message);
  const id = body.data.id;
  await app.patch(`/api/admissions/${id}/status`).send({ status: "under_review" });
  await app.patch(`/api/admissions/${id}/status`).send({ status: "approved" });
  return id;
}

async function enrolNew(app, overrides, enrolBody = {}) {
  const id = await createApproved(app, overrides);
  const res = await app.post(`/api/admissions/${id}/enroll`).send(enrolBody);
  if (res.status !== 201) throw new Error(res.body.message);
  return res.body.data.student;
}

module.exports = { ADMIN, createAdmin, signIn, validApplication, createApproved, enrolNew };
