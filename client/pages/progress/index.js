import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../../components/layout/layout";
import { Avatar, Card, EmptyState, ErrorState, Loading, NoAccess, PageHeader } from "../../components/common";
import Chart from "../../components/common/Chart";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { classLabel, formatDate, money } from "../../constants";

const MONTH = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
const HW = { graded: ["Marked", "badge-success"], submitted: ["Handed in", "badge-info"], returned: ["Redo", "badge-warning"], missing: ["Missing", "badge-error"], pending: ["To do", "badge-ghost"], paper: ["On paper", "badge-ghost"] };

function Tile({ label, value, hint, tone = "" }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function Change({ value }) {
  if (value == null) return null;
  const up = value > 0;
  return <span className={`text-xs font-medium ${up ? "text-success" : value < 0 ? "text-error" : "text-slate-500"}`}>{up ? "▲" : value < 0 ? "▼" : "•"} {Math.abs(value)} pts</span>;
}

function ProgressView({ id }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    setState({ loading: true });
    api.students.progress(id).then((r) => setState({ data: r.data })).catch((error) => setState({ error }));
  }, [id]);
  if (state.loading) return <Loading />;
  if (state.error) return <ErrorState error={state.error} />;
  const d = state.data;
  const r = d.results;
  const att = d.attendance;
  const hw = d.homework.summary;
  const pass = d.grading.passPercentage;

  const trend = {
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", valueFormatter: (v) => `${v}%` },
    xAxis: { type: "category", data: r.exams.map((e) => e.exam), axisLabel: { interval: 0 } },
    yAxis: { type: "value", min: 0, max: 100 },
    series: [{ type: "line", smooth: true, symbolSize: 8, data: r.exams.map((e) => e.percentage), itemStyle: { color: "#4f46e5" }, label: { show: true, formatter: "{c}%" },
      markLine: { silent: true, symbol: "none", lineStyle: { color: "#ef4444", type: "dashed" }, data: [{ yAxis: pass, label: { position: "insideEndTop", formatter: `Pass ${pass}%` } }] } }],
  };
  const subjects = {
    grid: { left: 8, right: 24, top: 32, bottom: 8, containLabel: true },
    legend: { top: 0, data: ["Latest", "Previous"] },
    tooltip: { trigger: "axis", valueFormatter: (v) => (v == null ? "—" : `${v}%`) },
    xAxis: { type: "value", min: 0, max: 100 },
    yAxis: { type: "category", data: r.subjects.map((s) => s.subject), inverse: true, axisLabel: { width: 110, overflow: "truncate" } },
    series: [
      { name: "Latest", type: "bar", data: r.subjects.map((s) => s.percentage), itemStyle: { color: "#4f46e5", borderRadius: [0, 4, 4, 0] } },
      { name: "Previous", type: "bar", data: r.subjects.map((s) => s.previous), itemStyle: { color: "#c7d2fe", borderRadius: [0, 4, 4, 0] } },
    ],
  };
  const monthly = {
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", valueFormatter: (v) => (v == null ? "—" : `${v}%`) },
    xAxis: { type: "category", data: att.monthly.map((m) => MONTH(m.month)) },
    yAxis: { type: "value", min: 0, max: 100 },
    series: [{ type: "bar", data: att.monthly.map((m) => ({ value: m.percentage, itemStyle: { color: m.percentage != null && m.percentage < 75 ? "#ef4444" : "#14b8a6", borderRadius: [4, 4, 0, 0] } })) }],
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Attendance this year" value={att.percentage != null ? `${att.percentage}%` : "—"} hint={`${att.schoolDays} school days · ${att.absent} absent`} tone={att.percentage != null && att.percentage < 75 ? "text-error" : ""} />
        <Tile label={r.latest ? `Latest: ${r.latest.exam}` : "Exams"} value={r.latest ? `${r.latest.percentage}% ${r.latest.grade}` : "—"} hint={r.latest ? <><span>{r.latest.passed ? "Passed" : "Needs re-test"}</span> <Change value={r.change} /></> : "No published results yet"} />
        <Tile label="Homework handed in" value={hw.handInRate != null ? `${hw.handInRate}%` : "—"} hint={`${hw.handedIn} of ${hw.online - hw.pending} due · ${hw.missing} missing`} tone={hw.missing ? "text-warning" : ""} />
        {d.fees ? (
          <Tile label="Fees due" value={d.fees.balance ? money(d.fees.balance, d.fees.currency, d.fees.locale) : "Paid"} hint={d.fees.overdue ? `${money(d.fees.overdue, d.fees.currency, d.fees.locale)} overdue` : "Nothing overdue"} tone={d.fees.overdue ? "text-error" : ""} />
        ) : (
          <Tile label="Library" value={`${d.library.onLoan} book${d.library.onLoan === 1 ? "" : "s"}`} hint={d.library.overdue ? `${d.library.overdue} overdue` : "borrowed now"} tone={d.library.overdue ? "text-error" : ""} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Exam results over time">
          {r.exams.length === 0 ? <EmptyState title="No results yet" message="Marks appear here once the school publishes them." /> : (
            <>
              <Chart option={trend} label={`Exam percentages: ${r.exams.map((e) => `${e.exam} ${e.percentage}%`).join(", ")}`} />
              <ul className="flex flex-wrap gap-2 mt-2 text-xs">
                {r.exams.map((e) => <li key={`${e.academicYear}-${e.exam}`} className="badge badge-ghost">{e.exam}: {e.percentage}% {e.grade}</li>)}
              </ul>
            </>
          )}
        </Card>
        <Card title={r.latest ? `Subjects in ${r.latest.exam}` : "Subjects"}>
          {r.subjects.length === 0 ? <EmptyState title="No subjects yet" /> : (
            <>
              <Chart option={subjects} height={Math.max(180, r.subjects.length * 44 + 40)} label={`Subject percentages: ${r.subjects.map((s) => `${s.subject} ${s.percentage}%`).join(", ")}`} />
              <ul className="divide-y divide-slate-100 mt-2">
                {r.subjects.map((s) => (
                  <li key={s.subject} className="flex justify-between items-center py-1.5 text-sm">
                    <span>{s.subject}</span>
                    <span className="flex items-center gap-2"><span className="tabular-nums">{s.percentage}%</span><span className={`badge badge-sm ${s.passed ? "badge-ghost" : "badge-error"}`}>{s.grade}</span><Change value={s.change} /></span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card title="Attendance by month">
          {att.monthly.length === 0 ? <EmptyState title="No attendance marked yet" /> : (
            <>
              <Chart option={monthly} label={`Attendance by month: ${att.monthly.map((m) => `${MONTH(m.month)} ${m.percentage}%`).join(", ")}`} />
              <p className="text-xs text-slate-500 mt-1">Red bars are months below 75%. <Link href={`/students/${d.student.id}?tab=attendance`}><a className="link">Day-by-day calendar</a></Link></p>
            </>
          )}
        </Card>
        <Card title="Homework">
          <dl className="grid grid-cols-4 gap-2 text-center mb-3">
            {[["Handed in", hw.handedIn], ["Marked", hw.marked], ["Late", hw.late], ["Missing", hw.missing]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-50 p-2"><dt className="text-[11px] text-slate-500">{k}</dt><dd className={`font-semibold ${k === "Missing" && v ? "text-error" : ""}`}>{v}</dd></div>
            ))}
          </dl>
          {hw.averageMarkPercent != null && <p className="text-sm text-slate-600 mb-2">Average homework mark: <strong>{hw.averageMarkPercent}%</strong></p>}
          {d.homework.recent.length === 0 ? <p className="text-sm text-slate-500">No homework set this year.</p> : (
            <ul className="divide-y divide-slate-100">
              {d.homework.recent.map((x) => (
                <li key={x.id} className="flex justify-between items-center gap-2 py-1.5 text-sm">
                  <span className="min-w-0"><span className="block truncate">{x.subject}: {x.title}</span><span className="text-xs text-slate-400">Due {formatDate(x.dueDate)}</span></span>
                  <span className={`badge badge-sm whitespace-nowrap ${HW[x.status][1]}`}>{HW[x.status][0]}{x.status === "graded" && x.marks != null ? ` ${x.marks}${x.maxMarks ? `/${x.maxMarks}` : ""}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/homework"><a className="btn btn-sm mt-3">All homework</a></Link>
        </Card>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/students/${d.student.id}/report-card`}><a className="btn btn-sm btn-primary">Report card</a></Link>
        <Link href={`/students/${d.student.id}`}><a className="btn btn-sm">Full profile</a></Link>
        {d.fees && <Link href="/fees"><a className="btn btn-sm">Fees &amp; receipts</a></Link>}
      </div>
    </div>
  );
}

// Parents (each child) and students: how the year is going.
export default function Progress() {
  const { user } = useAuth();
  const family = user?.role === "parent" || user?.role === "student";
  const [kids, setKids] = useState(null);
  const [error, setError] = useState(null);
  const [id, setId] = useState(null);
  useEffect(() => {
    if (!family) return;
    api.me.children().then((r) => { setKids(r.data); setId(r.data[0]?.id || null); }).catch(setError);
  }, [family]);
  if (!family) return <Layout title="Progress"><NoAccess /></Layout>;
  const kid = kids?.find((k) => k.id === id);
  return (
    <Layout title="Progress">
      <PageHeader title={user.role === "student" ? "My progress" : "Progress"} subtitle={kid ? `${kid.firstName} ${kid.lastName} · ${classLabel(kid.className)}${kid.section ? ` ${kid.section}` : ""} · ${kid.school?.name}` : "Results, attendance and homework this year."} />
      {error ? <ErrorState error={error} /> : !kids ? <Loading /> : kids.length === 0 ? (
        <Card><EmptyState title="No children linked to your account" message="Contact the school office to link your children." /></Card>
      ) : (
        <>
          {kids.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Child">
              {kids.map((k) => (
                <button key={k.id} role="tab" aria-selected={k.id === id} onClick={() => setId(k.id)} className={`btn btn-sm gap-2 normal-case ${k.id === id ? "btn-primary" : "btn-ghost bg-white border-slate-200"}`}>
                  <Avatar student={k} size="w-6 h-6" text="text-[10px]" />{k.firstName}
                </button>
              ))}
            </div>
          )}
          {id && <ProgressView key={id} id={id} />}
        </>
      )}
    </Layout>
  );
}
