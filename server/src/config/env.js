require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy server/.env.example to server/.env and set it.`
    );
  }
  return value;
}

module.exports = {
  NODE_ENV,
  isProduction: NODE_ENV === "production",
  isTest: NODE_ENV === "test",
  port: Number(process.env.PORT) || 5000,
  // Read lazily so tests can inject an in-memory database URI.
  getMongoUri: () => required("MONGODB_URI"),
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};
