const mongoose = require("mongoose");
const sanitize = require("../../src/middleware/sanitize");
const { errorHandler } = require("../../src/middleware/errorHandler");
const ApiError = require("../../src/utils/ApiError");

function run(err) {
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  const req = { log: { error: jest.fn() } };
  errorHandler(err, req, res, () => {});
  return { res, req };
}

describe("sanitize", () => {
  test("removes operator and dotted keys at any depth", () => {
    const req = {
      body: { name: "a", $where: "1", nested: { $gt: 1, ok: 2, "a.b": 3 }, list: [{ $ne: 1, v: 1 }] },
      query: { status: { $ne: "x" }, page: "1" },
    };
    sanitize(req, {}, () => {});
    expect(req.body).toEqual({ name: "a", nested: { ok: 2 }, list: [{ v: 1 }] });
    expect(req.query).toEqual({ status: {}, page: "1" });
  });
});

describe("errorHandler", () => {
  test("passes through ApiError details", () => {
    const { res } = run(ApiError.badRequest("Bad", [{ field: "x", message: "y" }]));
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, message: "Bad", errors: [{ field: "x", message: "y" }] });
  });

  test("maps Mongo errors to client errors", () => {
    expect(run(new mongoose.Error.CastError("ObjectId", "x", "_id")).res.statusCode).toBe(400);
    expect(run(Object.assign(new Error("E11000"), { code: 11000, keyPattern: { rollNumber: 1 } })).res.body.message).toMatch(/roll number/);
    expect(run(Object.assign(new Error("E11000"), { code: 11000 })).res.statusCode).toBe(409);
    expect(run(new mongoose.Error.VersionError({ _id: 1 }, 1, [])).res.statusCode).toBe(409);
    expect(run(Object.assign(new Error("x"), { type: "entity.parse.failed", statusCode: 400 })).res.statusCode).toBe(400);
  });

  test("hides internal error details and logs them", () => {
    const { res, req } = run(new Error("connection string mongodb://user:pass@host leaked"));
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/mongodb|pass|stack/);
    expect(req.log.error).toHaveBeenCalled();
  });
});
