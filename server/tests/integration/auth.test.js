const request = require("supertest");
const { createApp } = require("../../src/app");
const Session = require("../../src/models/Session");
const User = require("../../src/models/User");
const { startDb, clearDb, stopDb } = require("./setup");
const { ADMIN, createAdmin, signIn, validApplication } = require("./helpers");

// Many failed sign-ins happen on purpose here; the per-IP limit itself is
// covered by "login is rate limited per IP" below.
const app = createApp({ loginLimit: 1000 });
jest.setTimeout(60000);

beforeAll(startDb);
afterEach(clearDb);
afterAll(stopDb);

const PROTECTED = [
  ["get", "/api/dashboard"],
  ["get", "/api/admissions"],
  ["post", "/api/admissions"],
  ["get", "/api/admissions/64b7f0f0f0f0f0f0f0f0f0f0"],
  ["patch", "/api/admissions/64b7f0f0f0f0f0f0f0f0f0f0/status"],
  ["post", "/api/admissions/64b7f0f0f0f0f0f0f0f0f0f0/enroll"],
  ["get", "/api/students"],
  ["get", "/api/students/64b7f0f0f0f0f0f0f0f0f0f0"],
  ["put", "/api/students/64b7f0f0f0f0f0f0f0f0f0f0"],
  ["patch", "/api/students/64b7f0f0f0f0f0f0f0f0f0f0/status"],
  ["delete", "/api/students/64b7f0f0f0f0f0f0f0f0f0f0"],
  ["get", "/api/auth/me"],
];

test.each(PROTECTED)("%s %s requires a session", async (method, path) => {
  const res = await request(app)[method](path).send({});
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ success: false, message: "Please sign in to continue." });
});

test("health, readiness and class list stay public", async () => {
  for (const path of ["/api/health", "/api/ready", "/api/meta/classes"]) {
    expect((await request(app).get(path)).status).toBe(200);
  }
});

test("sign in sets a hardened session cookie and never returns the hash", async () => {
  await createAdmin();
  const res = await request(app).post("/api/auth/login").send(ADMIN);
  expect(res.status).toBe(200);
  expect(res.body.data.user.username).toBe("admin");
  expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  const cookie = res.headers["set-cookie"][0];
  expect(cookie).toMatch(/^edupro_session=[\w-]{40,};/);
  expect(cookie).toMatch(/HttpOnly/);
  expect(cookie).toMatch(/SameSite=Strict/);
  expect(cookie).toMatch(/Expires=/);

  // Only a hash of the token is stored.
  const token = cookie.split(";")[0].split("=")[1];
  const stored = await Session.findOne().lean();
  expect(stored.tokenHash).not.toBe(token);
  expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
});

test("usernames are case-insensitive and passwords are not", async () => {
  await createAdmin();
  expect((await request(app).post("/api/auth/login").send({ ...ADMIN, username: "ADMIN" })).status).toBe(200);
  expect((await request(app).post("/api/auth/login").send({ ...ADMIN, password: ADMIN.password.toUpperCase() })).status).toBe(401);
});

test("wrong password and unknown user get the same generic answer", async () => {
  await createAdmin();
  const wrong = await request(app).post("/api/auth/login").send({ ...ADMIN, password: "nope" });
  const unknown = await request(app).post("/api/auth/login").send({ username: "ghost", password: "nope" });
  expect(wrong.status).toBe(401);
  expect(unknown.status).toBe(401);
  expect(wrong.body.message).toBe("Incorrect username or password.");
  expect(unknown.body.message).toBe(wrong.body.message);
  expect(wrong.headers["set-cookie"]).toBeUndefined();
});

test("five failures lock the account, even for the right password", async () => {
  await createAdmin();
  const attempt = (password) => request(app).post("/api/auth/login").send({ ...ADMIN, password });
  for (let i = 0; i < 4; i++) expect((await attempt("bad")).body.message).toMatch(/Incorrect/);
  expect((await attempt("bad")).body.message).toMatch(/locked/);
  expect((await attempt(ADMIN.password)).status).toBe(401);
  // After the lock expires the right password works again.
  await User.updateOne({}, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
  expect((await attempt(ADMIN.password)).status).toBe(200);
});

test("deactivated users cannot sign in and lose existing sessions", async () => {
  const agent = await signIn(app);
  expect((await agent.get("/api/dashboard")).status).toBe(200);
  await User.updateOne({}, { active: false });
  expect((await agent.get("/api/dashboard")).status).toBe(401);
  expect((await request(app).post("/api/auth/login").send(ADMIN)).status).toBe(401);
});

test("logout revokes the session server-side", async () => {
  const agent = await signIn(app);
  const cookie = (await agent.get("/api/auth/me")).request.cookies;
  expect((await agent.get("/api/auth/me")).status).toBe(200);
  const out = await agent.post("/api/auth/logout").send({});
  expect(out.status).toBe(200);
  expect(out.headers["set-cookie"][0]).toMatch(/edupro_session=;/);
  expect(await Session.countDocuments()).toBe(0);
  // Replaying the old cookie no longer works.
  expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(401);
});

test("expired and forged sessions are rejected", async () => {
  const agent = await signIn(app);
  await Session.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
  expect((await agent.get("/api/dashboard")).status).toBe(401);
  for (const value of ["forged", "x".repeat(500), ""]) {
    const res = await request(app).get("/api/dashboard").set("Cookie", `edupro_session=${value}`);
    expect(res.status).toBe(401);
  }
});

test("writes must be JSON (CSRF protection)", async () => {
  const agent = await signIn(app);
  const form = await agent
    .post("/api/admissions")
    .set("Content-Type", "application/x-www-form-urlencoded")
    .send("firstName=Evil");
  expect(form.status).toBe(415);
  const ok = await agent.post("/api/admissions").send(validApplication());
  expect(ok.status).toBe(201);
});

test("login is rate limited per IP", async () => {
  const limited = createApp({ loginLimit: 3 });
  for (let i = 0; i < 3; i++) await request(limited).post("/api/auth/login").send({ username: "x", password: "y" });
  const res = await request(limited).post("/api/auth/login").send({ username: "x", password: "y" });
  expect(res.status).toBe(429);
  expect(res.body.message).toMatch(/Too many sign-in attempts/);
});

test("validation on login input", async () => {
  expect((await request(app).post("/api/auth/login").send({ username: "admin" })).status).toBe(400);
  expect((await request(app).post("/api/auth/login").send({ username: { $ne: "" }, password: "x" })).status).toBe(400);
  expect((await request(app).post("/api/auth/login").send({ ...ADMIN, role: "x" })).status).toBe(400);
});
