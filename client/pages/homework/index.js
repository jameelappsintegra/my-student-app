import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/layout/layout";
import { Card, Dialog, EmptyState, ErrorState, Loading, Notice, PageHeader } from "../../components/common";
import ClassPicker from "../../components/forms/ClassPicker";
import useApi from "../../hooks/useApi";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { classLabel, formatDate, todayIso } from "../../constants";

function PostHomework({ onDone }) {
  const [cls, setCls] = useState({ school: "", className: "", section: "" });
  const [f, setF] = useState({ subject: "", title: "", details: "", dueDate: "", online: false, maxMarks: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try {
        const r = await api.homework.create({ ...cls, section: cls.section || undefined, subject: f.subject.trim(), title: f.title.trim(), details: f.details.trim() || undefined, dueDate: f.dueDate, onlineSubmission: f.online, ...(f.maxMarks ? { maxMarks: Number(f.maxMarks) } : {}) });
        setF({ ...f, title: "", details: "", dueDate: "" });
        onDone(r.message);
      } catch (err) { setError(err.errors?.length ? { message: err.errors.map((x) => x.message).join(". ") } : err); } finally { setBusy(false); }
    }}>
      <ClassPicker value={cls} onChange={setCls} />
      <div className="grid gap-2 sm:grid-cols-3">
        <input className="input input-bordered input-sm" placeholder="Subject" aria-label="Subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        <input className="input input-bordered input-sm sm:col-span-2" placeholder="What to do" aria-label="Homework title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>
      <textarea className="textarea textarea-bordered w-full" rows={2} placeholder="Details (optional)" aria-label="Details" value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
      <div className="flex flex-wrap items-end gap-4">
        <label className="form-control w-48"><span className="label-text mb-1">Due date</span><input type="date" min={todayIso()} className="input input-bordered input-sm" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
        <label className="label cursor-pointer gap-2"><input type="checkbox" className="toggle toggle-sm toggle-primary" checked={f.online} onChange={(e) => setF({ ...f, online: e.target.checked })} /><span className="label-text">Students hand in online</span></label>
        <label className="form-control w-28"><span className="label-text mb-1">Marks (optional)</span><input type="number" min="1" className="input input-bordered input-sm" placeholder="Out of" value={f.maxMarks} onChange={(e) => setF({ ...f, maxMarks: e.target.value })} /></label>
      </div>
      {error && <div className="alert alert-error py-2" role="alert"><span>{error.message}</span></div>}
      <button className={`btn btn-primary btn-sm ${busy ? "loading" : ""}`} disabled={busy}>Post homework</button>
    </form>
  );
}

const SUB_STATUS = { submitted: ["Handed in", "badge-info"], returned: ["Returned for changes", "badge-warning"], graded: ["Marked", "badge-success"] };

function SubmissionBadge({ sub, hw }) {
  if (!sub) return <span className="badge badge-ghost badge-sm">Not handed in</span>;
  const [label, tone] = SUB_STATUS[sub.status];
  return <span className={`badge badge-sm ${tone}`}>{label}{sub.late ? " · late" : ""}{sub.status === "graded" && sub.marks != null ? ` · ${sub.marks}${hw.maxMarks ? `/${hw.maxMarks}` : ""}` : ""}</span>;
}

// A student writes an answer and/or adds a link (Google Doc, photo, video).
function SubmitForm({ hw, sub, onDone }) {
  const [text, setText] = useState(sub?.text || "");
  const [link, setLink] = useState(sub?.link || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (sub?.status === "graded") return null;
  return (
    <form className="mt-3 space-y-2 border-t border-slate-100 pt-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try { const r = await api.homework.submit(hw.id, { ...(text.trim() ? { text: text.trim() } : {}), ...(link.trim() ? { link: link.trim() } : {}) }); onDone(r.message); } catch (err) { setError(err.errors?.length ? err.errors.map((x) => x.message).join(". ") : err.message); } finally { setBusy(false); }
    }}>
      <textarea className="textarea textarea-bordered w-full" rows={3} placeholder="Write your answer" aria-label={`Answer for ${hw.title}`} value={text} onChange={(e) => setText(e.target.value)} />
      <input className="input input-bordered input-sm w-full" type="url" placeholder="Link to your work (optional), e.g. https://docs.google.com/…" aria-label="Link to your work" value={link} onChange={(e) => setLink(e.target.value)} />
      {error && <p className="text-error text-sm" role="alert">{error}</p>}
      <button className={`btn btn-primary btn-sm ${busy ? "loading" : ""}`} disabled={busy}>{sub ? "Hand in again" : "Hand in"}</button>
    </form>
  );
}

// Teacher's view of one homework: who handed in, and marking.
function Review({ hw, onClose }) {
  const { data, loading, error, reload } = useApi(() => api.homework.submissions(hw.id), [hw.id]);
  const [marks, setMarks] = useState({});
  const [msg, setMsg] = useState(null);
  const review = async (sub, action) => {
    const m = marks[sub.id] || {};
    try {
      const r = await api.homework.review(hw.id, sub.id, { action, ...(m.marks !== undefined && m.marks !== "" && action === "grade" ? { marks: Number(m.marks) } : {}), ...(m.feedback ? { feedback: m.feedback } : {}) });
      setMsg(r.message); reload();
    } catch (err) { setMsg(err.message); }
  };
  return (
    <Dialog title={`${hw.title}: submissions`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <p className="text-sm text-slate-600 mb-3">{data.summary.submitted} of {data.summary.students} handed in{data.summary.late ? ` (${data.summary.late} late)` : ""} · {data.summary.graded} marked · {data.summary.missing} missing</p>
          {msg && <div className="alert alert-info py-1 mb-2 text-sm" role="status"><span>{msg}</span></div>}
          <ul className="divide-y divide-slate-100 max-h-[55vh] overflow-auto">
            {data.rows.map(({ student, submission: sub }) => (
              <li key={student.id} className="py-3">
                <div className="flex justify-between gap-2">
                  <p className="font-medium text-sm">{student.rollNumber ? `${student.rollNumber}. ` : ""}{student.name}</p>
                  <SubmissionBadge sub={sub} hw={hw} />
                </div>
                {sub && (
                  <div className="mt-1">
                    {sub.text && <p className="text-sm text-slate-700 whitespace-pre-line bg-slate-50 rounded p-2">{sub.text}</p>}
                    {sub.link && <a className="link link-primary text-sm break-all" href={sub.link} target="_blank" rel="noopener noreferrer nofollow">{sub.link}</a>}
                    {sub.feedback && <p className="text-xs text-slate-500 mt-1">Feedback: {sub.feedback}</p>}
                    {sub.status === "submitted" && (
                      <div className="flex flex-wrap gap-2 mt-2 items-center">
                        {hw.maxMarks && <input type="number" min="0" max={hw.maxMarks} className="input input-bordered input-xs w-20" aria-label={`Marks for ${student.name}`} placeholder={`/${hw.maxMarks}`} value={marks[sub.id]?.marks ?? ""} onChange={(e) => setMarks({ ...marks, [sub.id]: { ...marks[sub.id], marks: e.target.value } })} />}
                        <input className="input input-bordered input-xs flex-1 min-w-[8rem]" aria-label={`Feedback for ${student.name}`} placeholder="Feedback" value={marks[sub.id]?.feedback ?? ""} onChange={(e) => setMarks({ ...marks, [sub.id]: { ...marks[sub.id], feedback: e.target.value } })} />
                        <button className="btn btn-xs btn-success" onClick={() => review(sub, "grade")}>Mark</button>
                        <button className="btn btn-xs" onClick={() => review(sub, "return")}>Return</button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}

export default function Homework() {
  const { can, user } = useAuth();
  const [upcoming, setUpcoming] = useState(true);
  const { data, loading, error, reload } = useApi(() => api.homework.list({ upcoming }), [upcoming]);
  const [notice, setNotice] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const router = useRouter();
  const today = todayIso();
  const isStudent = user?.role === "student";
  // Opened from a "Submitted" notification.
  useEffect(() => {
    const id = router.query.review;
    if (id && data) { const hw = data.find((x) => x.id === id); if (hw) setReviewing(hw); }
  }, [router.query.review, data]);
  return (
    <Layout title="Homework">
      <PageHeader title="Homework" subtitle={user?.role === "parent" ? "Homework for your children's classes." : isStudent ? "Your homework. Hand in online where it says so." : "Homework for your classes."}
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
                  <span className={`badge badge-sm whitespace-nowrap shrink-0 ${tone}`}>{due === today ? "Due today" : `Due ${formatDate(h.dueDate)}`}</span>
                </div>
                <h2 className="font-semibold text-slate-900 mt-1">{h.title}</h2>
                {h.details && <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{h.details}</p>}
                {h.onlineSubmission && h.submissions && (
                  <div className="mt-2 flex flex-wrap gap-2 items-center">
                    {(h.submissions.length ? h.submissions : [null]).map((sub, i) => <SubmissionBadge key={sub?.id || i} sub={sub} hw={h} />)}
                    {h.submissions.map((sub) => sub.feedback && <p key={`f${sub.id}`} className="text-xs text-slate-600 w-full">Teacher: {sub.feedback}</p>)}
                  </div>
                )}
                {isStudent && h.onlineSubmission && <SubmitForm hw={h} sub={h.submissions?.[0]} onDone={(m) => { setNotice(m); reload(); }} />}
                {!h.onlineSubmission && h.submissions && <p className="text-xs text-slate-400 mt-2">Hand in on paper in class.</p>}
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-slate-400">Posted by {h.author}{h.maxMarks ? ` · out of ${h.maxMarks}` : ""}</p>
                  <div className="flex gap-1">
                    {can("homework.manage") && h.onlineSubmission && <button className="btn btn-xs" onClick={() => setReviewing(h)}>Submissions{h.submissionCounts ? ` (${h.submissionCounts.submitted})` : ""}</button>}
                    {can("homework.manage") && <button className="btn btn-ghost btn-xs text-error" onClick={async () => { await api.homework.remove(h.id); setNotice("Homework deleted"); reload(); }}>Delete</button>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {reviewing && <Review hw={reviewing} onClose={() => { setReviewing(null); reload(); }} />}
    </Layout>
  );
}
