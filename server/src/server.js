const { port, getMongoUri } = require("./config/env");
const { connectDatabase, disconnectDatabase } = require("./config/db");
const { createApp } = require("./app");

async function start() {
  await connectDatabase(getMongoUri());
  console.log("Connected to MongoDB");

  const server = createApp().listen(port, () => {
    console.log(`EduPro API listening on http://localhost:${port}`);
  });
  server.on("error", (err) => {
    console.error(
      err.code === "EADDRINUSE"
        ? `Port ${port} is already in use. Stop the other process or set PORT.`
        : `Server error: ${err.message}`
    );
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
