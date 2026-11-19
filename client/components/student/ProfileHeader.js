import { useRef, useState } from "react";
import Link from "next/link";
import { Avatar, ConfirmDialog, Dialog } from "../common";
import Icon from "../common/Icon";
import { api } from "../../services/api";
import { STUDENT_STATUS, ageFrom, classLabel, fullName, money } from "../../constants";
import { useAuth } from "../../context/auth";

const STATUSES = ["active", "inactive", "transferred", "withdrawn", "graduated"];

export default function ProfileHeader({ student, attendance, results, fees, onChange, onDeleted }) {
  const { can } = useAuth();
  const canManage = can("students.manage");
  const canPhoto = can("students.photo");
  const fileRef = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const [dialog, setDialog] = useState(null); // "status" | "delete" | "photo"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(student.status);

  const upload = async (file) => {
    if (!file) return;
    setPhotoError(null);
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("Photos must be 5 MB or smaller.");
      return;
    }
    setPhotoBusy(true);
    try {
      const res = await api.students.uploadPhoto(student.id, file);
      onChange(res.data, "Photo updated");
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setDialog(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const latest = results?.[0];
  const age = ageFrom(student.dateOfBirth);

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-5 sm:items-center">
        <div className="relative self-center sm:self-auto">
          <Avatar student={student} size="w-20 h-20 sm:w-28 sm:h-28" text="text-2xl sm:text-3xl" />
          {canPhoto && <button
            className={`btn btn-circle btn-sm btn-primary absolute -bottom-1 -right-1 ${photoBusy ? "loading" : ""}`}
            aria-label={student.photoUrl ? "Change photo" : "Add photo"}
            onClick={() => (student.photoUrl ? setDialog("photo") : fileRef.current?.click())}
            disabled={photoBusy}
          >
            {!photoBusy && <Icon name="camera" className="w-4 h-4" />}
          </button>}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="hidden"
            aria-label="Choose a photo"
            data-testid="photo-input"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">{fullName(student)}</h1>
          <p className="text-sm text-slate-500 mt-1">
            <span className="font-mono">{student.admissionNumber}</span> · {student.school?.name}
          </p>
          <p className="text-sm text-slate-600 mt-1">
            {classLabel(student.className)}
            {student.section ? ` – Section ${student.section}` : ""}
            {student.rollNumber ? ` · Roll ${student.rollNumber}` : ""}
            {age !== null ? ` · ${age} years` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 justify-center sm:justify-start">
            <span className={`badge ${STUDENT_STATUS[student.status] || ""}`}>{student.status}</span>
            {student.bloodGroup && <span className="badge badge-outline">Blood {student.bloodGroup}</span>}
          </div>
        </div>
        {canManage && <div className="flex gap-2 justify-center sm:flex-col">
          <Link href={`/students/${student.id}/edit`}>
            <a className="btn btn-sm gap-1"><Icon name="edit" className="w-4 h-4" />Edit</a>
          </Link>
          <button className="btn btn-sm" onClick={() => { setStatus(student.status); setDialog("status"); }}>Change status</button>
          <button className="btn btn-sm btn-ghost text-error gap-1" onClick={() => setDialog("delete")}>
            <Icon name="trash" className="w-4 h-4" />Delete
          </button>
        </div>}
      </div>
      {photoError && <div className="alert alert-error mt-4 py-2" role="alert"><span>{photoError}</span></div>}

      <dl className="grid grid-cols-3 gap-2 mt-4 sm:mt-5 text-center">
        <div className="rounded-lg bg-slate-50 p-2 sm:p-3">
          <dt className="text-xs text-slate-500">Attendance</dt>
          <dd className={`text-base sm:text-lg font-semibold leading-tight ${attendance?.summary.percentage < 75 ? "text-error" : "text-slate-900"}`}>
            {attendance?.summary.percentage != null ? `${attendance.summary.percentage}%` : "—"}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 sm:p-3">
          <dt className="text-xs text-slate-500">{latest ? latest.exam : "Latest result"}</dt>
          <dd className="text-base sm:text-lg font-semibold leading-tight text-slate-900">{latest ? <>{latest.percentage}% <span className="text-slate-500 font-medium">{latest.grade}</span></> : "—"}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 sm:p-3">
          <dt className="text-xs text-slate-500">Fees due</dt>
          <dd className={`text-base sm:text-lg font-semibold leading-tight ${fees?.summary?.overdue ? "text-error" : "text-slate-900"}`}>
            {fees ? (fees.summary.balance ? money(fees.summary.balance) : "Paid") : "—"}
          </dd>
        </div>
      </dl>

      {dialog === "photo" && (
        <Dialog title="Student photo" onClose={() => setDialog(null)}>
          <div className="flex flex-col gap-2">
            <button className="btn btn-primary" onClick={() => { setDialog(null); fileRef.current?.click(); }}>Choose a new photo</button>
            <button
              className={`btn btn-ghost text-error ${busy ? "loading" : ""}`}
              onClick={() => run(async () => { const res = await api.students.removePhoto(student.id); onChange(res.data, "Photo removed"); })}
            >
              Remove photo
            </button>
            {error && <div className="alert alert-error py-2"><span>{error.message}</span></div>}
          </div>
        </Dialog>
      )}
      {dialog === "status" && (
        <Dialog
          title="Change status"
          onClose={() => setDialog(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setDialog(null)}>Cancel</button>
              <button
                className={`btn btn-primary ${busy ? "loading" : ""}`}
                onClick={() => run(async () => { const res = await api.students.setStatus(student.id, status); onChange(res.data, `Status changed to ${status}`); })}
              >
                Save
              </button>
            </>
          }
        >
          <label className="form-control">
            <span className="label-text mb-1">Status</span>
            <select className="select select-bordered" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </label>
          {error && <div className="alert alert-error mt-3 py-2"><span>{error.message}</span></div>}
        </Dialog>
      )}
      {dialog === "delete" && (
        <ConfirmDialog
          title={`Delete ${fullName(student)}?`}
          message="The student disappears from lists and search. Their record is kept in the database for history, and their roll number is freed."
          busy={busy}
          error={error}
          onClose={() => setDialog(null)}
          onConfirm={() => run(async () => { await api.students.remove(student.id); onDeleted(); })}
        />
      )}
    </section>
  );
}
