const request = require("supertest");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { SignedXml } = require("xml-crypto");
const { createApp } = require("../../src/app");
const Student = require("../../src/models/Student");
const { startDb, clearDb, stopDb } = require("./setup");
const { signIn, schoolId, createSchool } = require("./helpers");
const { parseOfflineKyc } = require("../../src/services/aadhaarService");

const app = createApp({ loginLimit: 1000 });
jest.setTimeout(60000);
beforeAll(startDb);
afterEach(clearDb);
afterAll(stopDb);
const PW = "a long enough passphrase";
let admin, other;

beforeEach(async () => {
  admin = await signIn(app);
  other = await createSchool({ name: "Other School", code: "OTH" });
});
const login = async (username) => {
  const a = request.agent(app);
  await a.post("/api/auth/login").send({ username, password: PW });
  return a;
};
const upload = (agent, csv, dryRun = true) =>
  agent.post(`/api/students/import?dryRun=${dryRun}`).set("X-Requested-With", "EduPro").attach("file", Buffer.from(csv), { filename: "s.csv", contentType: "text/csv" });

describe("CSV import", () => {
  const header = "School Code,First Name,Last Name,DOB,Gender,Class,Address,Section,Roll No,Father Name,Father Phone,Transport";
  test("validates everything first, then imports all rows in one go", async () => {
    const csv = [header, 'TS,Asha,Iyer,14/03/2016,F,Class 5,"12, Main St",a,1,Ganesh,9876543210,bus', "OTH,Bala,Khan,2015-01-02,M,V,Road 2,B,,Imran,9876500000,walk"].join("\n");
    const dry = await upload(admin, csv);
    expect(dry.status).toBe(200);
    expect(dry.body.data).toMatchObject({ totalRows: 2, validRows: 2, imported: 0, errors: [] });
    expect(dry.body.data.preview[0]).toMatchObject({ row: 2, name: "Asha Iyer", school: "TS", className: "5", section: "A", dateOfBirth: "2016-03-14" });
    expect(await Student.countDocuments()).toBe(0);
    const go = await upload(admin, csv, false);
    expect(go.status).toBe(201);
    expect(go.body.data.imported).toBe(2);
    const list = (await admin.get("/api/students?sort=admissionNumber")).body.data;
    expect(list.map((s) => [s.admissionNumber, s.className, s.section])).toEqual([["OTH-2026-00001", "5", "B"], ["TS-2026-00001", "5", "A"]]);
  });

  test("reports every problem with its row number and saves nothing", async () => {
    await upload(admin, [header, "TS,Asha,Iyer,14/03/2016,F,5,Addr,A,1,G,9876543210,"].join("\n"), false);
    const csv = [
      header,
      "XX,No,School,14/03/2016,F,5,Addr,A,,G,9876543210,", // unknown school
      "TS,Asha,Iyer,14/03/2016,F,5,Addr,A,2,G,9876543210,", // already enrolled
      "TS,Bad,Date,31/02/2016,Q,13,,A,,G,12,", // several errors
      "TS,Twin,One,01/01/2016,M,5,Addr,A,1,G,9876543210,", // roll 1 taken
      "TS,Copy,Row,01/01/2017,M,5,Addr,A,7,G,9876543210,",
      "TS,copy,row,2017-01-01,M,5,Addr,A,8,G,9876543210,", // duplicate of previous row
    ].join("\n");
    const res = await upload(admin, csv, false);
    expect(res.status).toBe(400);
    const by = (row) => res.body.data.errors.filter((e) => e.row === row).map((e) => e.field);
    expect(by(2)).toEqual(["school_code"]);
    expect(res.body.data.errors.find((e) => e.row === 3).message).toBe("Already enrolled as TS-2026-00001");
    expect(by(4)).toEqual(expect.arrayContaining(["dateOfBirth", "gender", "className", "address"]));
    expect(res.body.data.errors.find((e) => e.row === 5).message).toBe("Roll 1 belongs to TS-2026-00001");
    expect(res.body.data.errors.find((e) => e.row === 7).message).toBe("Same student as row 6");
    expect(await Student.countDocuments()).toBe(1);
  });

  test("file-level problems, template and permissions", async () => {
    expect((await upload(admin, "first_name,last_name\nA,B")).body.message).toMatch(/Missing columns: school_code/);
    expect((await upload(admin, header)).body.message).toMatch(/no student rows/);
    const tpl = await admin.get("/api/students/import/template");
    expect(tpl.headers["content-disposition"]).toMatch(/edupro-student-import-template\.csv/);
    expect(tpl.text.split("\r\n")[0]).toMatch(/^﻿school_code,first_name,last_name,date_of_birth/);
    // Teachers need the permission switched on, and then only for their classes.
    await admin.post("/api/users").send({ username: "t.plain", password: PW, role: "teacher", name: "T", assignments: [{ school: schoolId(), className: "5" }] });
    await admin.post("/api/users").send({ username: "t.import", password: PW, role: "teacher", name: "T", grants: ["students.import"], assignments: [{ school: schoolId(), className: "5", section: "A" }] });
    const plain = await login("t.plain");
    expect((await upload(plain, header + "\nTS,A,B,01/01/2016,F,5,x,A,,G,9876543210,")).status).toBe(403);
    const imp = await login("t.import");
    const res = await upload(imp, [header, "TS,In,Class,01/01/2016,F,5,x,A,,G,9876543210,", "TS,Out,Class,02/01/2016,F,5,x,B,,G,9876543210,", "OTH,Other,School,03/01/2016,F,5,x,A,,G,9876543210,"].join("\n"));
    expect(res.body.data.errors.map((e) => [e.row, e.field])).toEqual([[3, "class"], [4, "class"]]);
    expect(res.body.data.validRows).toBe(1);
  });
});

describe("cross-school sharing", () => {
  let ts, oth, otherStudent;
  beforeEach(async () => {
    otherStudent = (await admin.post("/api/students").send({
      school: other, firstName: "Shared", lastName: "Kid", dateOfBirth: "2015-05-05", gender: "male", address: "9 Secret Lane",
      className: "6", section: "A", academicYear: "2026-2027", father: { name: "Private Father", phone: "9123456789" },
    })).body.data;
    await admin.post(`/api/students/${otherStudent.id}/results`).send({ academicYear: "2026-2027", exam: "Term 1", subjects: [{ subject: "English", maxMarks: 100, marks: 81 }] });
    await admin.post("/api/users").send({ username: "teacher.ts", password: PW, role: "teacher", name: "TS Teacher", assignments: [{ school: schoolId(), className: "6" }] });
    await admin.post("/api/users").send({ username: "principal.oth", password: PW, role: "principal", name: "OTH Head", schools: [other] });
    await admin.post("/api/users").send({ username: "principal.ts", password: PW, role: "principal", name: "TS Head", schools: [schoolId()] });
    ts = await login("teacher.ts");
    oth = await login("principal.oth");
  });

  test("request → approve (narrowed) → read-only access → revoke", async () => {
    expect((await ts.get(`/api/students/${otherStudent.id}`)).status).toBe(404);
    const req = await ts.post("/api/shares").send({ admissionNumber: "oth-2026-00001", scopes: ["academic", "personal"], reason: "Transfer assessment for next term" });
    expect(req.status).toBe(201);
    expect(req.body.message).toBe("Request sent to Other School.");
    expect((await ts.post("/api/shares").send({ admissionNumber: "OTH-2026-00001", scopes: ["academic"], reason: "Asking twice for this" })).status).toBe(409);

    // Only the owning school's principal (or an admin) sees and decides it.
    const tsHead = await login("principal.ts");
    expect((await tsHead.get("/api/shares?box=incoming")).body.data).toEqual([]);
    const incoming = (await oth.get("/api/shares?box=incoming")).body.data;
    expect(incoming).toEqual([expect.objectContaining({ status: "pending", scopes: ["academic", "personal"], requester: expect.objectContaining({ name: "TS Teacher" }), student: expect.objectContaining({ name: "Shared Kid" }) })]);
    expect((await tsHead.post(`/api/shares/${incoming[0].id}/decision`).send({ approve: true })).status).toBe(404);
    const ok = await oth.post(`/api/shares/${incoming[0].id}/decision`).send({ approve: true, scopes: ["academic", "fees"], days: 7 });
    expect(ok.body.data.scopes).toEqual(["academic"]); // can't widen
    expect((await oth.post(`/api/shares/${incoming[0].id}/decision`).send({ approve: false })).status).toBe(400);

    const view = await ts.get(`/api/students/${otherStudent.id}`);
    expect(view.status).toBe(200);
    expect(view.body.data).toMatchObject({ firstName: "Shared", className: "6", sharedAccess: { scopes: ["academic"] } });
    expect(view.body.data.address).toBeUndefined();
    expect(view.body.data.father).toBeUndefined();
    expect((await ts.get(`/api/students/${otherStudent.id}/results`)).body.data[0].percentage).toBe(81);
    expect((await ts.get(`/api/students/${otherStudent.id}/attendance`)).status).toBe(403);
    expect((await ts.get(`/api/students/${otherStudent.id}/fees`)).status).toBe(403);
    expect((await ts.put(`/api/students/${otherStudent.id}/attendance/2026-11-02`).send({ status: "absent" })).status).toBe(403);
    expect((await ts.post(`/api/students/${otherStudent.id}/results`).send({})).status).toBe(403);
    // Shared students don't appear in lists or search.
    expect((await ts.get("/api/students")).body.data).toEqual([]);
    expect((await ts.get("/api/search?q=shared")).body.data).toEqual([]);
    expect((await ts.get("/api/me/shared")).body.data).toEqual([expect.objectContaining({ id: otherStudent.id, scopes: ["academic"] })]);

    expect((await oth.post(`/api/shares/${incoming[0].id}/revoke`).send({})).status).toBe(200);
    expect((await ts.get(`/api/students/${otherStudent.id}`)).status).toBe(404);
  });

  test("rejection, expiry, unknown numbers, own students and parents", async () => {
    expect((await ts.post("/api/shares").send({ admissionNumber: "NOPE-1", scopes: ["academic"], reason: "Checking something" })).status).toBe(404);
    expect((await ts.post("/api/shares").send({ admissionNumber: "OTH-2026-00001", scopes: [], reason: "x" })).status).toBe(400);
    const r = await ts.post("/api/shares").send({ admissionNumber: "OTH-2026-00001", scopes: ["personal"], reason: "Emergency contact needed" });
    await oth.post(`/api/shares/${r.body.data.id}/decision`).send({ approve: false, note: "Ask the parent" });
    expect((await ts.get(`/api/students/${otherStudent.id}`)).status).toBe(404);
    expect((await ts.get("/api/shares")).body.data[0]).toMatchObject({ status: "rejected", decisionNote: "Ask the parent", decidedBy: "OTH Head" });

    const r2 = await ts.post("/api/shares").send({ admissionNumber: "OTH-2026-00001", scopes: ["personal"], reason: "Second, approved one", days: 1 });
    await oth.post(`/api/shares/${r2.body.data.id}/decision`).send({ approve: true });
    expect((await ts.get(`/api/students/${otherStudent.id}`)).body.data.address).toBe("9 Secret Lane");
    await require("../../src/models/AccessShare").updateOne({ _id: r2.body.data.id }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await ts.get(`/api/students/${otherStudent.id}`)).status).toBe(404);
    expect((await ts.get("/api/shares")).body.data.find((s) => s.id === r2.body.data.id).expired).toBe(true);

    // Admins approve anything; parents can't request.
    await admin.post("/api/users").send({ username: "parent.z", password: PW, role: "parent", name: "P" });
    const p = await login("parent.z");
    expect((await p.post("/api/shares").send({ admissionNumber: "OTH-2026-00001", scopes: ["academic"], reason: "I am curious" })).status).toBe(403);
    expect((await p.get("/api/shares?box=incoming")).status).toBe(403);
  });
});

describe("Aadhaar offline e-KYC", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kyc-"));
  const key = path.join(dir, "key.pem");
  const cert = path.join(dir, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "2", "-subj", "/CN=Test UIDAI"], { stdio: "ignore" });
  const stamp = new Date(Date.now() - 3600000).toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const unsigned = `<?xml version="1.0" encoding="UTF-8"?><OfflinePaperlessKyc referenceId="1234${stamp}123"><UidData><Poi dob="14-03-2016" e="x" gender="F" m="y" name="Asha Devi Iyer"/><Poa careof="D/O: Ganesh Iyer" country="India" dist="Cuddalore" house="12" landmark="Near Temple" loc="Main Street" pc="608502" po="Parangipettai" state="Tamil Nadu" street="Main Street" subdist="Chidambaram" vtc="Parangipettai"/><Pht>${Buffer.alloc(200, 7).toString("base64")}</Pht></UidData></OfflinePaperlessKyc>`;
  const sig = new SignedXml({ privateKey: fs.readFileSync(key), publicCert: fs.readFileSync(cert) });
  sig.addReference({ xpath: "/*", digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256", transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"] });
  sig.canonicalizationAlgorithm = "http://www.w3.org/2001/10/xml-exc-c14n#";
  sig.signatureAlgorithm = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
  sig.computeSignature(unsigned);
  const signed = sig.getSignedXml();
  const xmlPath = path.join(dir, "offlineaadhaar.xml");
  fs.writeFileSync(xmlPath, signed);
  const zipPath = path.join(dir, "offlineaadhaar.zip");
  execFileSync("zip", ["-j", "-P", "AB12", zipPath, xmlPath], { stdio: "ignore" });
  const zipBuf = fs.readFileSync(zipPath);

  afterEach(() => delete process.env.UIDAI_OFFLINE_KYC_CERT);

  test("reads the details from the password-protected ZIP", () => {
    const d = parseOfflineKyc(zipBuf, "AB12");
    expect(d).toMatchObject({
      firstName: "Asha", middleName: "Devi", lastName: "Iyer", dateOfBirth: "2016-03-14", gender: "female",
      father: { name: "Ganesh Iyer" }, aadhaarLast4: "1234", verified: null,
    });
    expect(d.address).toBe("12, Main Street, Near Temple, Parangipettai, Chidambaram, Cuddalore, Tamil Nadu, 608502");
    expect(d.photo).toMatch(/^data:image\/jpeg;base64,/);
    expect(d.warnings[0]).toMatch(/signature wasn't checked/);
  });

  test("verifies the UIDAI signature when the certificate is configured; tampering fails", () => {
    process.env.UIDAI_OFFLINE_KYC_CERT = cert;
    expect(parseOfflineKyc(zipBuf, "AB12").verified).toBe(true);
    const tampered = Buffer.from(signed.replace("Asha Devi Iyer", "Someone Else"));
    const t = parseOfflineKyc(tampered, "");
    expect(t.verified).toBe(false);
    expect(t.warnings[0]).toMatch(/signature check failed/);
  });

  test("API: wrong share code, wrong file type, permission", async () => {
    const send = (agent, buf, code) => agent.post("/api/identity/aadhaar-offline").set("X-Requested-With", "EduPro").field("shareCode", code).attach("file", buf, { filename: "a.zip", contentType: "application/zip" });
    const ok = await send(admin, zipBuf, "AB12");
    expect(ok.status).toBe(200);
    expect(ok.headers["cache-control"]).toBe("no-store");
    expect(ok.body.data.lastName).toBe("Iyer");
    expect((await send(admin, zipBuf, "ZZZZ")).body.message).toBe("The share code is wrong for this file.");
    expect((await send(admin, Buffer.from("hello"), "AB12")).status).toBe(400);
    // XML bombs are not expanded.
    const bomb = Buffer.from('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]><OfflinePaperlessKyc referenceId="1"><UidData><Poi name="&b;" dob="01-01-2016" gender="M"/></UidData></OfflinePaperlessKyc>');
    expect((await send(admin, bomb, "")).body.data.firstName).toBe("&b;");
    await admin.post("/api/users").send({ username: "teacher.k", password: PW, role: "teacher", name: "T" });
    const t = await login("teacher.k");
    expect((await send(t, zipBuf, "AB12")).status).toBe(403);
  });
});
