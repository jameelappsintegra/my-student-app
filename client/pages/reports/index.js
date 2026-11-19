import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../../components/layout/layout";
import { Card, EmptyState, ErrorState, Loading, NoAccess, PageHeader } from "../../components/common";
import Icon from "../../components/common/Icon";
import useApi from "../../hooks/useApi";
import useSchools from "../../hooks/useSchools";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { CLASSES, classLabel, formatDate, money, todayIso } from "../../constants";

const MONEY = new Set(["overdue", "balance", "amount"]);
const PCT = new Set(["percentage", "averagePercentage", "passRate", "highest", "lowest"]);
const show = (key, v) => {
  if (v === null || v === undefined || v === "") return "—";
  if (MONEY.has(key)) return money(v);
  if (PCT.has(key)) return `${v}%`;
  if (key === "className") return classLabel(v);
  if (key === "oldestDue" || key === "dateOfBirth") return formatDate(String(v));
  return String(v);
};

export default function Reports() {
  const { can } = useAuth();
  const { schools } = useSchools();
  const { data: catalogue } = useApi(() => (can("reports.view") ? api.reports.list() : Promise.resolve({ data: [] })), []);
  const [report, setReport] = useState(null);
  const [f, setF] = useState({ school: "", className: "", threshold: 75, date: todayIso(), from: "", to: "", exam: "", top: 3 });
  useEffect(() => {
    if (catalogue?.length && !report) setReport(catalogue[0].id);
  }, [catalogue, report]);
  const meta = catalogue?.find((r) => r.id === report);
  const params = meta
    ? { school: f.school, className: f.className, ...Object.fromEntries(meta.params.map((p) => [p, f[p]]).filter(([, v]) => v !== "")) }
    : {};
  const key = JSON.stringify([report, params]);
  const { data, loading, error, reload } = useApi(() => (report ? api.reports.get(report, params) : new Promise(() => {})), [key]);

  if (!can("reports.view")) return <Layout title="Reports"><NoAccess /></Layout>;
  const groups = [...new Set((catalogue || []).map((r) => r.group))];
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <Layout title="Reports">
      <PageHeader
        title="Reports"
        subtitle={meta ? `${meta.title} · limited to the students you can see` : "Choose a report"}
        actions={report && <a className="btn btn-primary gap-2" href={api.reports.csvUrl(report, params)} download><Icon name="download" />Download CSV</a>}
      />
      <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
        <Card className="!p-3 h-fit">
          <label className="lg:hidden form-control">
            <span className="label-text mb-1">Report</span>
            <select className="select select-bordered" value={report || ""} onChange={(e) => setReport(e.target.value)}>
              {(catalogue || []).map((r) => <option key={r.id} value={r.id}>{r.group}: {r.title}</option>)}
            </select>
          </label>
          <nav className="hidden lg:block" aria-label="Reports">
            {groups.map((g) => (
              <div key={g} className="mb-3">
                <p className="text-xs uppercase tracking-wide text-slate-400 px-2 mb-1">{g}</p>
                {catalogue.filter((r) => r.group === g).map((r) => (
                  <button key={r.id} onClick={() => setReport(r.id)} aria-current={report === r.id ? "page" : undefined} className={`block w-full text-left text-sm rounded-md px-2 py-1.5 ${report === r.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-slate-100"}`}>
                    {r.title}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </Card>
        <Card className="min-w-0">
          <div className="grid gap-2 grid-cols-2 sm:flex sm:flex-wrap mb-4">
            {schools.length > 1 && (
              <select className="select select-bordered select-sm col-span-2 sm:col-span-1" value={f.school} onChange={set("school")} aria-label="School">
                <option value="">All schools</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <select className="select select-bordered select-sm" value={f.className} onChange={set("className")} aria-label="Class">
              <option value="">All classes</option>
              {CLASSES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
            {meta?.params.includes("threshold") && (
              <select className="select select-bordered select-sm" value={f.threshold} onChange={set("threshold")} aria-label="Below">
                {[60, 75, 85, 90].map((t) => <option key={t} value={t}>Below {t}%</option>)}
              </select>
            )}
            {meta?.params.includes("date") && <input type="date" className="input input-bordered input-sm" max={todayIso()} value={f.date} onChange={set("date")} aria-label="Date" />}
            {meta?.params.includes("from") && <input type="date" className="input input-bordered input-sm" value={f.from} onChange={set("from")} aria-label="From" />}
            {meta?.params.includes("to") && <input type="date" className="input input-bordered input-sm" value={f.to} onChange={set("to")} aria-label="To" />}
            {meta?.params.includes("exam") && <input className="input input-bordered input-sm" placeholder="Exam (all)" value={f.exam} onChange={set("exam")} aria-label="Exam" />}
            {meta?.params.includes("top") && (
              <select className="select select-bordered select-sm" value={f.top} onChange={set("top")} aria-label="Top">
                {[1, 3, 5, 10].map((t) => <option key={t} value={t}>Top {t}</option>)}
              </select>
            )}
          </div>
          {!report || (loading && !data) ? (
            <Loading />
          ) : error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : data.rows.length === 0 ? (
            <EmptyState title="Nothing to report" message="No records match these filters." />
          ) : (
            <>
              <p className="text-sm text-slate-600 mb-3">
                {data.total} rows
                {data.overdue !== undefined ? ` · ${money(data.overdue)} overdue in total` : ""}
                {data.collected !== undefined ? ` · ${money(data.collected)} collected` : ""}
              </p>
              <div className="overflow-x-auto">
                <table className="table table-compact w-full">
                  <thead>
                    <tr>{data.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={r.id || i} className="hover">
                        {data.columns.map((c) => (
                          <td key={c.key} className={MONEY.has(c.key) || PCT.has(c.key) || typeof r[c.key] === "number" ? "tabular-nums" : ""}>
                            {c.key === "name" && r.id ? <Link href={`/students/${r.id}`}><a className="font-medium hover:text-primary">{r.name}</a></Link> : show(c.key, r[c.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>
    </Layout>
  );
}
