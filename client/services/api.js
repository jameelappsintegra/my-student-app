const BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, { status, errors } = {}) {
    super(message);
    this.status = status;
    this.errors = errors || [];
  }

  // { "father.phone": "Enter a valid phone number", ... }
  fieldErrors() {
    return Object.fromEntries(this.errors.map((e) => [e.field, e.message]));
  }
}

function toQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

async function request(method, path, { body, params } = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}${toQuery(params)}`, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      "Cannot reach the EduPro server. Check that it is running and try again."
    );
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new ApiError(json?.message || `Request failed (${res.status})`, {
      status: res.status,
      errors: json?.errors,
    });
  }
  return json;
}

export const api = {
  dashboard: () => request("GET", "/dashboard"),
  admissions: {
    list: (params) => request("GET", "/admissions", { params }),
    get: (id) => request("GET", `/admissions/${id}`),
    create: (body) => request("POST", "/admissions", { body }),
    setStatus: (id, status, note) =>
      request("PATCH", `/admissions/${id}/status`, { body: { status, note } }),
    enroll: (id, body) =>
      request("POST", `/admissions/${id}/enroll`, { body }),
  },
  students: {
    list: (params) => request("GET", "/students", { params }),
  },
};
