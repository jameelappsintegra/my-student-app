import { useState } from "react";
import Link from "next/link";
import Layout from "../../components/layout/layout";
import { Card, EmptyState, ErrorState, Loading, PageHeader } from "../../components/common";
import Icon from "../../components/common/Icon";
import useApi from "../../hooks/useApi";
import useSchools from "../../hooks/useSchools";
import { api } from "../../services/api";
import { CLASSES, classLabel, formatDate, money } from "../../constants";

const REPORTS = {
  "fee-defaulters": { label: "Fee defaulters", hint: "Students with money owed on bills past their due date, largest first." },
  "low-attendance": { label: "Low attendance", hint: "Students below the threshold this academic year, lowest first." },
  students: { label: "Student list", hint: "Class lists with parent contacts, for printing or Excel." },
};

const cls = (r) => `${classLabel(r.className)}${r.section ? ` ${r.section}` : ""}`;

export default function Reports() {
  const { schools } = useSchools();
  const [report, setReport] = useState("fee-defaulters");
  const [school, setSchool] = useState("");
  const [className, setClassName] = useState("");
  const [threshold, setThreshold] = useState(75);
  const params = { school, className, ...(report === "low-attendance" ? { threshold } : {}) };
  const { data, loading, error, reload } = useApi(() => api.reports.get(report, params), [report, school, className, threshold]);
  const rows = data?.rows || [];

  const extra = {
    "fee-defaulters": [["Overdue", (r) => <span className="text-error font-medium">{money(r.overdue)}</span>], ["Since", (r) => formatDate(r.oldestDue)]],
    "low-attendance": [["Attendance", (r) => <span className="text-error font-medium">{r.percentage}%</span>], ["Absent", (r) => `${r.absent} of ${r.days} days`]],
    students: [["Roll", (r) => r.rollNumber || "—"]],
  }[report];

  return (
    <Layout title="Reports">
      <PageHeader
        title="Reports"
        subtitle={REPORTS[report].hint}
        actions={
          <a className="btn btn-primary gap-2" href={api.reports.csvUrl(report, params)} download>
            <Icon name="download" />Download CSV
          </a>
        }
      />
      <div className="overflow-x-auto mb-4">
        <div className="tabs tabs-boxed bg-white border border-slate-200 inline-flex flex-nowrap" role="tablist">
          {Object.entries(REPORTS).map(([k, r]) => (
            <button key={k} role="tab" aria-selected={report === k} className={`tab whitespace-nowrap ${report === k ? "tab-active" : ""}`} onClick={() => setReport(k)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <Card>
        <div className="grid gap-2 grid-cols-2 sm:flex sm:flex-wrap mb-4">
          <select className="select select-bordered select-sm col-span-2 sm:col-span-1" value={school} onChange={(e) => setSchool(e.target.value)} aria-label="School">
            <option value="">All schools</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="select select-bordered select-sm" value={className} onChange={(e) => setClassName(e.target.value)} aria-label="Class">
            <option value="">All classes</option>
            {CLASSES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
          {report === "low-attendance" && (
            <select className="select select-bordered select-sm" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} aria-label="Below">
              {[60, 75, 85, 90].map((t) => <option key={t} value={t}>Below {t}%</option>)}
            </select>
          )}
        </div>

        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="Nothing to report" message={report === "students" ? "No active students match these filters." : "No students match. That's good news."} />
        ) : (
          <>
            <p className="text-sm text-slate-600 mb-3">
              {rows.length} students
              {report === "fee-defaulters" ? ` · ${money(data.overdue)} overdue in total` : ""}
            </p>
            <ul className="sm:hidden divide-y divide-slate-100 -mx-2">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/students/${r.id}${report === "fee-defaulters" ? "?tab=fees" : report === "low-attendance" ? "?tab=attendance" : ""}`}>
                    <a className="flex justify-between gap-3 px-2 py-3">
                      <span className="min-w-0">
                        <span className="block font-medium truncate">{r.name}</span>
                        <span className="block text-xs text-slate-500">{cls(r)} · {r.schoolCode} · {r.parentPhone}</span>
                      </span>
                      <span className="text-right text-sm shrink-0">{extra[0][1](r)}</span>
                    </a>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block overflow-x-auto">
              <table className="table table-compact w-full">
                <thead>
                  <tr>
                    <th>Student</th><th>Class</th><th>School</th><th>Parent</th>
                    {extra.map(([h]) => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="hover">
                      <td>
                        <Link href={`/students/${r.id}`}><a className="font-medium hover:text-primary">{r.name}</a></Link>
                        <div className="text-xs text-slate-500 font-mono">{r.admissionNumber}</div>
                      </td>
                      <td>{cls(r)}</td>
                      <td>{r.school}</td>
                      <td>{r.parent}<div className="text-xs text-slate-500">{r.parentPhone}</div></td>
                      {extra.map(([h, f]) => <td key={h}>{f(r)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </Layout>
  );
}
