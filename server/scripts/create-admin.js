// Creates an admin, or resets an existing admin's password.
//   EDUPRO_ADMIN_PASSWORD='…' npm run create-admin -- <username> ["Full Name"]
// The password is read from the environment so it never appears in shell
// history or the process list.
const { getMongoUri } = require("../src/config/env");
const { connectDatabase, disconnectDatabase } = require("../src/config/db");
const User = require("../src/models/User");
const { hashPassword, validatePasswordStrength } = require("../src/services/authService");
const Session = require("../src/models/Session");

(async () => {
  const [username, name] = process.argv.slice(2);
  const password = process.env.EDUPRO_ADMIN_PASSWORD;
  if (!username) throw new Error("Usage: npm run create-admin -- <username> [\"Full Name\"]");
  const weak = validatePasswordStrength(password);
  if (weak) throw new Error(`EDUPRO_ADMIN_PASSWORD: ${weak}`);

  await connectDatabase(getMongoUri());
  await User.syncIndexes();
  await Session.syncIndexes();
  const passwordHash = await hashPassword(password);
  const existing = await User.findOne({ username: username.toLowerCase() });
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.active = true;
    if (name) existing.name = name;
    await existing.save();
    // A password reset signs out every existing session.
    await Session.deleteMany({ user: existing._id });
    console.log(`Password reset for ${existing.username}; existing sessions revoked.`);
  } else {
    await User.create({ username, name, passwordHash, role: "admin" });
    console.log(`Admin ${username.toLowerCase()} created.`);
  }
  await disconnectDatabase();
})().catch(async (err) => {
  console.error(err.message);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
