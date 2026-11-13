const request = require("supertest");

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
  const { body } = await request(app).post("/api/admissions").send(validApplication(overrides));
  if (!body.success) throw new Error(body.message);
  const id = body.data.id;
  await request(app).patch(`/api/admissions/${id}/status`).send({ status: "under_review" });
  await request(app).patch(`/api/admissions/${id}/status`).send({ status: "approved" });
  return id;
}

async function enrolNew(app, overrides, enrolBody = {}) {
  const id = await createApproved(app, overrides);
  const res = await request(app).post(`/api/admissions/${id}/enroll`).send(enrolBody);
  if (res.status !== 201) throw new Error(res.body.message);
  return res.body.data.student;
}

module.exports = { validApplication, createApproved, enrolNew };
