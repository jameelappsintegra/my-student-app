import { useEffect, useState } from "react";
import Layout from "../../components/layout/layout";
import { Card, Dialog, EmptyState, ErrorState, Loading, PageHeader } from "../../components/common";
import ClassPicker from "../../components/forms/ClassPicker";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { classLabel } from "../../constants";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

function Grid({ entries, onCell, showClass }) {
  const at = (d, p) => entries.find((e) => e.day === d && e.period === p);
  return (
    <div className="overflow-x-auto">
      <table className="table table-compact w-full text-center">
        <thead><tr><th className="text-left">Period</th>{DAYS.map((d) => <th key={d}>{d}</th>)}</tr></thead>
        <tbody>
          {PERIODS.map((p) => (
            <tr key={p}>
              <th className="text-left">{p}</th>
              {DAYS.map((_, i) => {
                const e = at(i + 1, p);
                return (
                  <td key={i} className="p-1">
                    <button type="button" disabled={!onCell} onClick={() => onCell?.(i + 1, p, e)} aria-label={`${DAYS[i]} period ${p}: ${e ? e.subject : "free"}`}
                      className={`w-full min-h-[3rem] rounded-md text-xs px-1 ${e ? "bg-primary/10 text-slate-800" : "bg-slate-50 text-slate-300"} ${onCell ? "hover:ring-2 hover:ring-primary/40" : "cursor-default"}`}>
                      {e ? (<><span className="block font-medium">{e.subject}</span><span className="block text-[10px] text-slate-500">{showClass ? `${classLabel(e.className)} ${e.section}` : e.teacher?.name || ""}{e.room ? ` · ${e.room}` : ""}</span></>) : "—"}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SlotDialog({ cls, slot, teachers, onClose, onSaved }) {
  const [f, setF] = useState({ subject: slot.entry?.subject || "", teacher: slot.entry?.teacher?.id || "", room: slot.entry?.room || "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const key = { ...cls, day: slot.day, period: slot.period };
  const run = async (fn) => { setBusy(true); setError(null); try { await fn(); onSaved(); } catch (err) { setError(err); setBusy(false); } };
  return (
    <Dialog title={`${DAYS[slot.day - 1]}, period ${slot.period}`} onClose={onClose} footer={<>
      {slot.entry && <button className="btn btn-ghost text-error" disabled={busy} onClick={() => run(() => api.timetable.clear(key))}>Clear period</button>}
      <button className={`btn btn-primary ${busy ? "loading" : ""}`} disabled={busy || !f.subject.trim()} onClick={() => run(() => api.timetable.set({ ...key, subject: f.subject.trim(), teacher: f.teacher || undefined, room: f.room.trim() || undefined }))}>Save</button>
    </>}>
      <div className="grid gap-2">
        <label className="form-control"><span className="label-text mb-1">Subject</span><input className="input input-bordered" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
        <label className="form-control"><span className="label-text mb-1">Teacher</span>
          <select className="select select-bordered" value={f.teacher} onChange={(e) => setF({ ...f, teacher: e.target.value })}>
            <option value="">Not set</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="form-control"><span className="label-text mb-1">Room</span><input className="input input-bordered" value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} /></label>
      </div>
      <p className="text-xs text-slate-500 mt-2">A teacher or room already booked in this period elsewhere is refused.</p>
      {error && <div className="alert alert-error mt-3 py-2" role="alert"><span>{error.message}</span></div>}
    </Dialog>
  );
}

export default function Timetable() {
  const { user, can } = useAuth();
  const canEdit = can("timetable.manage");
  const [tab, setTab] = useState(user?.role === "teacher" ? "mine" : "class");
  const [cls, setCls] = useState({ school: "", className: "", section: "" });
  const [state, setState] = useState({ loading: false, error: null, entries: null });
  const [teachers, setTeachers] = useState([]);
  const [slot, setSlot] = useState(null);

  const load = () => {
    if (tab === "mine") {
      setState({ loading: true, error: null, entries: null });
      api.timetable.mine().then((r) => setState({ loading: false, error: null, entries: r.data })).catch((error) => setState({ loading: false, error, entries: null }));
    } else if (cls.school && cls.className) {
      setState({ loading: true, error: null, entries: null });
      api.timetable.forClass(cls).then((r) => setState({ loading: false, error: null, entries: r.data })).catch((error) => setState({ loading: false, error, entries: null }));
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [tab, cls.school, cls.className, cls.section]);
  // Parents start on their first child's class.
  useEffect(() => {
    if (user?.role !== "parent") return;
    api.me.children().then((r) => {
      const k = r.data[0];
      if (k) setCls({ school: k.school.id, className: k.className, section: k.section || "" });
    }).catch(() => {});
  }, [user?.role]);
  useEffect(() => {
    if (canEdit) api.users.list({ role: "teacher" }).then((r) => setTeachers(r.data)).catch(() => setTeachers([]));
  }, [canEdit]);

  return (
    <Layout title="Timetable">
      <PageHeader title="Timetable" subtitle={canEdit ? "Tap a period to set the subject, teacher and room." : "The weekly timetable."} />
      {user?.role === "teacher" && (
        <div className="tabs tabs-boxed bg-white border border-slate-200 inline-flex mb-4" role="tablist">
          <button role="tab" aria-selected={tab === "mine"} className={`tab ${tab === "mine" ? "tab-active" : ""}`} onClick={() => setTab("mine")}>My timetable</button>
          <button role="tab" aria-selected={tab === "class"} className={`tab ${tab === "class" ? "tab-active" : ""}`} onClick={() => setTab("class")}>A class</button>
        </div>
      )}
      {tab === "class" && <Card className="mb-4"><ClassPicker value={cls} onChange={setCls} sectionPlaceholder="e.g. A" /></Card>}
      <Card>
        {tab === "class" && !(cls.school && cls.className) ? <EmptyState title="Choose a class" message="Pick the school and class to see its week." /> :
          state.loading ? <Loading /> : state.error ? <ErrorState error={state.error} onRetry={load} /> : state.entries && (
            <Grid entries={state.entries} showClass={tab === "mine"} onCell={canEdit && tab === "class" ? (day, period, entry) => setSlot({ day, period, entry }) : null} />
          )}
      </Card>
      {slot && <SlotDialog cls={cls} slot={slot} teachers={teachers} onClose={() => setSlot(null)} onSaved={() => { setSlot(null); load(); }} />}
    </Layout>
  );
}
