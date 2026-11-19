import { useState } from "react";
import { Card, ConfirmDialog, Dialog, EmptyState } from "../common";
import { api, ApiError } from "../../services/api";
import { academicYearOptions, formatDate } from "../../constants";

const gradeTone = (g) => (g.startsWith("A") ? "badge-success" : g.startsWith("B") ? "badge-info" : g.startsWith("C") ? "badge-warning" : "badge-error");

function ResultDialog({ studentId, existing, suggestedSubjects, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    existing
      ? {
          exam: existing.exam,
          academicYear: existing.academicYear,
          examDate: existing.examDate ? existing.examDate.slice(0, 10) : "",
          remarks: existing.remarks || "",
          subjects: existing.subjects.map((s) => ({ subject: s.subject, maxMarks: String(s.maxMarks), marks: String(s.marks) })),
        }
      : {
          exam: "",
          academicYear: academicYearOptions()[0],
          examDate: "",
          remarks: "",
          subjects: (suggestedSubjects.length ? suggestedSubjects : ["English", "Mathematics"]).map((subject) => ({ subject, maxMarks: "100", marks: "" })),
        }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const setSub = (i, k, v) => setForm((f) => ({ ...f, subjects: f.subjects.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));

  const save = async () => {
    setError(null);
    const bad = form.subjects.find((s) => !s.subject.trim() || s.marks === "" || Number(s.marks) > Number(s.maxMarks));
    if (!form.exam.trim()) return setError({ message: "Enter the exam name, e.g. Term 1." });
    if (bad) return setError({ message: `Check ${bad.subject || "each subject"}: marks are needed and can't exceed the maximum.` });
    setBusy(true);
    const body = {
      exam: form.exam.trim(),
      academicYear: form.academicYear,
      examDate: form.examDate || undefined,
      remarks: form.remarks.trim() || undefined,
      subjects: form.subjects.map((s) => ({ subject: s.subject.trim(), maxMarks: Number(s.maxMarks), marks: Number(s.marks) })),
    };
    try {
      const res = existing ? await api.students.updateResult(studentId, existing.id, body) : await api.students.createResult(studentId, body);
      onSaved(res.message);
    } catch (err) {
      setError(err instanceof ApiError && err.errors.length ? { message: err.errors.map((e) => e.message).join(". ") } : err);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={existing ? `Edit ${existing.exam}` : "Add exam marks"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className={`btn btn-primary ${busy ? "loading" : ""}`} onClick={save} disabled={busy}>Save marks</button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="form-control col-span-2 sm:col-span-1">
          <span className="label-text mb-1">Exam</span>
          <input className="input input-bordered" value={form.exam} placeholder="Term 1" onChange={(e) => setForm({ ...form, exam: e.target.value })} />
        </label>
        <label className="form-control">
          <span className="label-text mb-1">Year</span>
          <select className="select select-bordered" value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })}>
            {[...new Set([form.academicYear, ...academicYearOptions()])].map((y) => <option key={y}>{y}</option>)}
          </select>
        </label>
        <label className="form-control">
          <span className="label-text mb-1">Exam date</span>
          <input type="date" className="input input-bordered" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />
        </label>
      </div>
      <div className="mt-4 space-y-2">
        <div className="grid grid-cols-[1fr_4.5rem_4.5rem_2rem] gap-2 text-xs text-slate-500 px-1">
          <span>Subject</span><span>Marks</span><span>Out of</span><span />
        </div>
        {form.subjects.map((s, i) => (
          <div key={i} className="grid grid-cols-[1fr_4.5rem_4.5rem_2rem] gap-2 items-center">
            <input className="input input-bordered input-sm" aria-label={`Subject ${i + 1}`} value={s.subject} onChange={(e) => setSub(i, "subject", e.target.value)} />
            <input className="input input-bordered input-sm" aria-label={`${s.subject || "Subject"} marks`} type="number" inputMode="decimal" min={0} value={s.marks} onChange={(e) => setSub(i, "marks", e.target.value)} />
            <input className="input input-bordered input-sm" aria-label={`${s.subject || "Subject"} maximum`} type="number" inputMode="numeric" min={1} value={s.maxMarks} onChange={(e) => setSub(i, "maxMarks", e.target.value)} />
            <button className="btn btn-ghost btn-xs" aria-label={`Remove ${s.subject || "subject"}`} onClick={() => setForm((f) => ({ ...f, subjects: f.subjects.filter((_, j) => j !== i) }))} disabled={form.subjects.length === 1}>✕</button>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, subjects: [...f.subjects, { subject: "", maxMarks: "100", marks: "" }] }))}>+ Add subject</button>
      </div>
      <label className="form-control mt-3">
        <span className="label-text mb-1">Teacher&apos;s remarks</span>
        <textarea className="textarea textarea-bordered" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
      </label>
      {error && <div className="alert alert-error mt-3 py-2" role="alert"><span>{error.message}</span></div>}
    </Dialog>
  );
}

export default function AcademicsTab({ studentId, results, onChanged, canEdit = true }) {
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const subjects = results[0]?.subjects.map((s) => s.subject) || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <p className="text-sm text-slate-500">Marks by exam. Grades use the 9-point scale (A1 = 91%+); 33% is the pass mark.</p>
        {canEdit && <button className="btn btn-primary btn-sm shrink-0" onClick={() => setDialog({ kind: "edit" })}>Add marks</button>}
      </div>
      {results.length === 0 ? (
        <Card><EmptyState title="No exam results yet" message="Add marks after each exam to build this student's record." /></Card>
      ) : (
        results.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <div>
                <h3 className="font-semibold text-slate-900">{r.exam}</h3>
                <p className="text-xs text-slate-500">{r.academicYear}{r.examDate ? ` · ${formatDate(r.examDate)}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{r.percentage}%</span>
                <span className={`badge ${gradeTone(r.grade)}`}>{r.grade}</span>
                <span className={`badge ${r.passed ? "badge-success badge-outline" : "badge-error"}`}>{r.passed ? "Pass" : "Needs re-test"}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="table table-compact w-full">
                <thead><tr><th>Subject</th><th className="text-right">Marks</th><th className="text-right">%</th><th>Grade</th></tr></thead>
                <tbody>
                  {r.subjects.map((s) => (
                    <tr key={s.subject}>
                      <td>{s.subject}</td>
                      <td className="text-right tabular-nums">{s.marks} / {s.maxMarks}</td>
                      <td className="text-right tabular-nums">{s.percentage}</td>
                      <td><span className={`badge badge-sm ${gradeTone(s.grade)}`}>{s.grade}</span></td>
                    </tr>
                  ))}
                  <tr className="font-semibold"><td>Total</td><td className="text-right tabular-nums">{r.total} / {r.maxTotal}</td><td className="text-right tabular-nums">{r.percentage}</td><td>{r.grade}</td></tr>
                </tbody>
              </table>
            </div>
            {r.remarks && <p className="text-sm text-slate-600 mt-3">“{r.remarks}”</p>}
            {canEdit && <div className="flex gap-2 justify-end mt-3">
              <button className="btn btn-sm" onClick={() => setDialog({ kind: "edit", result: r })}>Edit</button>
              <button className="btn btn-sm btn-ghost text-error" onClick={() => { setError(null); setDialog({ kind: "delete", result: r }); }}>Delete</button>
            </div>}
          </Card>
        ))
      )}
      {dialog?.kind === "edit" && (
        <ResultDialog
          studentId={studentId}
          existing={dialog.result}
          suggestedSubjects={subjects}
          onClose={() => setDialog(null)}
          onSaved={(msg) => { setDialog(null); onChanged(msg); }}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.result.exam} marks?`}
          message="This removes the marks for every subject in this exam."
          busy={busy}
          error={error}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api.students.deleteResult(studentId, dialog.result.id);
              setDialog(null);
              onChanged("Result deleted");
            } catch (err) {
              setError(err);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
