import Link from "next/link";
import { Avatar, Card, EmptyState, ErrorState, Loading, PageHeader } from "../common";
import useApi from "../../hooks/useApi";
import { api } from "../../services/api";
import { classLabel, formatDate, fullName, todayIso } from "../../constants";

async function load() {
  const [me, hw] = await Promise.all([api.me.children(), api.homework.list({ upcoming: true })]);
  return { data: { me: me.data[0] || null, homework: hw.data } };
}

// A student's home: their own summary and what's due next.
export default function StudentHome() {
  const { data, loading, error, reload } = useApi(load, []);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const k = data.me;
  if (!k) return <Card><EmptyState title="Your login isn't linked to a student record" message="Ask the school office to fix your account." /></Card>;
  const today = todayIso();
  const todo = data.homework.filter((h) => h.onlineSubmission && !(h.submissions || []).some((s) => s.status !== "returned"));
  return (
    <>
      <PageHeader title={`Hi, ${k.firstName}`} subtitle={`${classLabel(k.className)}${k.section ? ` – ${k.section}` : ""} · ${k.school?.name}`} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <div className="flex items-center gap-3">
            <Avatar student={k} size="w-14 h-14" text="text-lg" />
            <div className="min-w-0"><p className="font-semibold truncate">{fullName(k)}</p><p className="text-xs text-slate-500">{k.admissionNumber}</p></div>
          </div>
          <dl className="grid grid-cols-2 gap-2 mt-4 text-center">
            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Attendance</dt><dd className={`font-semibold ${k.attendance.percentage < 75 ? "text-error" : ""}`}>{k.attendance.percentage != null ? `${k.attendance.percentage}%` : "—"}</dd></div>
            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">{k.latestResult?.exam || "Results"}</dt><dd className="font-semibold">{k.latestResult ? `${k.latestResult.percentage}% ${k.latestResult.grade}` : "—"}</dd></div>
          </dl>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Link href={`/students/${k.id}?tab=academics`}><a className="btn btn-sm">My results</a></Link>
            <Link href={`/students/${k.id}/report-card`}><a className="btn btn-sm">Report card</a></Link>
            <Link href="/timetable"><a className="btn btn-sm">Timetable</a></Link>
            <Link href="/library"><a className="btn btn-sm">Library</a></Link>
          </div>
        </Card>
        <Card title={`Homework due (${data.homework.length})`} className="md:col-span-2">
          {todo.length > 0 && <p className="text-sm text-warning-content bg-warning/20 rounded px-3 py-2 mb-3">{todo.length} to hand in online.</p>}
          {data.homework.length === 0 ? <EmptyState title="Nothing due" message="Enjoy your day." /> : (
            <ul className="divide-y divide-slate-100">
              {data.homework.slice(0, 8).map((h) => {
                const sub = h.submissions?.[0];
                const due = h.dueDate.slice(0, 10);
                return (
                  <li key={h.id} className="py-2 flex justify-between gap-3 items-center">
                    <div className="min-w-0"><p className="font-medium text-sm truncate">{h.subject}: {h.title}</p><p className={`text-xs ${due <= today ? "text-error" : "text-slate-500"}`}>Due {formatDate(h.dueDate)}</p></div>
                    {h.onlineSubmission ? <span className={`badge badge-sm whitespace-nowrap ${sub ? (sub.status === "graded" ? "badge-success" : sub.status === "returned" ? "badge-warning" : "badge-info") : "badge-ghost"}`}>{sub ? (sub.status === "graded" ? `Marked${sub.marks != null ? ` ${sub.marks}` : ""}` : sub.status === "returned" ? "Redo" : "Handed in") : "To do"}</span> : <span className="text-xs text-slate-400">On paper</span>}
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/homework"><a className="btn btn-primary btn-sm mt-3">Open homework</a></Link>
        </Card>
      </div>
    </>
  );
}
