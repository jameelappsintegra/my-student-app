import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../../components/layout/layout";
import { Avatar, Card, EmptyState, ErrorState, Loading, NoAccess, PageHeader } from "../../components/common";
import ClassPicker from "../../components/forms/ClassPicker";
import Chart from "../../components/common/Chart";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { classLabel, formatDate, money } from "../../constants";

const FLAGS = {
  low_attendance: ["Attendance below 75%", "badge-error"],
  failing: ["Failed latest exam", "badge-error"],
  missing_homework: ["Missing homework", "badge-warning"],
  fees_overdue: ["Fees overdue", "badge-warning"],
};

function Tile({ label, value, tone = "" }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

// A teacher's or principal's view of one class: who needs attention and why.
export default function Insights() {
  const { can, user } = useAuth();
  const [cls, setCls] = useState({ school: "", className: "", section: "" });
  const [state, setState] = useState({});
  const [filter, setFilter] = useState("all");
  const ready = cls.school && cls.className;

  // Opened from a class card (?school=&className=&section=), or teachers
  // start on their first class.
  const { query } = useRouter();
  useEffect(() => {
    if (query.school && query.className) {
      setCls({ school: String(query.school), className: String(query.className), section: String(query.section || "") });
      return;
    }
    if (user?.role !== "teacher") return;
    api.me.classes().then((r) => {
      const c = r.data[0];
      if (c) setCls({ school: c.school.id, className: c.className, section: c.section || "" });
    }).catch(() => {});
  }, [user?.role, query.school, query.className, query.section]);
  useEffect(() => {
    if (!ready) return;
    setState({ loading: true });
    api.insights.forClass({ ...cls, section: cls.section || undefined }).then((r) => setState({ data: r.data })).catch((error) => setState({ error }));
  }, [ready, cls]);

  if (!can("reports.view")) return <Layout title="Class insights"><NoAccess /></Layout>;
  const d = state.data;
  const rows = d ? d.rows.filter((r) => (filter === "all" ? true : filter === "attention" ? r.flags.length : r.flags.includes(filter))) : [];
  const counts = d ? Object.fromEntries(Object.keys(FLAGS).map((k) => [k, d.rows.filter((r) => r.flags.includes(k)).length])) : {};
  const m = (n) => money(n, d?.currency, d?.locale);
  const daily = d && {
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", valueFormatter: (v) => `${v}%` },
    xAxis: { type: "category", data: d.daily.map((x) => formatDate(x.date).slice(0, 6)) },
    yAxis: { type: "value", min: 0, max: 100 },
    series: [{ type: "line", smooth: true, areaStyle: { opacity: 0.15 }, itemStyle: { color: "#14b8a6" }, data: d.daily.map((x) => x.percentage) }],
  };

  return (
    <Layout title="Class insights">
      <PageHeader title="Class insights" subtitle="Attendance, marks, homework and fees for one class, and who needs attention." />
      <Card className="mb-4"><ClassPicker value={cls} onChange={setCls} /></Card>
      {!ready ? <Card><EmptyState title="Choose a class" message="Pick a school and class." /></Card> : state.loading ? <Loading /> : state.error ? <ErrorState error={state.error} /> : d && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Tile label="Students" value={d.summary.students} />
            <Tile label="Average attendance" value={d.summary.averageAttendance != null ? `${d.summary.averageAttendance}%` : "—"} tone={d.summary.averageAttendance != null && d.summary.averageAttendance < 75 ? "text-error" : ""} />
            <Tile label="Average latest exam" value={d.summary.averageResult != null ? `${d.summary.averageResult}%` : "—"} />
            <Tile label="Homework handed in" value={d.summary.homeworkHandInRate != null ? `${d.summary.homeworkHandInRate}%` : "—"} />
            <Tile label="Need attention" value={d.summary.needsAttention} tone={d.summary.needsAttention ? "text-warning" : "text-success"} />
          </div>
          {d.daily.length > 1 && (
            <Card title="Daily attendance (last marked days)">
              <Chart option={daily} height={200} label={`Daily attendance: ${d.daily.map((x) => `${x.date} ${x.percentage}%`).join(", ")}`} />
            </Card>
          )}
          <Card>
            <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Show">
              {[["all", `All (${d.rows.length})`], ["attention", `Need attention (${d.summary.needsAttention})`], ...Object.entries(FLAGS).filter(([k]) => counts[k]).map(([k, [l]]) => [k, `${l} (${counts[k]})`])].map(([k, l]) => (
                <button key={k} role="tab" aria-selected={filter === k} className={`btn btn-xs normal-case ${filter === k ? "btn-primary" : "btn-ghost bg-slate-100"}`} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
            {rows.length === 0 ? <EmptyState title={filter === "all" ? "No active students" : "Nobody here"} message={filter === "all" ? "" : "No students match this filter."} /> : (
              <div className="xl:overflow-x-auto">
                <table className="table table-compact w-full table-stack">
                  <thead><tr><th>Student</th><th>Attendance</th><th>Latest exam</th><th>Homework</th>{d.summary.feesOverdue !== undefined && <th>Fees due</th>}<th>Flags</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.student.id}>
                        <td data-primary>
                          <Link href={`/students/${r.student.id}`}><a className="flex items-center gap-2 hover:text-primary"><Avatar person={{ name: r.student.name, photoUrl: r.student.photoUrl }} size="w-8 h-8" text="text-xs" /><span>{r.student.rollNumber ? `${r.student.rollNumber}. ` : ""}{r.student.name}</span></a></Link>
                        </td>
                        <td data-label="Attendance" className={`tabular-nums ${r.attendance.percentage != null && r.attendance.percentage < 75 ? "text-error font-semibold" : ""}`}>{r.attendance.percentage != null ? `${r.attendance.percentage}%` : "—"}<span className="text-xs text-slate-400 block">{r.attendance.absent} absent</span></td>
                        <td data-label="Latest exam" className={r.latestResult && !r.latestResult.passed ? "text-error font-semibold" : ""}>{r.latestResult ? `${r.latestResult.percentage}% ${r.latestResult.grade}` : "—"}{r.latestResult && <span className="text-xs text-slate-400 block font-normal">{r.latestResult.exam}{r.latestResult.status === "draft" ? " · draft" : ""}</span>}</td>
                        <td data-label="Homework" className="tabular-nums">{r.homework.due ? `${r.homework.handedIn}/${r.homework.due}` : "—"}</td>
                        {d.summary.feesOverdue !== undefined && <td data-label="Fees due" className={`tabular-nums ${r.fees?.overdue ? "text-error" : ""}`}>{r.fees?.balance ? m(r.fees.balance) : "Nil"}</td>}
                        <td data-label="Flags">{r.flags.length ? <span className="inline-flex flex-wrap gap-1 justify-end">{r.flags.map((f) => <span key={f} className={`badge badge-sm ${FLAGS[f][1]}`}>{FLAGS[f][0]}</span>)}</span> : <span className="text-xs text-success">On track</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-3">{classLabel(d.className)}{d.section ? ` ${d.section}` : ""} · {d.school.name} · academic year from {formatDate(d.range.from)}. Teachers see draft marks; parents see published marks only.</p>
          </Card>
        </div>
      )}
    </Layout>
  );
}
