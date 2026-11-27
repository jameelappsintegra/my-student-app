import { useState } from "react";
import Link from "next/link";
import Layout from "../../components/layout/layout";
import { Card, Dialog, EmptyState, ErrorState, Loading, NoAccess, Notice, PageHeader } from "../../components/common";
import SchoolSelect from "../../components/forms/SchoolSelect";
import StudentPicker from "../../components/forms/StudentPicker";
import useApi from "../../hooks/useApi";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { CERTIFICATE_TYPES, formatDate, todayIso } from "../../constants";

function IssueDialog({ onClose, onSaved }) {
  const [student, setStudent] = useState(null);
  const [f, setF] = useState({ type: "bonafide", purpose: "", reason: "", conduct: "Good", leavingDate: todayIso(), remarks: "" });
  const [dues, setDues] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (ignoreDues) => {
    setBusy(true); setError(null);
    const body = { student: student.id, type: f.type, remarks: f.remarks || undefined };
    if (f.type === "bonafide" || f.type === "study") body.purpose = f.purpose || undefined;
    if (f.type === "transfer") Object.assign(body, { reason: f.reason || undefined, conduct: f.conduct || undefined, leavingDate: f.leavingDate || undefined, ...(ignoreDues ? { ignoreDues: true } : {}) });
    if (f.type === "character") body.conduct = f.conduct || undefined;
    try {
      const r = await api.certificates.issue(body);
      onSaved(r.message, r.data.id);
    } catch (err) {
      if (err.status === 409 && err.errors?.some((e) => e.field === "ignoreDues")) setDues(err.message);
      else setError(err.errors?.length ? err.errors.map((e) => e.message).join(". ") : err.message);
      setBusy(false);
    }
  };
  return (
    <Dialog title="Issue a certificate" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button>{dues
        ? <button className={`btn btn-warning ${busy ? "loading" : ""}`} disabled={busy} onClick={() => submit(true)}>Issue TC with dues</button>
        : <button className={`btn btn-primary ${busy ? "loading" : ""}`} disabled={busy || !student} onClick={() => submit(false)}>Issue</button>}</>}>
      <div className="grid gap-3">
        <StudentPicker value={student} onChange={(s) => { setStudent(s); setDues(null); }} />
        <label className="form-control"><span className="label-text mb-1">Certificate</span>
          <select className="select select-bordered select-sm" value={f.type} onChange={(e) => { setF({ ...f, type: e.target.value }); setDues(null); }}>
            {Object.entries(CERTIFICATE_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        {(f.type === "bonafide" || f.type === "study") && <label className="form-control"><span className="label-text mb-1">Purpose</span><input className="input input-bordered input-sm" value={f.purpose} onChange={set("purpose")} placeholder="Passport, scholarship, bank account…" /></label>}
        {f.type === "transfer" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="form-control sm:col-span-2"><span className="label-text mb-1">Reason for leaving</span><input className="input input-bordered input-sm" value={f.reason} onChange={set("reason")} placeholder="Family relocating" /></label>
            <label className="form-control"><span className="label-text mb-1">Date of leaving</span><input type="date" className="input input-bordered input-sm" value={f.leavingDate} onChange={set("leavingDate")} /></label>
            <label className="form-control"><span className="label-text mb-1">Conduct</span><input className="input input-bordered input-sm" value={f.conduct} onChange={set("conduct")} /></label>
          </div>
        )}
        {f.type === "character" && <label className="form-control"><span className="label-text mb-1">Conduct</span><input className="input input-bordered input-sm" value={f.conduct} onChange={set("conduct")} /></label>}
        <label className="form-control"><span className="label-text mb-1">Remarks (optional)</span><input className="input input-bordered input-sm" value={f.remarks} onChange={set("remarks")} /></label>
      </div>
      {f.type === "transfer" && !dues && <p className="text-xs text-slate-500 mt-2">Issuing a TC marks the student as transferred. Cancelling the TC puts them back on the roll.</p>}
      {dues && <div className="alert alert-warning mt-3 py-2" role="alert"><span>{dues}</span></div>}
      {error && <div className="alert alert-error mt-3 py-2" role="alert"><span>{error}</span></div>}
    </Dialog>
  );
}

export default function Certificates() {
  const { can } = useAuth();
  const [school, setSchool] = useState("");
  const [type, setType] = useState("");
  const { data, loading, error, reload } = useApi(() => api.certificates.list({ school: school || undefined, type: type || undefined }), [school, type]);
  const [dialog, setDialog] = useState(false);
  const [notice, setNotice] = useState(null);
  if (!can("certificates.issue")) return <Layout title="Certificates"><NoAccess /></Layout>;
  return (
    <Layout title="Certificates">
      <PageHeader title="Certificates" subtitle="Transfer, bonafide, character and study certificates, with a verification code on each." actions={<button className="btn btn-primary" onClick={() => setDialog(true)}>Issue certificate</button>} />
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div className="w-64"><SchoolSelect value={school} onChange={setSchool} allowAll /></div>
        <label className="form-control"><span className="label-text mb-1">Type</span>
          <select className="select select-bordered select-sm" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option>
            {Object.entries(CERTIFICATE_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.length === 0 ? <Card><EmptyState title="No certificates yet" /></Card> : (
        <Card className="p-0 sm:p-0 overflow-x-auto">
          <table className="table w-full">
            <thead><tr><th>Serial</th><th>Student</th><th>Type</th><th>Issued</th><th /></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono text-sm">{c.serialNumber}</td>
                  <td>{c.snapshot?.name}<p className="text-xs text-slate-400">{c.snapshot?.admissionNumber}</p></td>
                  <td>{c.label}{c.status === "cancelled" && <span className="badge badge-error badge-sm ml-2">Cancelled</span>}</td>
                  <td>{formatDate(c.issuedAt)}<p className="text-xs text-slate-400">{c.issuedBy}</p></td>
                  <td className="text-right"><Link href={`/certificates/${c.id}`}><a className="btn btn-sm">Open</a></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {dialog && <IssueDialog onClose={() => setDialog(false)} onSaved={(m) => { setDialog(false); setNotice(m); reload(); }} />}
    </Layout>
  );
}
