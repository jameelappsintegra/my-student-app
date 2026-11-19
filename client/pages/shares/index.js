import { useState } from "react";
import Link from "next/link";
import Layout from "../../components/layout/layout";
import { Avatar, Card, Dialog, EmptyState, ErrorState, Loading, NoAccess, Notice, PageHeader } from "../../components/common";
import useApi from "../../hooks/useApi";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { classLabel, formatDate } from "../../constants";

const SCOPES = [
  ["academic", "Academic results"],
  ["attendance", "Attendance"],
  ["personal", "Personal details (address, parents, contacts)"],
  ["fees", "Fees"],
];
const scopeLabel = (s) => SCOPES.find(([k]) => k === s)?.[0];
const STATUS = { pending: "badge-warning", approved: "badge-success", rejected: "badge-error", revoked: "badge-ghost" };

function RequestForm({ onDone }) {
  const [f, setF] = useState({ admissionNumber: "", scopes: ["academic"], reason: "", days: 30 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const toggle = (s) => setF((x) => ({ ...x, scopes: x.scopes.includes(s) ? x.scopes.filter((y) => y !== s) : [...x.scopes, s] }));
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const r = await api.shares.request({ ...f, admissionNumber: f.admissionNumber.trim(), reason: f.reason.trim() });
          setF({ admissionNumber: "", scopes: ["academic"], reason: "", days: 30 });
          onDone(r.message);
        } catch (err) {
          setError(err.errors?.length ? { message: err.errors.map((x) => x.message).join(". ") } : err);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="form-control">
        <span className="label-text mb-1">Student&apos;s admission number</span>
        <input className="input input-bordered uppercase" placeholder="e.g. SMMS-2026-00004" value={f.admissionNumber} onChange={(e) => setF({ ...f, admissionNumber: e.target.value })} />
      </label>
      <fieldset>
        <legend className="label-text mb-1">What do you need to see?</legend>
        {SCOPES.map(([k, label]) => (
          <label key={k} className="label cursor-pointer justify-start gap-3 py-1">
            <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={f.scopes.includes(k)} onChange={() => toggle(k)} />
            <span className="label-text">{label}</span>
          </label>
        ))}
      </fieldset>
      <label className="form-control">
        <span className="label-text mb-1">Reason (the other school sees this)</span>
        <textarea className="textarea textarea-bordered" rows={2} placeholder="e.g. Student is transferring to our school next term" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </label>
      <label className="form-control w-40">
        <span className="label-text mb-1">For how many days</span>
        <input type="number" min={1} max={180} className="input input-bordered" value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })} />
      </label>
      {error && <div className="alert alert-error py-2" role="alert"><span>{error.message}</span></div>}
      <button className={`btn btn-primary ${busy ? "loading" : ""}`} disabled={busy}>Send request</button>
      <p className="text-xs text-slate-500">Access is read-only, limited to what is approved, and ends automatically.</p>
    </form>
  );
}

function DecisionDialog({ share, onClose, onDone }) {
  const [scopes, setScopes] = useState(share.scopes);
  const [days, setDays] = useState(share.days);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const decide = async (approve) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.shares.decide(share.id, { approve, scopes, days, note: note.trim() || undefined });
      onDone(r.message);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={`Request for ${share.student?.name}`}
      onClose={onClose}
      footer={<><button className="btn btn-ghost text-error" onClick={() => decide(false)} disabled={busy}>Reject</button><button className={`btn btn-success ${busy ? "loading" : ""}`} onClick={() => decide(true)} disabled={busy || !scopes.length}>Approve</button></>}
    >
      <p className="text-sm"><strong>{share.requester?.name}</strong> ({share.requester?.role}) asks: “{share.reason}”</p>
      <p className="label-text mt-3 mb-1">Allow access to (you can untick items)</p>
      {share.scopes.map((s) => (
        <label key={s} className="label cursor-pointer justify-start gap-3 py-1">
          <input type="checkbox" className="checkbox checkbox-sm checkbox-success" checked={scopes.includes(s)} onChange={() => setScopes(scopes.includes(s) ? scopes.filter((x) => x !== s) : [...scopes, s])} />
          <span className="label-text">{SCOPES.find(([k]) => k === s)?.[1]}</span>
        </label>
      ))}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <label className="form-control"><span className="label-text mb-1">Days (max {share.days})</span><input type="number" min={1} max={share.days} className="input input-bordered input-sm" value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
      </div>
      <label className="form-control mt-2"><span className="label-text mb-1">Note to the requester (optional)</span><input className="input input-bordered input-sm" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {error && <div className="alert alert-error mt-3 py-2"><span>{error.message}</span></div>}
    </Dialog>
  );
}

function ShareRow({ s, incoming, onDecide, onRevoke }) {
  const active = s.status === "approved" && !s.expired;
  return (
    <li className="py-3 flex flex-wrap items-center gap-3">
      {s.student && <Avatar student={{ firstName: s.student.name.split(" ")[0], lastName: s.student.name.split(" ").slice(-1)[0], photoUrl: incoming || active ? s.student.photoUrl : null }} size="w-10 h-10" text="text-xs" />}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{s.student?.name} <span className="text-xs text-slate-500 font-mono">{s.student?.admissionNumber}</span></p>
        <p className="text-xs text-slate-500">
          {incoming ? `Asked by ${s.requester?.name} (${s.requester?.role})` : `${s.ownerSchool?.name}`} · {s.scopes.map(scopeLabel).join(", ")} · {formatDate(s.createdAt)}
        </p>
        <p className="text-xs text-slate-600 mt-1">“{s.reason}”{s.decisionNote ? ` — ${s.decidedBy}: “${s.decisionNote}”` : ""}</p>
      </div>
      <span className={`badge ${s.expired ? "badge-ghost" : STATUS[s.status]}`}>{s.expired ? "expired" : s.status}{active ? ` until ${formatDate(s.expiresAt)}` : ""}</span>
      <div className="flex gap-2">
        {incoming && s.status === "pending" && <button className="btn btn-sm btn-primary" onClick={() => onDecide(s)}>Review</button>}
        {!incoming && active && s.student && <Link href={`/students/${s.student.id}`}><a className="btn btn-sm">Open</a></Link>}
        {(s.status === "pending" || active) && <button className="btn btn-sm btn-ghost text-error" onClick={() => onRevoke(s)}>{incoming ? "Revoke" : "Cancel"}</button>}
      </div>
    </li>
  );
}

export default function Shares() {
  const { can } = useAuth();
  const canRequest = can("shares.request");
  const canApprove = can("shares.approve");
  const [tab, setTab] = useState(canApprove && !canRequest ? "incoming" : "outgoing");
  const { data, loading, error, reload } = useApi(() => (canRequest || canApprove ? api.shares.list(tab) : Promise.resolve({ data: [] })), [tab]);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(null);
  const done = (msg) => { setDialog(null); setNotice(msg); reload(); };

  if (!canRequest && !canApprove) return <Layout title="Shared records"><NoAccess /></Layout>;
  const pending = (data || []).filter((s) => s.status === "pending").length;
  return (
    <Layout title="Shared records">
      <PageHeader title="Shared records" subtitle="Read-only access to students at other schools, with that school's approval." />
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      <div className="tabs tabs-boxed bg-white border border-slate-200 inline-flex mb-4" role="tablist">
        {canRequest && <button role="tab" aria-selected={tab === "outgoing"} className={`tab ${tab === "outgoing" ? "tab-active" : ""}`} onClick={() => setTab("outgoing")}>My requests</button>}
        {canApprove && <button role="tab" aria-selected={tab === "incoming"} className={`tab ${tab === "incoming" ? "tab-active" : ""}`} onClick={() => setTab("incoming")}>To approve{tab === "incoming" && pending ? ` (${pending})` : ""}</button>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {tab === "outgoing" && canRequest && (
          <Card title="Ask another school" className="lg:col-span-1"><RequestForm onDone={done} /></Card>
        )}
        <Card title={tab === "outgoing" ? "Your requests" : "Requests for your school's students"} className={tab === "outgoing" ? "lg:col-span-2" : "lg:col-span-3"}>
          {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.length === 0 ? (
            <EmptyState title="Nothing here yet" message={tab === "outgoing" ? "Requests you send appear here with their status." : "When another school asks to see one of your students, approve or reject it here."} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.map((s) => <ShareRow key={s.id} s={s} incoming={tab === "incoming"} onDecide={(x) => setDialog(x)} onRevoke={async (x) => { const r = await api.shares.revoke(x.id); done(r.message); }} />)}
            </ul>
          )}
        </Card>
      </div>
      {dialog && <DecisionDialog share={dialog} onClose={() => setDialog(null)} onDone={done} />}
    </Layout>
  );
}
