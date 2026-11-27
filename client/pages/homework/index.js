import { useState } from "react";
import Layout from "../../components/layout/layout";
import { Card, EmptyState, ErrorState, Loading, Notice, PageHeader } from "../../components/common";
import ClassPicker from "../../components/forms/ClassPicker";
import useApi from "../../hooks/useApi";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { classLabel, formatDate, todayIso } from "../../constants";

function PostHomework({ onDone }) {
  const [cls, setCls] = useState({ school: "", className: "", section: "" });
  const [f, setF] = useState({ subject: "", title: "", details: "", dueDate: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try {
        const r = await api.homework.create({ ...cls, section: cls.section || undefined, subject: f.subject.trim(), title: f.title.trim(), details: f.details.trim() || undefined, dueDate: f.dueDate });
        setF({ subject: f.subject, title: "", details: "", dueDate: "" });
        onDone(r.message);
      } catch (err) { setError(err.errors?.length ? { message: err.errors.map((x) => x.message).join(". ") } : err); } finally { setBusy(false); }
    }}>
      <ClassPicker value={cls} onChange={setCls} />
      <div className="grid gap-2 sm:grid-cols-3">
        <input className="input input-bordered input-sm" placeholder="Subject" aria-label="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        <input className="input input-bordered input-sm sm:col-span-2" placeholder="What to do" aria-label="Homework title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <textarea className="textarea textarea-bordered w-full" rows={2} placeholder="Details (optional)" aria-label="Details" value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
      <label className="form-control w-48"><span className="label-text mb-1">Due date</span><input type="date" min={todayIso()} className="input input-bordered input-sm" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
      {error && <div className="alert alert-error py-2" role="alert"><span>{error.message}</span></div>}
      <button className={`btn btn-primary btn-sm ${busy ? "loading" : ""}`} disabled={busy}>Post homework</button>
    </form>
  );
}

export default function Homework() {
  const { can, user } = useAuth();
  const [upcoming, setUpcoming] = useState(true);
  const { data, loading, error, reload } = useApi(() => api.homework.list({ upcoming }), [upcoming]);
  const [notice, setNotice] = useState(null);
  const today = todayIso();
  return (
    <Layout title="Homework">
      <PageHeader title="Homework" subtitle={user?.role === "parent" ? "Homework for your children's classes." : "Homework for your classes."}
        actions={<label className="label cursor-pointer gap-2"><span className="label-text">Upcoming only</span><input type="checkbox" className="toggle toggle-sm toggle-primary" checked={upcoming} onChange={(e) => setUpcoming(e.target.checked)} /></label>} />
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      {can("homework.manage") && <Card title="Post homework" className="mb-4"><PostHomework onDone={(m) => { setNotice(m); reload(); }} /></Card>}
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.length === 0 ? (
        <Card><EmptyState title="No homework" message={upcoming ? "Nothing due right now." : "No homework has been posted yet."} /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((h) => {
            const due = h.dueDate.slice(0, 10);
            const tone = due < today ? "badge-ghost" : due === today ? "badge-error" : "badge-warning";
            return (
              <Card key={h.id}>
                <div className="flex justify-between gap-2">
                  <p className="text-xs text-slate-500">{h.subject} · {classLabel(h.className)}{h.section ? ` ${h.section}` : ""} · {h.school?.code}</p>
                  <span className={`badge badge-sm ${tone}`}>{due === today ? "Due today" : `Due ${formatDate(h.dueDate)}`}</span>
                </div>
                <h2 className="font-semibold text-slate-900 mt-1">{h.title}</h2>
                {h.details && <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{h.details}</p>}
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-slate-400">Posted by {h.author}</p>
                  {can("homework.manage") && <button className="btn btn-ghost btn-xs text-error" onClick={async () => { await api.homework.remove(h.id); setNotice("Homework deleted"); reload(); }}>Delete</button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
