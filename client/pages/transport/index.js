import { useState } from "react";
import Layout from "../../components/layout/layout";
import { Card, ConfirmDialog, Dialog, EmptyState, ErrorState, Loading, NoAccess, Notice, PageHeader } from "../../components/common";
import SchoolSelect from "../../components/forms/SchoolSelect";
import StudentPicker from "../../components/forms/StudentPicker";
import useApi from "../../hooks/useApi";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { classLabel } from "../../constants";

const errText = (err) => (err.errors?.length ? err.errors.map((e) => e.message).join(". ") : err.message);

function RouteDialog({ route, school, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    name: route?.name || "", vehicleNumber: route?.vehicleNumber || "", capacity: route?.capacity || 40,
    driverName: route?.driverName || "", driverPhone: route?.driverPhone || "", attendantName: route?.attendantName || "", attendantPhone: route?.attendantPhone || "",
    stops: route?.stops?.map((s) => ({ name: s.name, pickupTime: s.pickupTime || "", dropTime: s.dropTime || "", fee: s.fee ?? "" })) || [{ name: "", pickupTime: "", dropTime: "", fee: "" }],
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setStop = (i, patch) => setF({ ...f, stops: f.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const save = async () => {
    setBusy(true); setError(null);
    const body = { school: route?.school?.id || school, ...f, capacity: Number(f.capacity), stops: f.stops.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), pickupTime: s.pickupTime, dropTime: s.dropTime, ...(s.fee !== "" ? { fee: Number(s.fee) } : {}) })) };
    try { const r = route ? await api.transport.update(route.id, body) : await api.transport.create(body); onSaved(r.message); } catch (err) { setError(errText(err)); setBusy(false); }
  };
  return (
    <Dialog title={route ? `Edit ${route.name}` : "New bus route"} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className={`btn btn-primary ${busy ? "loading" : ""}`} disabled={busy} onClick={save}>Save route</button></>}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="form-control sm:col-span-2"><span className="label-text mb-1">Route name</span><input className="input input-bordered input-sm" value={f.name} onChange={set("name")} placeholder="Route 3 – Beach Road" /></label>
        <label className="form-control"><span className="label-text mb-1">Seats</span><input type="number" min="1" className="input input-bordered input-sm" value={f.capacity} onChange={set("capacity")} /></label>
        <label className="form-control"><span className="label-text mb-1">Vehicle number</span><input className="input input-bordered input-sm" value={f.vehicleNumber} onChange={set("vehicleNumber")} /></label>
        <label className="form-control"><span className="label-text mb-1">Driver</span><input className="input input-bordered input-sm" value={f.driverName} onChange={set("driverName")} /></label>
        <label className="form-control"><span className="label-text mb-1">Driver phone</span><input type="tel" className="input input-bordered input-sm" value={f.driverPhone} onChange={set("driverPhone")} /></label>
        <label className="form-control"><span className="label-text mb-1">Attendant</span><input className="input input-bordered input-sm" value={f.attendantName} onChange={set("attendantName")} /></label>
        <label className="form-control"><span className="label-text mb-1">Attendant phone</span><input type="tel" className="input input-bordered input-sm" value={f.attendantPhone} onChange={set("attendantPhone")} /></label>
      </div>
      <h3 className="font-medium text-sm mt-4 mb-2">Stops, in order</h3>
      <div className="space-y-2">
        {f.stops.map((s, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-slate-400 w-4">{i + 1}</span>
            <input className="input input-bordered input-sm flex-1 min-w-[8rem]" aria-label={`Stop ${i + 1} name`} placeholder="Stop name" value={s.name} onChange={(e) => setStop(i, { name: e.target.value })} />
            <input type="time" className="input input-bordered input-sm" aria-label={`Stop ${i + 1} pickup`} value={s.pickupTime} onChange={(e) => setStop(i, { pickupTime: e.target.value })} />
            <input type="time" className="input input-bordered input-sm" aria-label={`Stop ${i + 1} drop`} value={s.dropTime} onChange={(e) => setStop(i, { dropTime: e.target.value })} />
            <input type="number" min="0" className="input input-bordered input-sm w-24" aria-label={`Stop ${i + 1} fee`} placeholder="Fee" value={s.fee} onChange={(e) => setStop(i, { fee: e.target.value })} />
            <button type="button" className="btn btn-ghost btn-xs text-error" onClick={() => setF({ ...f, stops: f.stops.filter((_, j) => j !== i) })} disabled={f.stops.length === 1}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setF({ ...f, stops: [...f.stops, { name: "", pickupTime: "", dropTime: "", fee: "" }] })}>Add stop</button>
      </div>
      <p className="text-xs text-slate-500 mt-2">Times are pickup (morning) and drop (afternoon). Fee is per term for that stop.</p>
      {error && <div className="alert alert-error mt-3 py-2" role="alert"><span>{error}</span></div>}
    </Dialog>
  );
}

function AssignDialog({ route, onClose, onSaved }) {
  const [student, setStudent] = useState(null);
  const [stop, setStop] = useState(route.stops[0]?.name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <Dialog title={`Add a student to ${route.name}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className={`btn btn-primary ${busy ? "loading" : ""}`} disabled={busy || !student} onClick={async () => {
        setBusy(true); setError(null);
        try { const r = await api.transport.assign({ student: student.id, route: route.id, stop }); onSaved(r.message); } catch (err) { setError(errText(err)); setBusy(false); }
      }}>Assign</button></>}>
      <div className="grid gap-3">
        <StudentPicker value={student} onChange={setStudent} school={route.school.id} />
        <label className="form-control"><span className="label-text mb-1">Boards at</span>
          <select className="select select-bordered select-sm" value={stop} onChange={(e) => setStop(e.target.value)}>
            {route.stops.map((s) => <option key={s.name} value={s.name}>{s.name}{s.pickupTime ? ` (${s.pickupTime})` : ""}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-slate-500 mt-2">Moving a student from another route takes them off that one. Parents are notified.</p>
      {error && <div className="alert alert-error mt-3 py-2" role="alert"><span>{error}</span></div>}
    </Dialog>
  );
}

function Riders({ route, onBack, onChanged }) {
  const { data, loading, error, reload } = useApi(() => api.transport.riders(route.id), [route.id]);
  const [dialog, setDialog] = useState(false);
  const [notice, setNotice] = useState(null);
  return (
    <>
      <button className="btn btn-ghost btn-sm mb-2" onClick={onBack}>‹ All routes</button>
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      <Card>
        <div className="flex flex-wrap justify-between gap-2 mb-3">
          <div>
            <h2 className="text-lg font-semibold">{route.name}</h2>
            <p className="text-sm text-slate-500">{route.vehicleNumber || "No vehicle"} · Driver {route.driverName || "—"} {route.driverPhone || ""} · {data ? data.riders.length : route.riders}/{route.capacity} seats</p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-primary" onClick={() => setDialog(true)}>Add student</button>
            <button className="btn btn-sm" onClick={() => window.print()}>Print list</button>
          </div>
        </div>
        {loading ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.riders.length === 0 ? <EmptyState title="No riders yet" message="Add students who take this bus." /> : (
          <div className="overflow-x-auto">
            <table className="table table-compact w-full">
              <thead><tr><th>Stop</th><th>Student</th><th>Class</th><th>Parent phone</th><th className="print:hidden" /></tr></thead>
              <tbody>
                {data.riders.map((r) => (
                  <tr key={r.id}>
                    <td>{r.stop}</td>
                    <td>{r.name}<div className="text-xs text-slate-400">{r.admissionNumber}</div></td>
                    <td>{classLabel(r.className)} {r.section || ""}</td>
                    <td>{r.contact ? <a className="link" href={`tel:${r.contact}`}>{r.contact}</a> : "—"}</td>
                    <td className="print:hidden"><button className="btn btn-ghost btn-xs text-error" onClick={async () => { try { const x = await api.transport.assign({ student: r.id, route: null }); setNotice(x.message); reload(); onChanged(); } catch (err) { setNotice(err.message); } }}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {dialog && <AssignDialog route={route} onClose={() => setDialog(false)} onSaved={(m) => { setDialog(false); setNotice(m); reload(); onChanged(); }} />}
    </>
  );
}

export default function Transport() {
  const { can } = useAuth();
  const [school, setSchool] = useState("");
  const { data, loading, error, reload } = useApi(() => (school ? api.transport.routes({ school }) : Promise.resolve({ data: null })), [school]);
  const [dialog, setDialog] = useState(null);
  const [open, setOpen] = useState(null);
  const [notice, setNotice] = useState(null);
  const [delError, setDelError] = useState(null);
  if (!can("transport.manage")) return <Layout title="Transport"><NoAccess /></Layout>;
  const done = (m) => { setDialog(null); setNotice(m); reload(); };
  return (
    <Layout title="Transport">
      <PageHeader title="School transport" subtitle="Bus routes, stops and which students ride them." actions={!open && school && <button className="btn btn-primary" onClick={() => setDialog({ kind: "route" })}>New route</button>} />
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      {!open && <div className="max-w-xs mb-4"><SchoolSelect value={school} onChange={setSchool} /></div>}
      {open ? <Riders route={open} onBack={() => setOpen(null)} onChanged={reload} /> : loading || !data ? (school ? <Loading /> : null) : error ? <ErrorState error={error} onRetry={reload} /> : data.length === 0 ? (
        <Card><EmptyState title="No routes yet" message="Add the school's bus routes and their stops." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.map((r) => {
            const pct = Math.round((r.riders / r.capacity) * 100);
            return (
              <Card key={r.id}>
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-900 truncate">{r.name} {!r.active && <span className="badge badge-ghost badge-sm">Not running</span>}</h2>
                    <p className="text-sm text-slate-500">{r.vehicleNumber || "No vehicle"} · {r.driverName || "No driver"}{r.driverPhone ? ` · ${r.driverPhone}` : ""}</p>
                  </div>
                  <span className={`badge ${pct >= 100 ? "badge-error" : pct >= 85 ? "badge-warning" : "badge-ghost"}`}>{r.riders}/{r.capacity}</span>
                </div>
                <progress className={`progress w-full mt-2 ${pct >= 100 ? "progress-error" : "progress-primary"}`} value={r.riders} max={r.capacity} aria-label="Seats taken" />
                <p className="text-xs text-slate-500 mt-2 truncate">{r.stops.map((s) => `${s.name}${s.pickupTime ? ` ${s.pickupTime}` : ""}`).join(" → ")}</p>
                <div className="flex gap-2 justify-end mt-3">
                  <button className="btn btn-sm btn-primary" onClick={() => setOpen(r)}>Riders</button>
                  <button className="btn btn-sm" onClick={() => setDialog({ kind: "route", route: r })}>Edit</button>
                  <button className="btn btn-sm btn-ghost text-error" onClick={() => { setDelError(null); setDialog({ kind: "delete", route: r }); }}>Delete</button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {dialog?.kind === "route" && <RouteDialog route={dialog.route} school={school} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === "delete" && (
        <ConfirmDialog title={`Delete ${dialog.route.name}?`} message="Only routes with no riders can be deleted." error={delError} onClose={() => setDialog(null)}
          onConfirm={async () => { try { const r = await api.transport.remove(dialog.route.id); done(r.message); } catch (err) { setDelError(err); } }} />
      )}
    </Layout>
  );
}
