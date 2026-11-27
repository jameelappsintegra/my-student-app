import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../../components/layout/layout";
import { Avatar, Card, EmptyState, ErrorState, Loading, Notice, PageHeader } from "../../components/common";
import useSchools from "../../hooks/useSchools";
import { api } from "../../services/api";
import { ATTENDANCE, CLASSES, classLabel, fullName, todayIso } from "../../constants";

const QUICK = ["present", "absent", "late", "half_day", "leave"];
const KEY = "edupro.register";

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
};

export default function AttendanceRegister() {
  const { schools } = useSchools();
  const router = useRouter();
  const [where, setWhere] = useState({ school: "", className: "", section: "", date: todayIso() });
  const [state, setState] = useState({ loading: false, error: null, register: null });
  const [draft, setDraft] = useState({}); // studentId -> status
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [saveError, setSaveError] = useState(null);

  // A link (teacher home) wins; otherwise the last class used (not the date).
  useEffect(() => {
    const q = router.query;
    const saved = q.school ? q : load();
    setWhere((w) => ({
      ...w,
      school: saved.school || "",
      className: saved.className || "",
      section: saved.section || "",
      date: typeof q.date === "string" ? q.date : w.date,
    }));
  }, [router.query]);
  useEffect(() => {
    if (!where.school && schools.length === 1) setWhere((w) => ({ ...w, school: schools[0].id }));
  }, [schools, where.school]);

  const ready = where.school && where.className && where.date;
  const fetchRegister = () => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ school: where.school, className: where.className, section: where.section }));
    } catch {
      // Private mode: nothing to remember.
    }
    setState({ loading: true, error: null, register: null });
    setNotice(null);
    api.register
      .get({ ...where, section: where.section || undefined })
      .then((res) => {
        setState({ loading: false, error: null, register: res.data });
        setDraft(Object.fromEntries(res.data.students.map((s) => [s.id, s.attendance?.status || null])));
      })
      .catch((error) => setState({ loading: false, error, register: null }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fetchRegister, [where.school, where.className, where.section, where.date]);

  const reg = state.register;
  const changes = useMemo(
    () => (reg ? reg.students.filter((s) => draft[s.id] && draft[s.id] !== (s.attendance?.status || null)) : []),
    [reg, draft]
  );
  const counts = useMemo(() => {
    const c = { unmarked: 0 };
    for (const s of reg?.students || []) {
      const st = draft[s.id];
      if (st) c[st] = (c[st] || 0) + 1;
      else c.unmarked += 1;
    }
    return c;
  }, [reg, draft]);

  // Warn before leaving with unsaved marks.
  useEffect(() => {
    if (!changes.length) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changes.length]);

  const setAll = (status) => setDraft(Object.fromEntries(reg.students.map((s) => [s.id, status])));
  const markRest = () => setDraft((d) => Object.fromEntries(reg.students.map((s) => [s.id, d[s.id] || "present"])));

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const entries = reg.students.filter((s) => draft[s.id]).map((s) => ({ student: s.id, status: draft[s.id] }));
      const res = await api.register.save({ ...where, section: where.section || undefined, entries });
      setNotice(res.message);
      setState((st) => ({
        ...st,
        register: { ...st.register, students: st.register.students.map((s) => ({ ...s, attendance: draft[s.id] ? { status: draft[s.id] } : s.attendance })) },
      }));
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  };

  const set = (k) => (e) => setWhere((w) => ({ ...w, [k]: k === "section" ? e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase() : e.target.value }));

  return (
    <Layout title="Attendance">
      <PageHeader title="Attendance register" subtitle="Mark a whole class for one day." />
      <Card className="mb-4">
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
          <label className="form-control col-span-2 lg:col-span-1">
            <span className="label-text mb-1">School</span>
            <select className="select select-bordered select-sm" value={where.school} onChange={set("school")}>
              <option value="">Select…</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Class</span>
            <select className="select select-bordered select-sm" value={where.className} onChange={set("className")}>
              <option value="">Select…</option>
              {CLASSES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Section</span>
            <input className="input input-bordered input-sm" value={where.section} maxLength={5} placeholder="All" onChange={set("section")} />
          </label>
          <label className="form-control col-span-2 lg:col-span-1">
            <span className="label-text mb-1">Date</span>
            <input type="date" className="input input-bordered input-sm" max={todayIso()} value={where.date} onChange={set("date")} />
          </label>
        </div>
      </Card>

      <Notice message={notice} onDismiss={() => setNotice(null)} />
      {reg?.offDay && <div className="alert alert-warning py-2 mb-3" role="status"><span>{reg.offDay === "Weekly off" ? "This day is a weekly off for the school." : `This day is a holiday: ${reg.offDay}.`} Mark attendance only if school was open.</span></div>}
      {!ready ? (
        <Card><EmptyState title="Choose a class" message="Pick the school, class and date to open the register." /></Card>
      ) : state.loading ? (
        <Loading label="Opening register…" />
      ) : state.error ? (
        <ErrorState error={state.error} onRetry={fetchRegister} />
      ) : reg && reg.students.length === 0 ? (
        <Card>
          <EmptyState
            title="No active students in this class"
            message={`${classLabel(where.className)}${where.section ? ` ${where.section}` : ""} at ${reg.school.name} has no active students.`}
            action={<Link href="/students/new"><a className="btn btn-sm btn-primary">Add student</a></Link>}
          />
        </Card>
      ) : reg ? (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-sm text-slate-600 mr-auto">
              {reg.students.length} students · {counts.present || 0} present · {counts.absent || 0} absent
              {counts.unmarked ? ` · ${counts.unmarked} not marked` : ""}
            </span>
            <button className="btn btn-sm" onClick={markRest} disabled={!counts.unmarked}>Mark rest present</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setAll("holiday")}>Holiday</button>
          </div>
          <Card className="!p-0">
            <ul className="divide-y divide-slate-100">
              {reg.students.map((s) => (
                <li key={s.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-9 text-right text-sm text-slate-400 tabular-nums">
                      {/* With all sections shown, prefix the section so roll numbers stay unique. */}
                      {!where.section && s.section ? `${s.section}-` : ""}
                      {s.rollNumber || "—"}
                    </span>
                    <Avatar student={s} size="w-9 h-9" text="text-xs" />
                    <Link href={`/students/${s.id}?tab=attendance`}>
                      <a className="font-medium text-slate-800 truncate hover:text-primary">{fullName(s)}</a>
                    </Link>
                    {draft[s.id] === "holiday" && <span className="badge badge-ghost badge-sm">Holiday</span>}
                  </div>
                  <div className="btn-group w-full sm:w-auto" role="radiogroup" aria-label={`Attendance for ${fullName(s)}`}>
                    {QUICK.map((k) => (
                      <button
                        key={k}
                        role="radio"
                        aria-checked={draft[s.id] === k}
                        aria-label={ATTENDANCE[k].label}
                        title={ATTENDANCE[k].label}
                        className={`btn btn-sm flex-1 sm:flex-none sm:w-12 h-10 ${draft[s.id] === k ? `${ATTENDANCE[k].cell} border-transparent` : "btn-outline border-slate-200 text-slate-600"}`}
                        onClick={() => setDraft((d) => ({ ...d, [s.id]: k }))}
                      >
                        {ATTENDANCE[k].short}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-xs text-slate-500 mt-2">P present · A absent · L late · ½ half day · Lv leave. Tap a name to see that student&apos;s calendar.</p>
          {saveError && <div className="alert alert-error mt-3" role="alert"><span>{saveError.message}</span></div>}
          <div className={`${changes.length ? "sticky bottom-20 lg:bottom-4" : ""} z-10 flex justify-end mt-4`}>
            <button className={`btn btn-primary shadow-lg ${saving ? "loading" : ""}`} onClick={save} disabled={saving || !changes.length}>
              {changes.length ? `Save attendance (${changes.length} ${changes.length === 1 ? "change" : "changes"})` : "All saved"}
            </button>
          </div>
        </>
      ) : null}
    </Layout>
  );
}
