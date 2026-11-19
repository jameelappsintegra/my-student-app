import { useState } from "react";
import { Card, Dialog, ErrorState, Loading } from "../common";
import useApi from "../../hooks/useApi";
import { api } from "../../services/api";
import { ATTENDANCE, todayIso } from "../../constants";

const pad = (n) => String(n).padStart(2, "0");
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthBounds(y, m) {
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}`, last };
}

export default function AttendanceTab({ studentId, yearSummary, onChanged, canEdit = true }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const { from, to, last } = monthBounds(ym.y, ym.m);
  const today = todayIso();
  const { data, loading, error, reload } = useApi(
    () => api.students.attendance(studentId, { from, to: to > today ? today : to }),
    [studentId, from]
  );
  const [day, setDay] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dErr, setDErr] = useState(null);

  const byDate = Object.fromEntries((data?.records || []).map((r) => [r.date, r]));
  const firstWeekday = (new Date(Date.UTC(ym.y, ym.m, 1)).getUTCDay() + 6) % 7;
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: last }, (_, i) => `${ym.y}-${pad(ym.m + 1)}-${pad(i + 1)}`)];
  const monthLabel = new Date(Date.UTC(ym.y, ym.m, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const shift = (d) => setYm(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }));
  const atCurrentMonth = ym.y === now.getFullYear() && ym.m === now.getMonth();

  const save = async (status) => {
    setBusy(true);
    setDErr(null);
    try {
      const res = status ? await api.students.markAttendance(studentId, day, status) : await api.students.clearAttendance(studentId, day);
      setDay(null);
      reload();
      onChanged(res.message);
    } catch (err) {
      setDErr(err);
    } finally {
      setBusy(false);
    }
  };

  const s = yearSummary;
  return (
    <div className="space-y-4">
      {s && (
        <Card title={`This academic year (since ${s.from ? s.from.slice(0, 10) : ""})`}>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="mr-4">
              <p className={`text-3xl font-semibold ${s.summary.percentage < 75 ? "text-error" : "text-slate-900"}`}>
                {s.summary.percentage != null ? `${s.summary.percentage}%` : "—"}
              </p>
              <p className="text-xs text-slate-500">{s.summary.workingDays} school days recorded</p>
            </div>
            {["present", "absent", "late", "half_day", "leave", "holiday"].map((k) => (
              <span key={k} className={`badge ${ATTENDANCE[k].badge} gap-1`}>{ATTENDANCE[k].label}: {s.summary[k]}</span>
            ))}
          </div>
          {s.summary.percentage !== null && s.summary.percentage < 75 && (
            <p className="text-sm text-error mt-3">Below 75%. Consider contacting the parents.</p>
          )}
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-3">
          <button className="btn btn-sm btn-ghost" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
          <h3 className="font-semibold">{monthLabel}</h3>
          <button className="btn btn-sm btn-ghost" onClick={() => shift(1)} disabled={atCurrentMonth} aria-label="Next month">›</button>
        </div>
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500 mb-1">
              {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`Attendance for ${monthLabel}`}>
              {cells.map((date, i) => {
                if (!date) return <span key={`e${i}`} />;
                const rec = byDate[date];
                const future = date > today;
                return (
                  <button
                    key={date}
                    role="gridcell"
                    disabled={future || !canEdit}
                    onClick={() => { setDErr(null); setDay(date); }}
                    aria-label={`${date}: ${rec ? ATTENDANCE[rec.status].label : "not marked"}`}
                    className={`aspect-square rounded-md text-xs sm:text-sm flex flex-col items-center justify-center leading-tight ${
                      rec ? ATTENDANCE[rec.status].cell : "bg-slate-50 text-slate-400"
                    } ${future ? "opacity-40" : canEdit ? "hover:ring-2 hover:ring-primary/40" : "cursor-default"} ${date === today ? "ring-2 ring-primary" : ""}`}
                  >
                    <span className="font-medium">{Number(date.slice(8))}</span>
                    {rec && <span className="text-[10px] opacity-80">{ATTENDANCE[rec.status].short}</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-3">
              This month: {data.summary.present} present, {data.summary.absent} absent, {data.summary.late} late, {data.summary.leave} on leave. {canEdit ? "Tap a day to mark or correct it." : ""}
            </p>
          </>
        )}
      </Card>

      {day && (
        <Dialog title={`Attendance on ${day}`} onClose={() => setDay(null)}>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(ATTENDANCE).map(([k, v]) => (
              <button key={k} className={`btn btn-sm ${byDate[day]?.status === k ? "btn-primary" : ""}`} onClick={() => save(k)} disabled={busy}>
                {v.label}
              </button>
            ))}
          </div>
          {byDate[day] && (
            <button className="btn btn-ghost btn-sm text-error mt-3 w-full" onClick={() => save(null)} disabled={busy}>Clear this day</button>
          )}
          {dErr && <div className="alert alert-error mt-3 py-2"><span>{dErr.message}</span></div>}
        </Dialog>
      )}
    </div>
  );
}
