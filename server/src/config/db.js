const mongoose = require("mongoose");
const logger = require("./logger");

mongoose.set("strictQuery", true);

let closing = false;
mongoose.connection.on("disconnected", () => {
  if (!closing) logger.warn("MongoDB disconnected");
});
mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
mongoose.connection.on("error", (err) =>
  logger.error({ err }, "MongoDB connection error")
);

async function connectDatabase(uri) {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20,
  });
  return mongoose.connection;
}

async function disconnectDatabase() {
  closing = true;
  await mongoose.disconnect();
}

async function pingDatabase() {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

module.exports = { connectDatabase, disconnectDatabase, pingDatabase };
