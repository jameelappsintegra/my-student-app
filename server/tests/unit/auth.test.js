const { validatePasswordStrength, hashPassword, hashToken } = require("../../src/services/authService");
const bcrypt = require("bcryptjs");

test("password strength", () => {
  expect(validatePasswordStrength("short")).toMatch(/12/);
  expect(validatePasswordStrength(undefined)).toMatch(/12/);
  expect(validatePasswordStrength("x".repeat(129))).toMatch(/128/);
  expect(validatePasswordStrength("a long enough passphrase")).toBeNull();
});

test("passwords are salted bcrypt hashes", async () => {
  const a = await hashPassword("a long enough passphrase");
  const b = await hashPassword("a long enough passphrase");
  expect(a).toMatch(/^\$2[aby]\$/);
  expect(a).not.toBe(b);
  expect(await bcrypt.compare("a long enough passphrase", a)).toBe(true);
});

test("session tokens are stored as SHA-256", () => {
  expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
