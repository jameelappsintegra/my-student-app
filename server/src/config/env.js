require("dotenv").config();
const { z } = require("zod");

// Validated once at start-up so misconfiguration fails fast and clearly.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().optional(),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional(),
  // Number of reverse proxies in front of the API (for correct client IPs).
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000),
  SESSION_HOURS: z.coerce.number().min(0.01).max(168).default(8),
  // Secure cookies need HTTPS; defaults on in production.
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${details}`);
}
const env = parsed.data;

const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
for (const origin of corsOrigins) {
  if (!/^https?:\/\/[^/]+$/.test(origin)) {
    throw new Error(
      `Invalid CORS_ORIGIN entry "${origin}": use scheme://host[:port] with no path`
    );
  }
}

module.exports = {
  NODE_ENV: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  port: env.PORT,
  logLevel:
    env.LOG_LEVEL ||
    (env.NODE_ENV === "test" ? "silent" : env.NODE_ENV === "production" ? "info" : "debug"),
  trustProxy: env.TRUST_PROXY,
  rateLimitMax: env.RATE_LIMIT_MAX,
  shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
  sessionHours: env.SESSION_HOURS,
  cookieSecure: env.COOKIE_SECURE
    ? env.COOKIE_SECURE === "true"
    : env.NODE_ENV === "production",
  loginRateLimitMax: env.LOGIN_RATE_LIMIT_MAX,
  corsOrigins,
  // Read lazily so tests can inject an in-memory database URI.
  getMongoUri: () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error(
        "Missing required environment variable MONGODB_URI. Copy server/.env.example to server/.env and set it."
      );
    }
    return uri;
  },
};
