// Starts a throwaway MongoDB replica set, the API, and a production build of
// the web app, runs the Playwright suite against them, then cleans up.
//   npm test                 # full run
//   npm test -- --headed     # extra args go to `playwright test`
const { spawn, spawnSync } = require("child_process");
const path = require("path");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const ROOT = path.resolve(__dirname, "..");
const API_PORT = process.env.E2E_API_PORT || "5055";
const WEB_PORT = process.env.E2E_WEB_PORT || "3055";
const API_URL = `http://localhost:${API_PORT}/api`;
// Throwaway credentials for the throwaway test database.
const E2E_ADMIN = { username: "e2e-admin", password: "e2e-password-only-for-tests" };
const WEB_URL = `http://localhost:${WEB_PORT}`;
const children = [];

const NEXT_BIN = path.join(ROOT, "client", "node_modules", "next", "dist", "bin", "next");

// Each child gets its own process group so cleanup also stops grandchildren.
function start(cmd, args, cwd, env) {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  child.stderr.on("data", (d) => process.stderr.write(`[${path.basename(cwd)}] ${d}`));
  children.push(child);
  return child;
}

async function waitFor(url, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function cleanup() {
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGTERM");
    } catch {}
  }
}

async function assertPortFree(url) {
  try {
    await fetch(url);
  } catch {
    return;
  }
  throw new Error(`${url} is already in use. Stop the old process or set E2E_API_PORT / E2E_WEB_PORT.`);
}

(async () => {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: process.env.MONGOMS_VERSION ? { version: process.env.MONGOMS_VERSION } : undefined,
  });
  let code = 1;
  try {
    await assertPortFree(WEB_URL);
    await assertPortFree(`http://localhost:${API_PORT}`);
    const mongoUri = replSet.getUri("edupro_e2e");
    const admin = spawnSync("node", ["scripts/create-admin.js", E2E_ADMIN.username, "E2E Admin"], {
      cwd: path.join(ROOT, "server"),
      env: { ...process.env, MONGODB_URI: mongoUri, EDUPRO_ADMIN_PASSWORD: E2E_ADMIN.password },
      stdio: "inherit",
    });
    if (admin.status !== 0) throw new Error("create-admin failed");

    console.log("Building web app…");
    const build = spawnSync("node", [NEXT_BIN, "build"], {
      cwd: path.join(ROOT, "client"),
      env: { ...process.env, API_INTERNAL_URL: `http://localhost:${API_PORT}`, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "inherit",
    });
    if (build.status !== 0) throw new Error("next build failed");

    start("node", ["src/server.js"], path.join(ROOT, "server"), {
      NODE_ENV: "production",
      PORT: API_PORT,
      MONGODB_URI: mongoUri,
      CORS_ORIGIN: WEB_URL,
      // Plain http://localhost in tests; production keeps Secure cookies.
      COOKIE_SECURE: "false",
      TRUST_PROXY: "1",
      LOGIN_RATE_LIMIT_MAX: "1000",
      LOG_LEVEL: "warn",
      RATE_LIMIT_MAX: "10000",
    });
    start("node", [NEXT_BIN, "start", "-p", WEB_PORT], path.join(ROOT, "client"), {});
    await Promise.all([waitFor(`${API_URL}/ready`), waitFor(WEB_URL)]);

    const run = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
      cwd: __dirname,
      env: {
        ...process.env,
        E2E_WEB_URL: WEB_URL,
        E2E_ADMIN_USERNAME: E2E_ADMIN.username,
        E2E_ADMIN_PASSWORD: E2E_ADMIN.password,
      },
      stdio: "inherit",
    });
    code = run.status ?? 1;
  } catch (err) {
    console.error(err.message);
  } finally {
    cleanup();
    await replSet.stop();
  }
  process.exit(code);
})();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    cleanup();
    process.exit(130);
  });
}
