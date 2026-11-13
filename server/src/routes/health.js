const router = require("express").Router();
const { pingDatabase } = require("../config/db");

// Liveness: the process is up. Never depends on the database.
router.get("/health", (_req, res) => {
  res.json({ success: true, message: "OK", data: { uptime: process.uptime() } });
});

// Readiness: safe to receive traffic (database reachable).
router.get("/ready", async (_req, res) => {
  const db = await pingDatabase();
  res.status(db ? 200 : 503).json({
    success: db,
    message: db ? "Ready" : "Database unavailable",
    data: { database: db ? "up" : "down" },
  });
});

module.exports = router;
