import { useState } from "react";
import Layout from "../../components/layout/layout";
import { Card, Dialog, EmptyState, ErrorState, Loading, NoAccess, Notice, PageHeader } from "../../components/common";
import useApi from "../../hooks/useApi";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { classLabel, formatDate, todayIso } from "../../constants";

const TONE = { pending: "badge-warning", approved: "badge-success", rejected: "badge-error", cancelled: "badge-ghost" };

function RequestLeave({ onDone }) {
  const { data: kids } = useApi(() => api.me.children(), []);
  const [f, setF] = useState({ student: "", from: todayIso(), to: todayIso(), reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const student = f.student || kids?.[0]?.id || "";
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try { const r = await api.leave.request({ ...f, student, reason: f.reason.trim() }); setF({ ...f, reason: "" }); onDone(r.message); }
      catch (err) { setError(err.errors?.length ? { message: err.errors.map((x) => x.message).join(". ") } : err); } finally { setBusy(false); }
    }}>
      <label className="form-control"><span className="label-text mb-1">Child</span>
        <select className="select select-bordered select-sm" value={student} onChange={(e) => setF({ ...f, student: e.target.value })}>
          {(kids || []).map((k) => <option key={k.id} value={k.id}>{k.firstName} {k.lastName} ({classLabel(k.className)})</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="form-control"><span className="label-text mb-1">From</span><input type="date" className="input input-bordered input-sm" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: e.target.value > f.to ? e.target.value : f.to })} /></label>
        <label className="form-control"><span className="label-text mb-1">To</span><input type="date" min={f.from} className="input input-bordered input-sm" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
      </div>
      <label className="form-control"><span className="label-text mb-1">Reason</span><textarea className="textarea textarea-bordered" rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
      {error && <div className="alert alert-error py-2" role="alert"><span>{error.message}</span></div>}
      <button className={`btn btn-primary btn-sm ${busy ? "loading" : ""}`} disabled={busy || !student}>Send to class teacher</button>
    </form>
  );
}

export default function Leave() {
  const { can } = useAuth();
  const isParent = can("leave.request");
  const deciding = can("leave.decide");
  const [status, setStatus] = useState(isParent ? "" : "pending");
  const { data, loading, error, reload } = useApi(() => (isParent || deciding ? api.leave.list(status || undefined) : Promise.resolve({ data: [] })), [status]);
  const [notice, setNotice] = useState(null);
  const [decide, setDecide] = useState(null);
  const [note, setNote] = useState("");
  if (!isParent && !deciding) return <Layout title="Leave requests"><NoAccess /></Layout>;
  return (
    <Layout title="Leave requests">
      <PageHeader title="Leave requests" subtitle={isParent ? "Tell the school in advance when your child will be away." : "Approve leave; approved days are marked as leave in attendance."}
        actions={<select className="select select-bordered select-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select>} />
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      <div className="grid gap-4 lg:grid-cols-3">
        {isParent && <Card title="Request leave"><RequestLeave onDone={(m) => { setNotice(m); reload(); }} /></Card>}
        <Card className={isParent ? "lg:col-span-2" : "lg:col-span-3"}>
          {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.length === 0 ? <EmptyState title="No leave requests" message={status === "pending" ? "Nothing waiting for a decision." : ""} /> : (
            <ul className="divide-y divide-slate-100">
              {data.map((r) => (
                <li key={r.id} className="py-3 flex flex-wrap gap-3 items-center">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{r.student?.name} <span className="text-xs text-slate-500">{classLabel(r.student?.className)} {r.student?.section || ""}</span></p>
                    <p className="text-sm text-slate-600">{formatDate(r.from)} – {formatDate(r.to)} · {r.reason}</p>
                    <p className="text-xs text-slate-400">{r.requestedBy ? `From ${r.requestedBy}` : ""}{r.decidedBy ? ` · ${r.status} by ${r.decidedBy}` : ""}{r.note ? `: “${r.note}”` : ""}</p>
                  </div>
                  <span className={`badge ${TONE[r.status]}`}>{r.status}</span>
                  {deciding && r.status === "pending" && <button className="btn btn-primary btn-sm" onClick={() => { setNote(""); setDecide(r); }}>Review</button>}
                  {isParent && r.status === "pending" && <button className="btn btn-ghost btn-sm" onClick={async () => { const x = await api.leave.cancel(r.id); setNotice(x.message); reload(); }}>Cancel</button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {decide && (
        <Dialog title={`Leave for ${decide.student?.name}`} onClose={() => setDecide(null)} footer={<>
          <button className="btn btn-ghost text-error" onClick={async () => { const x = await api.leave.decide(decide.id, false, note || undefined); setDecide(null); setNotice(x.message); reload(); }}>Reject</button>
          <button className="btn btn-success" onClick={async () => { const x = await api.leave.decide(decide.id, true, note || undefined); setDecide(null); setNotice(x.message); reload(); }}>Approve</button>
        </>}>
          <p className="text-sm">{formatDate(decide.from)} – {formatDate(decide.to)}: “{decide.reason}”</p>
          <label className="form-control mt-3"><span className="label-text mb-1">Note to the parent (optional)</span><input className="input input-bordered input-sm" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </Dialog>
      )}
    </Layout>
  );
}
