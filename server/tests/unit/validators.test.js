const v = require("../../src/validators/admission");
const s = require("../../src/validators/student");

const base = () => ({
  school: "64b7f0f0f0f0f0f0f0f0f0f0",
  firstName: "Aisha",
  lastName: "Rahman",
  dateOfBirth: "2018-03-14",
  gender: "female",
  address: "12 Main Street",
  classApplied: "2",
  academicYear: "2026-2027",
  father: { name: "Imran", phone: "9876543210" },
});

const issues = (r) => r.error.issues.map((i) => i.path.join("."));

describe("createAdmission validator", () => {
  test("accepts a minimal valid application and trims text", () => {
    const r = v.createAdmission.safeParse({ ...base(), firstName: "  Aisha  " });
    expect(r.success).toBe(true);
    expect(r.data.firstName).toBe("Aisha");
    expect(r.data.dateOfBirth).toBeInstanceOf(Date);
  });

  test("treats empty optional strings as missing", () => {
    const r = v.createAdmission.safeParse({
      ...base(),
      middleName: "",
      bloodGroup: "",
      mother: { name: "", phone: "", email: "" },
    });
    expect(r.success).toBe(true);
    expect(r.data.middleName).toBeUndefined();
    expect(r.data.bloodGroup).toBeUndefined();
  });

  test.each([
    ["dateOfBirth", "not-a-date"],
    ["dateOfBirth", "2099-01-01"],
    ["dateOfBirth", "1990-01-01"],
    ["dateOfBirth", new Date().toISOString().slice(0, 10)],
    ["gender", "unknown"],
    ["classApplied", "13"],
    ["academicYear", "2026-2028"],
    ["academicYear", "26-27"],
    ["bloodGroup", "C+"],
    ["firstName", "   "],
    ["firstName", "x".repeat(61)],
    ["address", ""],
  ])("rejects %s = %p", (field, value) => {
    const r = v.createAdmission.safeParse({ ...base(), [field]: value });
    expect(r.success).toBe(false);
    expect(issues(r)).toContain(field);
  });

  test.each(["123", "abc1234567", "+91 98765 43210 1234 5678"])(
    "rejects phone %p",
    (phone) => {
      const r = v.createAdmission.safeParse({ ...base(), father: { name: "I", phone } });
      expect(r.success).toBe(false);
    }
  );

  test("rejects an invalid email", () => {
    const r = v.createAdmission.safeParse({
      ...base(),
      father: { name: "I", phone: "9876543210", email: "nope" },
    });
    expect(issues(r)).toContain("father.email");
  });

  test("requires a parent or guardian name", () => {
    const r = v.createAdmission.safeParse({
      ...base(),
      father: undefined,
      emergencyContact: { phone: "9876543210" },
    });
    expect(issues(r)).toContain("father.name");
  });

  test("accepts a guardian instead of parents", () => {
    const r = v.createAdmission.safeParse({
      ...base(),
      father: undefined,
      guardian: { name: "Aunt", relation: "Aunt", phone: "9876543210" },
    });
    expect(r.success).toBe(true);
  });

  test("rejects server-controlled and unknown fields", () => {
    for (const extra of [{ status: "enrolled" }, { applicationNumber: "X" }, { isAdmin: true }]) {
      expect(v.createAdmission.safeParse({ ...base(), ...extra }).success).toBe(false);
    }
    expect(
      v.createAdmission.safeParse({ ...base(), father: { name: "I", phone: "9876543210", role: "x" } })
        .success
    ).toBe(false);
  });

  test("rejects non-string values where strings are expected", () => {
    const r = v.createAdmission.safeParse({ ...base(), firstName: { $gt: "" } });
    expect(r.success).toBe(false);
  });
});

describe("list validators", () => {
  test("apply defaults and coerce numbers", () => {
    const r = s.listStudents.parse({ page: "2" });
    expect(r).toMatchObject({ page: 2, limit: 10, sort: "lastName" });
  });

  test.each([{ limit: "101" }, { page: "0" }, { page: "abc" }, { sort: "password" }, { status: "x" }, { foo: "1" }])(
    "rejects %p",
    (q) => expect(s.listStudents.safeParse(q).success).toBe(false)
  );

  test("enroll validator limits section and roll number", () => {
    expect(v.enroll.safeParse({ section: "A1" }).success).toBe(false);
    expect(v.enroll.safeParse({ rollNumber: 0 }).success).toBe(false);
    expect(v.enroll.parse({ section: "b", rollNumber: "4" })).toEqual({ section: "b", rollNumber: 4 });
  });

  test("updateStudent requires at least one field", () => {
    expect(s.updateStudent.safeParse({}).success).toBe(false);
    expect(s.updateStudent.safeParse({ rollNumber: 3 }).success).toBe(true);
    expect(s.updateStudent.safeParse({ admissionNumber: "X" }).success).toBe(false);
  });
});
