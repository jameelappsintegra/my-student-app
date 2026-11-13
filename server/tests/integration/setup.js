const { MongoMemoryReplSet } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const { connectDatabase } = require("../../src/config/db");

let replSet;

// A replica set is needed because enrolment uses a transaction.
async function startDb() {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    // Match a locally supplied binary (MONGOMS_SYSTEM_BINARY) to avoid warnings.
    binary: process.env.MONGOMS_VERSION ? { version: process.env.MONGOMS_VERSION } : undefined,
  });
  await connectDatabase(replSet.getUri());
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
}

async function clearDb() {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({}))
  );
}

async function stopDb() {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
}

module.exports = { startDb, clearDb, stopDb };
