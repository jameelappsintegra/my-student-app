describe("environment config", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    jest.resetModules();
  });
  const load = () => require("../../src/config/env");

  test("parses defaults and CORS list", () => {
    process.env.CORS_ORIGIN = "http://localhost:3000, https://app.example.com";
    const env = load();
    expect(env.corsOrigins).toEqual(["http://localhost:3000", "https://app.example.com"]);
    expect(env.port).toBe(5000);
  });

  test.each([
    [{ PORT: "abc" }, /PORT/],
    [{ NODE_ENV: "staging" }, /NODE_ENV/],
    [{ CORS_ORIGIN: "https://app.example.com/path" }, /CORS_ORIGIN/],
    [{ CORS_ORIGIN: "*" }, /CORS_ORIGIN/],
  ])("rejects %p", (vars, msg) => {
    Object.assign(process.env, vars);
    expect(load).toThrow(msg);
  });

  test("getMongoUri explains a missing value", () => {
    delete process.env.MONGODB_URI;
    expect(() => load().getMongoUri()).toThrow(/MONGODB_URI/);
  });
});
