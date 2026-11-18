import { useState } from "react";
import Link from "next/link";
import Layout from "../../components/layout/layout";
import { Card, ConfirmDialog, Dialog, EmptyState, ErrorState, Loading, Notice, PageHeader } from "../../components/common";
import useApi from "../../hooks/useApi";
import { api, ApiError } from "../../services/api";
import { SCHOOL_BOARDS } from "../../constants";

const blank = { name: "", code: "", board: "State Board", address: "", city: "", phone: "", email: "", principalName: "", active: true };

function SchoolDialog({ school, onClose, onSaved }) {
  const [f, setF] = useState(school ? { ...blank, ...Object.fromEntries(Object.entries(school).filter(([k]) => k in blank).map(([k, v]) => [k, v ?? ""])) } : blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const input = (k, extra = {}) => (
    <label className="form-control" key={k}>
      <span className="label-text mb-1">{extra.label}</span>
      <input
        className={`input input-bordered ${errors[k] ? "input-error" : ""}`}
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        {...(extra.props || {})}
      />
      {errors[k] && <span className="text-error text-xs mt-1">{errors[k]}</span>}
    </label>
  );
  const save = async () => {
    setBusy(true);
    setError(null);
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
    try {
      const res = school ? await api.schools.update(school.id, body) : await api.schools.create(body);
      onSaved(res.message);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setError(err);
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={school ? `Edit ${school.name}` : "Add school"}
      onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className={`btn btn-primary ${busy ? "loading" : ""}`} onClick={save} disabled={busy}>Save</button></>}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">{input("name", { label: "School name *" })}</div>
        {input("code", { label: "Short code *", props: { maxLength: 8, autoCapitalize: "characters", placeholder: "GVPS" } })}
        <label className="form-control">
          <span className="label-text mb-1">Board</span>
          <select className="select select-bordered" value={f.board} onChange={(e) => setF({ ...f, board: e.target.value })}>
            {SCHOOL_BOARDS.map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        {input("principalName", { label: "Principal" })}
        {input("city", { label: "Town / city" })}
        <div className="sm:col-span-2">{input("address", { label: "Address" })}</div>
        {input("phone", { label: "Phone", props: { type: "tel" } })}
        {input("email", { label: "Email", props: { type: "email" } })}
        <label className="label cursor-pointer justify-start gap-3 sm:col-span-2">
          <input type="checkbox" className="toggle toggle-primary" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
          <span className="label-text">Accepting new students</span>
        </label>
      </div>
      <p className="text-xs text-slate-500 mt-2">The short code starts every admission number (e.g. {f.code || "GVPS"}-2026-00001) and can&apos;t change once students exist.</p>
      {error && <div className="alert alert-error mt-3 py-2" role="alert"><span>{error.message}</span></div>}
    </Dialog>
  );
}

export default function Schools() {
  const { data, loading, error, reload } = useApi(() => api.schools.list({ limit: 100 }), []);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [delError, setDelError] = useState(null);
  const done = (msg) => { setDialog(null); setNotice(msg); reload(); };

  return (
    <Layout title="Schools">
      <PageHeader title="Schools" subtitle="Schools managed in EduPro." actions={<button className="btn btn-primary" onClick={() => setDialog({ kind: "edit" })}>Add school</button>} />
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <Card><EmptyState title="No schools yet" message="Add your first school, then add students to it." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s) => (
            <Card key={s.id}>
              <div className="flex justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900">{s.name}</h2>
                  <p className="text-xs text-slate-500">{s.code} · {s.board}{s.city ? ` · ${s.city}` : ""}</p>
                </div>
                {!s.active && <span className="badge badge-ghost badge-sm shrink-0">Inactive</span>}
              </div>
              <p className="text-3xl font-semibold mt-3 tabular-nums">{s.activeStudents}</p>
              <p className="text-xs text-slate-500">active students</p>
              {s.principalName && <p className="text-sm text-slate-600 mt-2">Principal: {s.principalName}</p>}
              {s.phone && <p className="text-sm"><a className="link link-primary" href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a></p>}
              <div className="flex flex-wrap gap-2 mt-4">
                <Link href={`/students?school=${s.id}`}><a className="btn btn-sm">View students</a></Link>
                <button className="btn btn-sm btn-ghost" onClick={() => setDialog({ kind: "edit", school: s })}>Edit</button>
                <button className="btn btn-sm btn-ghost text-error" onClick={() => { setDelError(null); setDialog({ kind: "delete", school: s }); }}>Delete</button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {dialog?.kind === "edit" && <SchoolDialog school={dialog.school} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.school.name}?`}
          message="Only schools with no students or admissions can be deleted. For a school with records, edit it and turn off “Accepting new students” instead."
          busy={busy}
          error={delError}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            setBusy(true);
            try { await api.schools.remove(dialog.school.id); done("School deleted"); } catch (err) { setDelError(err); } finally { setBusy(false); }
          }}
        />
      )}
    </Layout>
  );
}
