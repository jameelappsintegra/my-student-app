import Link from "next/link";
import { Avatar, Card, EmptyState, ErrorState, Loading, PageHeader } from "../common";
import useApi from "../../hooks/useApi";
import { api } from "../../services/api";
import { classLabel, fullName, money } from "../../constants";

// A parent's summary of each child: attendance, latest marks, fees.
export default function ParentHome() {
  const { data, loading, error, reload } = useApi(() => api.me.children(), []);
  return (
    <>
      <PageHeader title="My children" subtitle="Attendance, results and fees at a glance." />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <Card><EmptyState title="No children linked to your account" message="Contact the school office to link your children." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((k) => (
            <Card key={k.id}>
              <div className="flex items-center gap-4">
                <Avatar student={k} size="w-16 h-16" text="text-xl" />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-900 truncate">{fullName(k)}</h2>
                  <p className="text-sm text-slate-500">{classLabel(k.className)}{k.section ? ` – ${k.section}` : ""} · {k.school?.name}</p>
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">Attendance</dt>
                  <dd className={`font-semibold ${k.attendance.percentage < 75 ? "text-error" : ""}`}>{k.attendance.percentage != null ? `${k.attendance.percentage}%` : "—"}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">{k.latestResult?.exam || "Results"}</dt>
                  <dd className="font-semibold">{k.latestResult ? `${k.latestResult.percentage}% ${k.latestResult.grade}` : "—"}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">Fees due</dt>
                  <dd className={`font-semibold ${k.fees.overdue ? "text-error" : ""}`}>{k.fees.balance ? money(k.fees.balance) : "Paid"}</dd>
                </div>
              </dl>
              {k.fees.overdue > 0 && <p className="text-sm text-error mt-3">{money(k.fees.overdue)} is overdue. Please contact the school office.</p>}
              <div className="flex flex-wrap gap-2 mt-4">
                <Link href={`/students/${k.id}`}><a className="btn btn-primary btn-sm">View profile</a></Link>
                <Link href={`/students/${k.id}?tab=attendance`}><a className="btn btn-sm">Attendance</a></Link>
                <Link href={`/students/${k.id}?tab=fees`}><a className="btn btn-sm">Fees</a></Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
