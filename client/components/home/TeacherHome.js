import Link from "next/link";
import { Card, EmptyState, ErrorState, Loading, PageHeader } from "../common";
import useApi from "../../hooks/useApi";
import { api } from "../../services/api";
import { useAuth } from "../../context/auth";
import { classLabel, todayIso } from "../../constants";

// A teacher's day: their classes and whether today's register is done.
export default function TeacherHome() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(() => api.me.classes(), []);
  const first = (user?.name || "").split(" ")[0];

  return (
    <>
      <PageHeader title={`Good day${first ? `, ${first}` : ""}`} subtitle="Your classes today" />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <Card><EmptyState title="No classes assigned yet" message="Ask the school administrator to assign your classes." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => {
            const done = c.students > 0 && c.markedToday >= c.students;
            const q = new URLSearchParams({ school: c.school.id, className: c.className, ...(c.section ? { section: c.section } : {}) });
            return (
              <Card key={`${c.school.id}-${c.className}-${c.section}`}>
                <p className="text-xs text-slate-500">{c.school.name}</p>
                <h2 className="text-lg font-semibold text-slate-900">
                  {classLabel(c.className)}
                  {c.section ? ` – ${c.section}` : " (all sections)"}
                </h2>
                <p className="text-sm text-slate-600 mt-1">{c.students} students</p>
                <p className={`text-sm mt-2 font-medium ${done ? "text-success" : "text-warning"}`}>
                  {done ? "Today's attendance is done" : `Attendance: ${c.markedToday} of ${c.students} marked today`}
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Link href={`/attendance?${q}&date=${todayIso()}`}><a className="btn btn-primary btn-sm">{done ? "Review register" : "Take attendance"}</a></Link>
                  <Link href={`/students?${q}`}><a className="btn btn-sm">Students</a></Link>
                  <Link href={`/insights?${q}`}><a className="btn btn-sm">Insights</a></Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
