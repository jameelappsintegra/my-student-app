let config;
try {
  config = require("./config/env");
} catch (err) {
  // Configuration errors are for operators: print the message, not a stack.
  console.error(err.message);
  process.exit(1);
}
const { port, getMongoUri, shutdownTimeoutMs } = config;
const logger = require("./config/logger");
const { connectDatabase, disconnectDatabase } = require("./config/db");
const { createApp } = require("./app");

async function start() {
  await connectDatabase(getMongoUri());
  logger.info("Connected to MongoDB");

  const server = createApp().listen(port, () => {
    logger.info(`EduPro API listening on port ${port}`);
  });
  // Slightly above typical load-balancer idle timeouts.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  server.on("error", (err) => {
    logger.fatal(
      err.code === "EADDRINUSE"
        ? `Port ${port} is already in use. Stop the other process or set PORT.`
        : { err },
      "Server error"
    );
    process.exit(1);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, draining connections`);
    // Force exit if in-flight requests do not finish in time.
    setTimeout(() => {
      logger.error("Shutdown timed out, forcing exit");
      process.exit(1);
    }, shutdownTimeoutMs).unref();

    server.close(async () => {
      await disconnectDatabase();
      logger.info("Shutdown complete");
      process.exit(0);
    });
    server.closeIdleConnections?.();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("unhandledRejection", (err) => {
  logger.fatal({ err }, "Unhandled promise rejection");
  process.exit(1);
});

start().catch((err) => {
  logger.fatal(err.message || err, "Failed to start server");
  process.exit(1);
});
