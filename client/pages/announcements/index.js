import { useState } from "react";
import Layout from "../../components/layout/layout";
import { Card, ConfirmDialog, EmptyState, ErrorState, Loading, Notice, PageHeader } from "../../components/common";
import useApi from "../../hooks/useApi";
import useSchools from "../../hooks/useSchools";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { CLASSES, classLabel, formatDate } from "../../constants";

function NewAnnouncement({ onDone }) {
  const { schools } = useSchools();
  const { user } = useAuth();
  const [f, setF] = useState({ title: "", body: "", school: "", className: "", audience: "everyone", pinned: false, eventDate: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setError(null);
      try {
        const body = { title: f.title.trim(), body: f.body.trim(), audience: f.audience, pinned: f.pinned, ...(f.school ? { school: f.school } : {}), ...(f.className ? { className: f.className } : {}), ...(f.eventDate ? { eventDate: f.eventDate } : {}) };
        const r = await api.announcements.create(body);
        setF({ ...f, title: "", body: "", eventDate: "" });
        onDone(r.message);
      } catch (err) { setError(err.errors?.length ? { message: err.errors.map((x) => x.message).join(". ") } : err); } finally { setBusy(false); }
    }}>
      <input className="input input-bordered w-full" placeholder="Title" aria-label="Title" value={f.title} onChange={set("title")} />
      <textarea className="textarea textarea-bordered w-full" rows={3} placeholder="What do people need to know?" aria-label="Message" value={f.body} onChange={set("body")} />
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <select className="select select-bordered select-sm" aria-label="School" value={f.school} onChange={set("school")}>
          {user?.role === "admin" && <option value="">All schools</option>}
          {user?.role !== "admin" && <option value="">Choose school…</option>}
          {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="select select-bordered select-sm" aria-label="Class" value={f.className} onChange={set("className")}>
          <option value="">Whole school</option>
          {CLASSES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
        <select className="select select-bordered select-sm" aria-label="Audience" value={f.audience} onChange={set("audience")}>
          <option value="everyone">Parents and staff</option>
          <option value="parents">Parents only</option>
          <option value="staff">Staff only</option>
        </select>
        <input type="date" className="input input-bordered input-sm" aria-label="Event date" value={f.eventDate} onChange={set("eventDate")} />
      </div>
      <label className="label cursor-pointer justify-start gap-2"><input type="checkbox" className="checkbox checkbox-sm" checked={f.pinned} onChange={set("pinned")} /><span className="label-text">Pin to the top</span></label>
      {error && <div className="alert alert-error py-2" role="alert"><span>{error.message}</span></div>}
      <button className={`btn btn-primary btn-sm ${busy ? "loading" : ""}`} disabled={busy}>Post and notify</button>
    </form>
  );
}

export default function Announcements() {
  const { can } = useAuth();
  const { data, loading, error, reload } = useApi(() => api.announcements.list(), []);
  const [notice, setNotice] = useState(null);
  const [del, setDel] = useState(null);
  const upcoming = (data || []).filter((a) => a.eventDate && new Date(a.eventDate) >= new Date(Date.now() - 86400000)).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  return (
    <Layout title="Announcements">
      <PageHeader title="Announcements" subtitle="Notices and upcoming events from your school." />
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {can("announcements.manage") && <Card title="New announcement"><NewAnnouncement onDone={(m) => { setNotice(m); reload(); }} /></Card>}
          {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.length === 0 ? (
            <Card><EmptyState title="No announcements" message="School notices will appear here." /></Card>
          ) : data.map((a) => (
            <Card key={a.id}>
              <div className="flex justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-slate-900">{a.pinned && <span className="badge badge-primary badge-sm mr-2">Pinned</span>}{a.title}</h2>
                  <p className="text-xs text-slate-500">{a.school?.name || "All schools"}{a.className ? ` · ${classLabel(a.className)}` : ""} · {a.author?.name} · {formatDate(a.createdAt)}{a.audience !== "everyone" ? ` · ${a.audience} only` : ""}</p>
                </div>
                {can("announcements.manage") && <button className="btn btn-ghost btn-xs text-error" onClick={() => setDel(a)}>Delete</button>}
              </div>
              <p className="text-sm text-slate-700 mt-2 whitespace-pre-line">{a.body}</p>
              {a.eventDate && <p className="text-sm font-medium text-primary mt-2">📅 {formatDate(a.eventDate)}</p>}
            </Card>
          ))}
        </div>
        <Card title="Upcoming events" className="h-fit">
          {upcoming.length === 0 ? <p className="text-sm text-slate-500">No upcoming events.</p> : (
            <ul className="space-y-3">{upcoming.map((a) => (
              <li key={a.id} className="flex gap-3">
                <div className="text-center w-12 shrink-0 rounded-lg bg-primary/10 text-primary py-1">
                  <p className="text-lg font-bold leading-none">{new Date(a.eventDate).getUTCDate()}</p>
                  <p className="text-[10px] uppercase">{new Date(a.eventDate).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</p>
                </div>
                <p className="text-sm text-slate-700">{a.title}</p>
              </li>
            ))}</ul>
          )}
        </Card>
      </div>
      {del && <ConfirmDialog title="Delete this announcement?" message={del.title} onClose={() => setDel(null)} onConfirm={async () => { await api.announcements.remove(del.id); setDel(null); setNotice("Announcement deleted"); reload(); }} />}
    </Layout>
  );
}
