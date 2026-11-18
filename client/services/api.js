// Same-origin by default: Next.js proxies /api/* to the API server (see
// next.config.js), so the session cookie stays first-party.
const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/$/, "");

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

async function request(method, path, { body, params, form } = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}${toQuery(params)}`, {
      method,
      credentials: "include",
      // Uploads are multipart; the header lets the API accept them (CSRF check).
      headers: form
        ? { "X-Requested-With": "EduPro" }
        : body
        ? { "Content-Type": "application/json" }
        : undefined,
      body: form || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(
      "Cannot reach the EduPro server. Check that it is running and try again."
    );
  }

  const json = await res.json().catch(() => null);
  if (res.status === 401 && !path.startsWith("/auth/") && typeof window !== "undefined") {
    // Session expired or missing: send the user to sign in, then back here.
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/login?next=${next}`);
  }
  if (!res.ok || !json?.success) {
    throw new ApiError(json?.message || `Request failed (${res.status})`, {
      status: res.status,
      errors: json?.errors,
    });
  }
  return json;
}

export const api = {
  auth: {
    me: () => request("GET", "/auth/me"),
    login: (username, password) =>
      request("POST", "/auth/login", { body: { username, password } }),
    logout: () => request("POST", "/auth/logout", { body: {} }),
  },
  dashboard: (school) => request("GET", "/dashboard", { params: { school } }),
  admissions: {
    list: (params) => request("GET", "/admissions", { params }),
    get: (id) => request("GET", `/admissions/${id}`),
    create: (body) => request("POST", "/admissions", { body }),
    setStatus: (id, status, note) =>
      request("PATCH", `/admissions/${id}/status`, { body: { status, note } }),
    enroll: (id, body) =>
      request("POST", `/admissions/${id}/enroll`, { body }),
  },
  search: (q) => request("GET", "/search", { params: { q } }),
  schools: {
    list: (params) => request("GET", "/schools", { params }),
    create: (body) => request("POST", "/schools", { body }),
    update: (id, body) => request("PUT", `/schools/${id}`, { body }),
    remove: (id) => request("DELETE", `/schools/${id}`),
  },
  students: {
    list: (params) => request("GET", "/students", { params }),
    get: (id) => request("GET", `/students/${id}`),
    create: (body) => request("POST", "/students", { body }),
    update: (id, body) => request("PUT", `/students/${id}`, { body }),
    setStatus: (id, status) => request("PATCH", `/students/${id}/status`, { body: { status } }),
    remove: (id) => request("DELETE", `/students/${id}`),
    uploadPhoto: (id, file) => {
      const form = new FormData();
      form.append("photo", file);
      return request("PUT", `/students/${id}/photo`, { form });
    },
    removePhoto: (id) => request("DELETE", `/students/${id}/photo`),
    attendance: (id, params) => request("GET", `/students/${id}/attendance`, { params }),
    markAttendance: (id, date, status, note) =>
      request("PUT", `/students/${id}/attendance/${date}`, { body: { status, note } }),
    clearAttendance: (id, date) => request("DELETE", `/students/${id}/attendance/${date}`),
    results: (id) => request("GET", `/students/${id}/results`),
    createResult: (id, body) => request("POST", `/students/${id}/results`, { body }),
    updateResult: (id, rid, body) => request("PUT", `/students/${id}/results/${rid}`, { body }),
    deleteResult: (id, rid) => request("DELETE", `/students/${id}/results/${rid}`),
    fees: (id) => request("GET", `/students/${id}/fees`),
    createFee: (id, body) => request("POST", `/students/${id}/fees`, { body }),
    deleteFee: (id, fid) => request("DELETE", `/students/${id}/fees/${fid}`),
    recordPayment: (id, fid, body) => request("POST", `/students/${id}/fees/${fid}/payments`, { body }),
    removePayment: (id, fid, pid) => request("DELETE", `/students/${id}/fees/${fid}/payments/${pid}`),
  },
};
