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
import { ADMISSION_STATUS, CLASSES, classLabel, formatDate } from "../constants";

// ECharts touches `window`, so render it on the client only.
const ReactEcharts = dynamic(() => import("echarts-for-react"), { ssr: false });

function Stat({ label, value, href }) {
  const body = (
    <div className="bg-white rounded-xl border border-slate-200 p-5 h-full hover:border-primary/40">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-semibold text-slate-900 mt-1">{value}</p>
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
  const { data, loading, error, reload } = useApi(() => api.dashboard(), []);

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
      <PageHeader title="Dashboard" subtitle="School overview" />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Active students" value={data.totalStudents} href="/myclass" />
            <Stat
              label="Applications awaiting review"
              value={data.pendingAdmissions}
              href="/admissions"
            />
            <Stat
              label="Approved, awaiting enrolment"
              value={data.approvedAwaitingEnrolment}
              href="/admissions"
            />
          </div>

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
