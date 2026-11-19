const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const pinoHttp = require("pino-http");
const { corsOrigins, trustProxy, rateLimitMax } = require("./config/env");
const logger = require("./config/logger");
const sanitize = require("./middleware/sanitize");
const { requireJsonForWrites } = require("./middleware/auth");
const { notFound, errorHandler } = require("./middleware/errorHandler");

// options.rateLimit / options.loginLimit override the env values (tests).
function createApp(options = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy);

  // Middleware runs in registration order, so it must come before routes.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id =
          typeof incoming === "string" && /^[\w-]{1,64}$/.test(incoming)
            ? incoming
            : crypto.randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      autoLogging: { ignore: (req) => req.url === "/api/health" },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    })
  );
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) =>
        // Allow non-browser clients (no Origin header) and listed origins.
        cb(null, !origin || corsOrigins.includes(origin)),
      credentials: true,
      exposedHeaders: ["X-Request-Id"],
    })
  );
  app.use(compression());
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: options.rateLimit ?? rateLimitMax,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      skip: (req) => req.path === "/health" || req.path === "/ready",
      message: { success: false, message: "Too many requests, slow down." },
    })
  );
  app.use(cookieParser());
  app.use("/api", requireJsonForWrites);
  app.use(express.json({ limit: "100kb" }));
  app.use(sanitize);

  app.use("/api", require("./routes")({ loginLimit: options.loginLimit }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
