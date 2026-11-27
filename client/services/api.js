// Same-origin by default: Next.js proxies /api/* to the API server (see
// next.config.js), so the session cookie stays first-party.
const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, { status, errors, data } = {}) {
    super(message);
    this.status = status;
    this.errors = errors || [];
    // Some failures (CSV import) carry a full result to show.
    this.data = data;
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
      data: json?.data,
    });
  }
  return json;
}

export const api = {
  me: {
    classes: () => request("GET", "/me/classes"),
    children: () => request("GET", "/me/children"),
    uploadPhoto: (file) => {
      const form = new FormData();
      form.append("photo", file);
      return request("PUT", "/me/photo", { form });
    },
    removePhoto: () => request("DELETE", "/me/photo"),
    changePassword: (currentPassword, newPassword) => request("POST", "/auth/password", { body: { currentPassword, newPassword } }),
  },
  users: {
    list: (params) => request("GET", "/users", { params }),
    create: (body) => request("POST", "/users", { body }),
    update: (id, body) => request("PUT", `/users/${id}`, { body }),
    resetPassword: (id, password) => request("POST", `/users/${id}/password`, { body: { password } }),
    remove: (id) => request("DELETE", `/users/${id}`),
    studentLogins: (body) => request("POST", "/users/student-logins", { body }),
    uploadPhoto: (id, file) => {
      const form = new FormData();
      form.append("photo", file);
      return request("PUT", `/users/${id}/photo`, { form });
    },
  },
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
  shares: {
    list: (box) => request("GET", "/shares", { params: { box } }),
    request: (body) => request("POST", "/shares", { body }),
    decide: (id, body) => request("POST", `/shares/${id}/decision`, { body }),
    revoke: (id) => request("POST", `/shares/${id}/revoke`, { body: {} }),
    withMe: () => request("GET", "/me/shared"),
  },
  identity: {
    aadhaarOffline: (file, shareCode) => {
      const form = new FormData();
      form.append("shareCode", shareCode);
      form.append("file", file);
      return request("POST", "/identity/aadhaar-offline", { form });
    },
  },
  notifications: {
    list: (unread) => request("GET", "/notifications", { params: { unread } }),
    read: (body) => request("POST", "/notifications/read", { body }),
  },
  announcements: {
    list: () => request("GET", "/announcements"),
    create: (body) => request("POST", "/announcements", { body }),
    remove: (id) => request("DELETE", `/announcements/${id}`),
  },
  homework: {
    list: (params) => request("GET", "/homework", { params }),
    create: (body) => request("POST", "/homework", { body }),
    remove: (id) => request("DELETE", `/homework/${id}`),
    submit: (id, body) => request("PUT", `/homework/${id}/submission`, { body }),
    submissions: (id) => request("GET", `/homework/${id}/submissions`),
    review: (id, subId, body) => request("POST", `/homework/${id}/submissions/${subId}/review`, { body }),
  },
  settings: {
    get: (school) => request("GET", `/schools/${school}/settings`),
    save: (school, body) => request("PUT", `/schools/${school}/settings`, { body }),
    calendar: (school, params) => request("GET", `/schools/${school}/calendar`, { params }),
  },
  transport: {
    routes: (params) => request("GET", "/transport/routes", { params }),
    create: (body) => request("POST", "/transport/routes", { body }),
    update: (id, body) => request("PUT", `/transport/routes/${id}`, { body }),
    remove: (id) => request("DELETE", `/transport/routes/${id}`),
    riders: (id) => request("GET", `/transport/routes/${id}/riders`),
    assign: (body) => request("PUT", "/transport/assign", { body }),
  },
  library: {
    books: (params) => request("GET", "/library/books", { params }),
    addBook: (body) => request("POST", "/library/books", { body }),
    updateBook: (id, body) => request("PUT", `/library/books/${id}`, { body }),
    removeBook: (id) => request("DELETE", `/library/books/${id}`),
    issues: (params) => request("GET", "/library/issues", { params }),
    issue: (body) => request("POST", "/library/issues", { body }),
    returnBook: (id, fine) => request("POST", `/library/issues/${id}/return`, { body: fine ? { fine } : {} }),
    settleFine: (id, action) => request("POST", `/library/issues/${id}/fine`, { body: { action } }),
  },
  certificates: {
    list: (params) => request("GET", "/certificates", { params }),
    issue: (body) => request("POST", "/certificates", { body }),
    get: (id) => request("GET", `/certificates/${id}`),
    cancel: (id, reason) => request("POST", `/certificates/${id}/cancel`, { body: { reason } }),
    verify: (code) => request("GET", `/certificates/verify/${code}`),
  },
  timetable: {
    forClass: (params) => request("GET", "/timetable", { params }),
    mine: () => request("GET", "/timetable/mine"),
    set: (body) => request("PUT", "/timetable/slot", { body }),
    clear: (params) => request("DELETE", "/timetable/slot", { params }),
  },
  leave: {
    list: (status) => request("GET", "/leave", { params: { status } }),
    request: (body) => request("POST", "/leave", { body }),
    decide: (id, approve, note) => request("POST", `/leave/${id}/decision`, { body: { approve, note } }),
    cancel: (id) => request("POST", `/leave/${id}/cancel`, { body: {} }),
  },
  results: {
    status: (params) => request("GET", "/results/status", { params }),
    publish: (body) => request("POST", "/results/publish", { body }),
    reportCard: (id, academicYear) => request("GET", `/students/${id}/report-card`, { params: { academicYear } }),
  },
  audit: { list: (params) => request("GET", "/audit", { params }) },
  promotion: { run: (body) => request("POST", "/promotion", { body }) },
  register: {
    get: (params) => request("GET", "/attendance/register", { params }),
    save: (body) => request("PUT", "/attendance/register", { body }),
  },
  reports: {
    list: () => request("GET", "/reports"),
    get: (name, params) => request("GET", `/reports/${name}`, { params }),
    // Same-origin link; the browser sends the session cookie with it.
    csvUrl: (name, params) => {
      const qs = new URLSearchParams(Object.entries({ ...params, format: "csv" }).filter(([, v]) => v !== "" && v != null));
      return `${BASE_URL}/reports/${name}?${qs}`;
    },
  },
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
    importCsv: (file, dryRun) => {
      const form = new FormData();
      form.append("file", file);
      return request("POST", "/students/import", { form, params: { dryRun } });
    },
    importTemplateUrl: () => `${BASE_URL}/students/import/template`,
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
    services: (id) => request("GET", `/students/${id}/services`),
  },
};
