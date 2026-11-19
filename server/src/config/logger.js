const pino = require("pino");
const { logLevel, isProduction } = require("./env");

// JSON logs in production (for log collectors); readable logs in development.
const logger = pino({
  level: logLevel,
  base: { service: "edupro-api" },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
    ],
    censor: "[redacted]",
  },
  transport:
    !isProduction && logLevel !== "silent"
      ? { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss" } }
      : undefined,
});

module.exports = logger;
