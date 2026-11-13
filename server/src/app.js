const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { corsOrigins, isProduction, isTest } = require("./config/env");
const sanitize = require("./middleware/sanitize");
const { notFound, errorHandler } = require("./middleware/errorHandler");

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  if (isProduction) app.set("trust proxy", 1);

  // Middleware runs in registration order, so it must come before routes.
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) =>
        // Allow non-browser clients (no Origin header) and listed origins.
        cb(null, !origin || corsOrigins.includes(origin)),
      credentials: true,
    })
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: isTest ? 10000 : 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { success: false, message: "Too many requests, slow down." },
    })
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(sanitize);
  if (!isProduction && !isTest) {
    app.use((req, _res, next) => {
      console.log(`${req.method} ${req.originalUrl}`);
      next();
    });
  }

  app.use("/api", require("./routes"));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
