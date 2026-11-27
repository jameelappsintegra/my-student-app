import { useRef, useState } from "react";
import Layout from "../../components/layout/layout";
import { Avatar, Card, Notice, PageHeader } from "../../components/common";
import { useAuth } from "../../context/auth";
import { api, ApiError } from "../../services/api";

const ROLE_LABEL = { admin: "Administrator", principal: "Principal", teacher: "Teacher", parent: "Parent", student: "Student" };

export default function Account() {
  const { user, setUser, signOut } = useAuth();
  const fileRef = useRef(null);
  const [notice, setNotice] = useState(null);
  const [photoError, setPhotoError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwErrors, setPwErrors] = useState({});
  const [pwBusy, setPwBusy] = useState(false);

  if (!user) return null;
  const upload = async (file) => {
    if (!file) return;
    setPhotoError(null);
    if (file.size > 5 * 1024 * 1024) return setPhotoError("Photos must be 5 MB or smaller.");
    setBusy(true);
    try {
      const res = await api.me.uploadPhoto(file);
      setUser({ ...user, photoUrl: res.data.photoUrl });
      setNotice(res.message);
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
    return undefined;
  };

  const changePassword = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!pw.current) errs.current = "Enter your current password";
    if (pw.next.length < 12) errs.next = "Use at least 12 characters";
    if (pw.next !== pw.confirm) errs.confirm = "The new passwords don't match";
    setPwErrors(errs);
    if (Object.keys(errs).length) return;
    setPwBusy(true);
    try {
      const res = await api.me.changePassword(pw.current, pw.next);
      setNotice(res.message);
      setPw({ current: "", next: "", confirm: "" });
    } catch (err) {
      setPwErrors(err instanceof ApiError && err.errors.length ? { current: err.fieldErrors().currentPassword, next: err.fieldErrors().newPassword } : { current: err.message });
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <Layout title="My account">
      <PageHeader title="My account" />
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profile">
          <div className="flex items-center gap-4">
            <Avatar person={{ name: user.name || user.username, photoUrl: user.photoUrl }} size="w-24 h-24" text="text-2xl" />
            <div>
              <p className="text-lg font-semibold">{user.name || user.username}</p>
              <p className="text-sm text-slate-500">@{user.username}</p>
              <span className="badge badge-primary mt-1">{ROLE_LABEL[user.role]}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button className={`btn btn-primary btn-sm ${busy ? "loading" : ""}`} onClick={() => fileRef.current?.click()} disabled={busy}>
              {user.photoUrl ? "Change photo" : "Add a photo"}
            </button>
            {user.photoUrl && (
              <button className="btn btn-ghost btn-sm" onClick={async () => { const r = await api.me.removePhoto(); setUser({ ...user, photoUrl: null }); setNotice(r.message); }}>Remove photo</button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="hidden" data-testid="my-photo-input" aria-label="Choose your photo" onChange={(e) => upload(e.target.files?.[0])} />
          </div>
          {photoError && <div className="alert alert-error mt-3 py-2" role="alert"><span>{photoError}</span></div>}
          <p className="text-xs text-slate-500 mt-3">
            {["parent", "student"].includes(user.role) ? "Your photo is visible only to you and the school office." : "Your photo is visible to people signed in to EduPro, so parents and colleagues can recognise you."}
          </p>
        </Card>
        <Card title="Change password">
          <form onSubmit={changePassword} noValidate className="space-y-2">
            {[["current", "Current password", "current-password"], ["next", "New password (12+ characters)", "new-password"], ["confirm", "New password again", "new-password"]].map(([k, label, ac]) => (
              <label key={k} className="form-control">
                <span className="label-text mb-1">{label}</span>
                <input type="password" autoComplete={ac} className={`input input-bordered ${pwErrors[k] ? "input-error" : ""}`} value={pw[k]} onChange={(e) => setPw({ ...pw, [k]: e.target.value })} />
                {pwErrors[k] && <span className="text-error text-xs mt-1">{pwErrors[k]}</span>}
              </label>
            ))}
            <button className={`btn btn-primary btn-sm mt-2 ${pwBusy ? "loading" : ""}`} type="submit" disabled={pwBusy}>Change password</button>
            <p className="text-xs text-slate-500">Your other devices will be signed out.</p>
          </form>
        </Card>
      </div>
      <div className="lg:hidden mt-4">
        <button className="btn btn-outline w-full" onClick={signOut}>Sign out</button>
      </div>
    </Layout>
  );
}
