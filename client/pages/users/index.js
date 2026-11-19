import { useRef, useState } from "react";
import Layout from "../../components/layout/layout";
import { Avatar, Card, ConfirmDialog, Dialog, EmptyState, ErrorState, Loading, NoAccess, Notice, PageHeader } from "../../components/common";
import useApi from "../../hooks/useApi";
import useSchools from "../../hooks/useSchools";
import { useAuth } from "../../context/auth";
import { api, ApiError } from "../../services/api";
import { CLASSES, classLabel } from "../../constants";

const ROLES = [
  ["teacher", "Teachers"],
  ["principal", "Principals"],
  ["parent", "Parents"],
  ["admin", "Admins"],
];
const ROLE_HELP = {
  admin: "Full access to every school.",
  principal: "Sees everything in their schools: dashboard, students, attendance, results, fees and reports. Approves record-sharing requests.",
  teacher: "Sees only their assigned classes. Marks attendance and enters marks.",
  parent: "Sees only their own children, read-only. Can update their child's photo.",
};

function ChildPicker({ value, onChange }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const search = async (text) => {
    setQ(text);
    if (text.trim().length < 2) return setResults([]);
    try {
      setResults((await api.search(text.trim())).data);
    } catch {
      setResults([]);
    }
    return undefined;
  };
  return (
    <div>
      <ul className="flex flex-wrap gap-2 mb-2">
        {value.map((c) => (
          <li key={c.id} className="badge badge-lg gap-2">
            {c.name} <span className="text-xs opacity-70">{c.admissionNumber}</span>
            <button type="button" aria-label={`Remove ${c.name}`} onClick={() => onChange(value.filter((x) => x.id !== c.id))}>✕</button>
          </li>
        ))}
      </ul>
      <input className="input input-bordered input-sm w-full" placeholder="Search a child by name or admission number" value={q} onChange={(e) => search(e.target.value)} aria-label="Find child" />
      {results.length > 0 && (
        <ul className="border border-slate-200 rounded-lg mt-1 max-h-40 overflow-auto">
          {results.filter((r) => !value.some((v) => v.id === r.id)).map((r) => (
            <li key={r.id}>
              <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50" onClick={() => { onChange([...value, { id: r.id, name: `${r.firstName} ${r.lastName}`, admissionNumber: r.admissionNumber }]); setQ(""); setResults([]); }}>
                {r.firstName} {r.lastName} <span className="text-xs text-slate-500">{r.admissionNumber} · {classLabel(r.className)} {r.section || ""} · {r.school?.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UserDialog({ user, role: initialRole, onClose, onSaved }) {
  const { schools } = useSchools();
  const isNew = !user;
  const [f, setF] = useState(() => ({
    role: user?.role || initialRole,
    name: user?.name || "",
    username: user?.username || "",
    password: "",
    phone: user?.phone || "",
    active: user?.active ?? true,
    assignments: (user?.assignments || []).map((a) => ({ school: a.school, className: a.className, section: a.section || "" })),
    schools: user?.schools || [],
    children: user?.childDetails || [],
    canImport: (user?.grants || []).includes("students.import"),
  }));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setBusy(true);
    setError(null);
    const body = { name: f.name.trim(), phone: f.phone.trim(), active: f.active };
    if (f.role === "teacher") body.assignments = f.assignments.filter((a) => a.school && a.className).map((a) => ({ ...a, section: a.section.trim() }));
    if (f.role === "principal") body.schools = f.schools;
    if (f.role === "parent") body.children = f.children.map((c) => c.id);
    if (f.role === "teacher" || f.role === "principal") body.grants = f.canImport ? ["students.import"] : [];
    try {
      const res = isNew
        ? await api.users.create({ ...body, role: f.role, username: f.username.trim(), password: f.password })
        : await api.users.update(user.id, body);
      onSaved(res.message);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setError(err);
      setBusy(false);
    }
  };

  const field = (k, label, props = {}) => (
    <label className="form-control" key={k}>
      <span className="label-text mb-1">{label}</span>
      <input className={`input input-bordered ${errors[k] ? "input-error" : ""}`} value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} />
      {errors[k] && <span className="text-error text-xs mt-1">{errors[k]}</span>}
    </label>
  );

  return (
    <Dialog
      title={isNew ? `New ${f.role}` : `Edit ${user.name}`}
      onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className={`btn btn-primary ${busy ? "loading" : ""}`} onClick={save} disabled={busy}>Save</button></>}
    >
      <p className="text-sm text-slate-500 mb-3">{ROLE_HELP[f.role]}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {field("name", "Full name")}
        {field("phone", "Phone", { type: "tel" })}
        {isNew && field("username", "Username", { autoCapitalize: "none", placeholder: "e.g. meera.k" })}
        {isNew && field("password", "Temporary password", { type: "text", placeholder: "At least 12 characters" })}
      </div>

      {f.role === "teacher" && (
        <div className="mt-4">
          <p className="font-medium text-sm mb-2">Classes taught</p>
          {f.assignments.map((a, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_4rem_2rem] gap-2 mb-2">
              <select className="select select-bordered select-sm" aria-label="School" value={a.school} onChange={(e) => set("assignments", f.assignments.map((x, j) => (j === i ? { ...x, school: e.target.value } : x)))}>
                <option value="">School…</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select className="select select-bordered select-sm" aria-label="Class" value={a.className} onChange={(e) => set("assignments", f.assignments.map((x, j) => (j === i ? { ...x, className: e.target.value } : x)))}>
                <option value="">Class…</option>
                {CLASSES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <input className="input input-bordered input-sm" aria-label="Section" placeholder="All" maxLength={5} value={a.section} onChange={(e) => set("assignments", f.assignments.map((x, j) => (j === i ? { ...x, section: e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase() } : x)))} />
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Remove class" onClick={() => set("assignments", f.assignments.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set("assignments", [...f.assignments, { school: schools[0]?.id || "", className: "", section: "" }])}>+ Add class</button>
          {errors.assignments && <p className="text-error text-xs">{errors.assignments}</p>}
        </div>
      )}
      {f.role === "principal" && (
        <div className="mt-4">
          <p className="font-medium text-sm mb-2">Schools they head</p>
          {schools.map((s) => (
            <label key={s.id} className="label cursor-pointer justify-start gap-3 py-1">
              <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={f.schools.includes(s.id)} onChange={(e) => set("schools", e.target.checked ? [...f.schools, s.id] : f.schools.filter((x) => x !== s.id))} />
              <span className="label-text">{s.name}</span>
            </label>
          ))}
        </div>
      )}
      {f.role === "parent" && (
        <div className="mt-4">
          <p className="font-medium text-sm mb-2">Children</p>
          <ChildPicker value={f.children} onChange={(v) => set("children", v)} />
          {errors.children && <p className="text-error text-xs">{errors.children}</p>}
        </div>
      )}
      {(f.role === "teacher" || f.role === "principal") && (
        <label className="label cursor-pointer justify-start gap-3 mt-3">
          <input type="checkbox" className="toggle toggle-primary" checked={f.canImport} onChange={(e) => set("canImport", e.target.checked)} />
          <span className="label-text">Can import students from CSV {f.role === "teacher" ? "(into their own classes)" : "(into their schools)"}</span>
        </label>
      )}
      {!isNew && (
        <label className="label cursor-pointer justify-start gap-3">
          <input type="checkbox" className="toggle toggle-success" checked={f.active} onChange={(e) => set("active", e.target.checked)} />
          <span className="label-text">Account active (turning this off signs them out at once)</span>
        </label>
      )}
      {error && <div className="alert alert-error mt-3 py-2" role="alert"><span>{error.message}</span></div>}
    </Dialog>
  );
}

function PasswordDialog({ user, onClose, onSaved }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <Dialog
      title={`Reset password for ${user.name}`}
      onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className={`btn btn-primary ${busy ? "loading" : ""}`} disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try { const r = await api.users.resetPassword(user.id, pw); onSaved(r.message); } catch (err) { setError(err.errors?.[0] || err); setBusy(false); }
      }}>Reset password</button></>}
    >
      <label className="form-control">
        <span className="label-text mb-1">New temporary password (12+ characters)</span>
        <input className="input input-bordered" value={pw} onChange={(e) => setPw(e.target.value)} />
      </label>
      <p className="text-xs text-slate-500 mt-2">They are signed out everywhere. Give them the new password in person or by phone, and ask them to change it from My account.</p>
      {error && <div className="alert alert-error mt-3 py-2"><span>{error.message}</span></div>}
    </Dialog>
  );
}

export default function Users() {
  const { can, user: me } = useAuth();
  const [role, setRole] = useState("teacher");
  const { data, loading, error, reload } = useApi(() => (can("users.manage") ? api.users.list({ role }) : Promise.resolve({ data: [] })), [role]);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [delError, setDelError] = useState(null);
  const fileRef = useRef(null);
  const [photoFor, setPhotoFor] = useState(null);
  const done = (msg) => { setDialog(null); setNotice(msg); reload(); };

  if (!can("users.manage")) return <Layout title="Users"><NoAccess /></Layout>;
  return (
    <Layout title="Users">
      <PageHeader title="Users" subtitle="Accounts for staff and parents." actions={<button className="btn btn-primary" onClick={() => setDialog({ kind: "edit" })}>New {role}</button>} />
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      <div className="overflow-x-auto mb-4">
        <div className="tabs tabs-boxed bg-white border border-slate-200 inline-flex flex-nowrap" role="tablist">
          {ROLES.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={role === k} className={`tab whitespace-nowrap ${role === k ? "tab-active" : ""}`} onClick={() => setRole(k)}>{label}</button>
          ))}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Choose photo" onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file || !photoFor) return;
        try { await api.users.uploadPhoto(photoFor.id, file); setNotice(`Photo updated for ${photoFor.name}`); reload(); } catch (err) { setNotice(err.message); }
        e.target.value = "";
      }} />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <Card><EmptyState title={`No ${role}s yet`} message={ROLE_HELP[role]} /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((u) => (
            <Card key={u.id}>
              <div className="flex items-start gap-3">
                <button className="shrink-0" aria-label={`Change photo of ${u.name}`} onClick={() => { setPhotoFor(u); fileRef.current?.click(); }}>
                  <Avatar person={u} size="w-12 h-12" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 truncate">{u.name} {!u.active && <span className="badge badge-ghost badge-sm">Inactive</span>}</p>
                  <p className="text-xs text-slate-500">@{u.username}{u.phone ? ` · ${u.phone}` : ""}</p>
                  {u.assignments?.length > 0 && <p className="text-sm text-slate-600 mt-1">{u.assignments.map((a) => `${a.schoolCode} ${classLabel(a.className)}${a.section ? ` ${a.section}` : ""}`).join(", ")}</p>}
                  {u.schoolDetails?.length > 0 && <p className="text-sm text-slate-600 mt-1">{u.schoolDetails.map((s) => s.name).join(", ")}</p>}
                  {u.childDetails?.length > 0 && <p className="text-sm text-slate-600 mt-1">Children: {u.childDetails.map((c) => c.name).join(", ")}</p>}
                  {u.grants?.includes("students.import") && <span className="badge badge-primary badge-outline badge-sm mt-1">Can import students</span>}
                  {u.lastLoginAt && <p className="text-xs text-slate-400 mt-1">Last sign-in {new Date(u.lastLoginAt).toLocaleString()}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 justify-end">
                <button className="btn btn-sm" onClick={() => setDialog({ kind: "edit", user: u })}>Edit</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setDialog({ kind: "password", user: u })}>Reset password</button>
                {u.id !== me?.id && <button className="btn btn-sm btn-ghost text-error" onClick={() => { setDelError(null); setDialog({ kind: "delete", user: u }); }}>Delete</button>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {dialog?.kind === "edit" && <UserDialog user={dialog.user} role={role} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === "password" && <PasswordDialog user={dialog.user} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.user.name}'s account?`}
          message="They lose access immediately. To keep their history, turn the account off from Edit instead."
          busy={busy} error={delError} onClose={() => setDialog(null)}
          onConfirm={async () => { setBusy(true); try { await api.users.remove(dialog.user.id); done("Account deleted"); } catch (err) { setDelError(err); } finally { setBusy(false); } }}
        />
      )}
    </Layout>
  );
}
