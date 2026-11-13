import { api, ApiError } from "../services/api";

const reply = (status, body) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

afterEach(() => jest.resetAllMocks());

test("sends JSON with credentials and drops empty query params", async () => {
  global.fetch = jest.fn(() => reply(200, { success: true, data: [] }));
  await api.students.list({ page: 2, search: "", className: undefined, section: "A" });
  const [url, opts] = fetch.mock.calls[0];
  expect(url).toBe("/api/students?page=2&section=A");
  expect(opts.credentials).toBe("include");

  await api.admissions.create({ firstName: "A" });
  const [, post] = fetch.mock.calls[1];
  expect(post.method).toBe("POST");
  expect(post.headers["Content-Type"]).toBe("application/json");
  expect(JSON.parse(post.body)).toEqual({ firstName: "A" });
});

test("turns server errors into ApiError with field errors", async () => {
  global.fetch = jest.fn(() =>
    reply(400, {
      success: false,
      message: "Validation failed",
      errors: [{ field: "father.phone", message: "Enter a valid phone number" }],
    })
  );
  const err = await api.admissions.create({}).catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(400);
  expect(err.fieldErrors()).toEqual({ "father.phone": "Enter a valid phone number" });
});

test("a 401 on a data call sends the user to sign in", async () => {
  delete window.location;
  window.location = { assign: jest.fn(), pathname: "/myclass", search: "?className=2" };
  global.fetch = jest.fn(() => reply(401, { success: false, message: "Please sign in to continue." }));
  await expect(api.students.list()).rejects.toThrow("Please sign in");
  expect(window.location.assign).toHaveBeenCalledWith("/login?next=%2Fmyclass%3FclassName%3D2");

  // Failed sign-in attempts do not redirect.
  window.location.assign.mockClear();
  await expect(api.auth.login("a", "b")).rejects.toThrow();
  expect(window.location.assign).not.toHaveBeenCalled();
});

test("explains network failures and non-JSON responses", async () => {
  global.fetch = jest.fn(() => Promise.reject(new TypeError("Failed to fetch")));
  await expect(api.dashboard()).rejects.toThrow(/Cannot reach the EduPro server/);

  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new Error("html")) })
  );
  await expect(api.dashboard()).rejects.toThrow("Request failed (502)");
});
