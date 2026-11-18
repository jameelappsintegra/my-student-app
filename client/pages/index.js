import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import Layout from "../components/layout/layout";
import {
  Card,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
} from "../components/common";
import useApi from "../hooks/useApi";
import { api } from "../services/api";
import { ADMISSION_STATUS, CLASSES, classLabel, formatDate, money } from "../constants";
import useSchools from "../hooks/useSchools";

// ECharts touches `window`, so render it on the client only.
const ReactEcharts = dynamic(() => import("echarts-for-react"), { ssr: false });

function Stat({ label, value, href, hint, tone = "text-slate-900" }) {
  const body = (
    <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 h-full hover:border-primary/40">
      <p className="text-xs sm:text-sm text-slate-500">{label}</p>
      <p className={`text-2xl sm:text-3xl font-semibold mt-1 tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href}>
      <a>{body}</a>
    </Link>
  ) : (
    body
  );
}

export default function Dashboard() {
  const { schools } = useSchools();
  const [school, setSchool] = useState("");
  const { data, loading, error, reload } = useApi(() => api.dashboard(school || undefined), [school]);

  const chartOption = data && {
    grid: { left: 40, right: 16, top: 16, bottom: 40 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: CLASSES.map((c) => c.code),
      axisLabel: { interval: 0 },
    },
    yAxis: { type: "value", minInterval: 1 },
    series: [
      {
        type: "bar",
        name: "Students",
        itemStyle: { color: "#4f46e5", borderRadius: [4, 4, 0, 0] },
        data: CLASSES.map(
          (c) =>
            data.studentsByClass.find((r) => r.className === c.code)?.count || 0
        ),
      },
    ],
  };

  return (
    <Layout title="Dashboard">
      <PageHeader
        title="Dashboard"
        subtitle={school ? schools.find((s) => s.id === school)?.name : "All schools"}
        actions={
          <select className="select select-bordered select-sm" value={school} onChange={(e) => setSchool(e.target.value)} aria-label="Show school">
            <option value="">All schools</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        }
      />

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Stat label="Active students" value={data.totalStudents} href={school ? `/students?school=${school}` : "/students"} />
            <Stat
              label="Admissions to review"
              value={data.pendingAdmissions}
              hint={data.approvedAwaitingEnrolment ? `${data.approvedAwaitingEnrolment} approved, not enrolled` : undefined}
              href="/admissions"
            />
            <Stat
              label="Attendance"
              value={data.attendance?.percentage != null ? `${data.attendance.percentage}%` : "—"}
              hint={data.attendance ? `${formatDate(data.attendance.date)} · ${data.attendance.absent} absent` : "Not marked yet"}
              tone={data.attendance?.percentage < 85 ? "text-warning" : "text-slate-900"}
              href="/attendance"
            />
            <Stat
              label="Fees outstanding"
              value={money(data.fees.outstanding)}
              hint={data.fees.overdueInvoices ? `${money(data.fees.overdue)} overdue on ${data.fees.overdueInvoices} bills` : `${money(data.fees.collected)} collected`}
              tone={data.fees.overdue ? "text-error" : "text-slate-900"}
              href="/reports"
            />
          </div>

          {!school && data.studentsBySchool.length > 0 && (
            <Card title="Schools">
              <ul className="divide-y divide-slate-100">
                {data.studentsBySchool.map((s) => (
                  <li key={s.id}>
                    <button className="w-full flex items-center justify-between py-2 text-left hover:text-primary" onClick={() => setSchool(s.id)}>
                      <span className="text-sm font-medium">{s.name} <span className="text-xs text-slate-500">({s.code})</span></span>
                      <span className="text-sm tabular-nums text-slate-600">{s.count} students</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-5">
            <Card title="Students by class" className="lg:col-span-3">
              {data.totalStudents === 0 ? (
                <EmptyState
                  title="No students enrolled yet"
                  message="Enrol approved admissions to see the class breakdown."
                />
              ) : (
                <ReactEcharts option={chartOption} style={{ height: 280 }} />
              )}
            </Card>

            <Card title="Recent applications" className="lg:col-span-2">
              {data.recentAdmissions.length === 0 ? (
                <EmptyState
                  title="No applications yet"
                  action={
                    <Link href="/newadmission">
                      <a className="btn btn-primary btn-sm">New admission</a>
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.recentAdmissions.map((a) => (
                    <li key={a.id} className="py-2 flex justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {a.firstName} {a.lastName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {classLabel(a.classApplied)} · {formatDate(a.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`badge badge-sm ${
                          ADMISSION_STATUS[a.status]?.badge || ""
                        } self-center whitespace-nowrap`}
                      >
                        {ADMISSION_STATUS[a.status]?.label || a.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </Layout>
  );
}
