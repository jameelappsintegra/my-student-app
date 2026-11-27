import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/layout/layout";
import { Card, EmptyState, ErrorState, Loading, PageHeader } from "../../components/common";
import SchoolSelect from "../../components/forms/SchoolSelect";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { WEEKDAYS, classLabel, formatDate, todayIso } from "../../constants";

const pad = (n) => String(n).padStart(2, "0");
const monthRange = (y, m) => ({ from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(new Date(Date.UTC(y, m + 1, 0)).getUTCDate())}` });

// Month view of a school's holidays, terms, events and homework due dates.
export default function Calendar() {
  const { user } = useAuth();
  const family = user?.role === "parent" || user?.role === "student";
  const [school, setSchool] = useState("");
  const [kidSchools, setKidSchools] = useState([]);
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!family) return;
    api.me.children().then((r) => {
      const list = [...new Map(r.data.map((k) => [k.school.id, k.school])).values()];
      setKidSchools(list);
      if (list[0]) setSchool(list[0].id);
    }).catch(setError);
  }, [family]);

  useEffect(() => {
    if (!school) return;
    setData(null); setError(null);
    api.settings.calendar(school, monthRange(ym.y, ym.m)).then((r) => setData(r.data)).catch(setError);
  }, [school, ym]);

  const byDay = useMemo(() => {
    const map = new Map();
    const add = (date, item) => map.set(date, [...(map.get(date) || []), item]);
    if (data) {
      data.holidays.forEach((h) => add(h.date, { kind: "holiday", label: h.name }));
      data.events.forEach((e) => add(e.date, { kind: "event", label: e.title }));
      data.homework.forEach((h) => add(h.date, { kind: "homework", label: `${h.subject}: ${h.title}`, sub: `${classLabel(h.className)}${h.section ? ` ${h.section}` : ""}` }));
    }
    return map;
  }, [data]);

  const first = new Date(Date.UTC(ym.y, ym.m, 1));
  const days = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
  const cells = [...Array(first.getUTCDay()).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = todayIso();
  const move = (d) => setYm(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }));
  const tone = { holiday: "bg-error/15 text-error", event: "bg-info/15 text-info", homework: "bg-warning/20 text-amber-800" };
  const listed = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const term = data?.terms?.[0];

  return (
    <Layout title="Calendar">
      <PageHeader title="School calendar" subtitle="Holidays, events and homework due dates." />
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {family ? kidSchools.length > 1 && (
          <label className="form-control"><span className="label-text mb-1">School</span>
            <select className="select select-bordered select-sm" value={school} onChange={(e) => setSchool(e.target.value)}>{kidSchools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </label>
        ) : <div className="w-64"><SchoolSelect value={school} onChange={setSchool} /></div>}
        <div className="flex items-center gap-2">
          <button className="btn btn-sm" aria-label="Previous month" onClick={() => move(-1)}>‹</button>
          <span className="font-semibold w-36 text-center" aria-live="polite">{first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
          <button className="btn btn-sm" aria-label="Next month" onClick={() => move(1)}>›</button>
        </div>
      </div>
      {error ? <ErrorState error={error} /> : !data ? <Loading /> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2 p-3 sm:p-5">
            {term && <p className="text-xs text-slate-500 mb-2">{data.terms.map((t) => `${t.name}: ${formatDate(t.start)} – ${formatDate(t.end)}`).join(" · ")}</p>}
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500 mb-1">
              {WEEKDAYS.map((d) => <div key={d}>{d.slice(0, 3)}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <div key={`b${i}`} />;
                const date = `${ym.y}-${pad(ym.m + 1)}-${pad(d)}`;
                const items = byDay.get(date) || [];
                const off = data.weeklyOffs.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
                const holiday = items.some((x) => x.kind === "holiday");
                return (
                  <div key={date} className={`min-h-[3.5rem] sm:min-h-[5rem] rounded-lg border p-1 text-left ${date === today ? "border-primary ring-1 ring-primary" : "border-slate-100"} ${holiday ? "bg-error/5" : off ? "bg-slate-50" : "bg-white"}`} aria-label={`${formatDate(date)}${items.length ? `: ${items.map((x) => x.label).join(", ")}` : ""}`}>
                    <span className={`text-xs font-semibold ${holiday ? "text-error" : off ? "text-slate-400" : "text-slate-700"}`}>{d}</span>
                    <div className="hidden sm:block space-y-0.5 mt-0.5">
                      {items.slice(0, 2).map((x, j) => <p key={j} className={`text-[10px] leading-tight rounded px-1 truncate ${tone[x.kind]}`}>{x.label}</p>)}
                      {items.length > 2 && <p className="text-[10px] text-slate-400">+{items.length - 2} more</p>}
                    </div>
                    {items.length > 0 && <div className="sm:hidden flex gap-0.5 mt-1">{items.slice(0, 3).map((x, j) => <span key={j} className={`w-1.5 h-1.5 rounded-full ${x.kind === "holiday" ? "bg-error" : x.kind === "event" ? "bg-info" : "bg-warning"}`} />)}</div>}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-error" />Holiday</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-info" />Event</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning" />Homework due</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-slate-200" />Weekly off</span>
            </div>
          </Card>
          <Card title="This month">
            {listed.length === 0 ? <EmptyState title="Nothing scheduled" message="No holidays, events or homework this month." /> : (
              <ul className="space-y-3">
                {listed.map(([date, items]) => (
                  <li key={date}>
                    <p className="text-xs font-semibold text-slate-500">{formatDate(date)}</p>
                    {items.map((x, j) => <p key={j} className="text-sm"><span className={`badge badge-xs mr-1 ${x.kind === "holiday" ? "badge-error" : x.kind === "event" ? "badge-info" : "badge-warning"}`} />{x.label}{x.sub ? <span className="text-xs text-slate-400"> · {x.sub}</span> : null}</p>)}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </Layout>
  );
}
