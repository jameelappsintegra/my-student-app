// Run after each deploy: `npm run db:maintain`.
// - Creates/updates indexes to match the schemas (drops stale ones).
// - Backfills searchTokens on records created before search indexing existed.
const mongoose = require("mongoose");
const { getMongoUri } = require("../src/config/env");
const logger = require("../src/config/logger");
const { connectDatabase, disconnectDatabase } = require("../src/config/db");
const Student = require("../src/models/Student");
const Admission = require("../src/models/Admission");
const { buildSearchTokens } = require("../src/models/common");

async function backfill(Model, numberField) {
  const cursor = Model.find({ searchTokens: { $exists: false } })
    .select(`firstName middleName lastName ${numberField}`)
    .lean()
    .cursor();
  let ops = [];
  let count = 0;
  for await (const doc of cursor) {
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { searchTokens: buildSearchTokens(doc, numberField) } },
      },
    });
    if (ops.length === 500) {
      count += (await Model.bulkWrite(ops)).modifiedCount;
      ops = [];
    }
  }
  if (ops.length) count += (await Model.bulkWrite(ops)).modifiedCount;
  return count;
}

(async () => {
  await connectDatabase(getMongoUri());
  for (const model of Object.values(mongoose.models)) {
    const dropped = await model.syncIndexes();
    logger.info({ model: model.modelName, dropped }, "Indexes in sync");
  }
  logger.info({ updated: await backfill(Student, "admissionNumber") }, "Students backfilled");
  logger.info({ updated: await backfill(Admission, "applicationNumber") }, "Admissions backfilled");
  await disconnectDatabase();
})().catch(async (err) => {
  logger.fatal({ err }, "Maintenance failed");
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
