import { useEffect, useState } from "react";
import Layout from "../../components/layout/layout";
import { Card, EmptyState, ErrorState, Loading, NoAccess, Notice, PageHeader } from "../../components/common";
import ClassPicker from "../../components/forms/ClassPicker";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { academicYearOptions } from "../../constants";

export default function PublishResults() {
  const { can } = useAuth();
  const [cls, setCls] = useState({ school: "", className: "", section: "" });
  const [year, setYear] = useState(academicYearOptions()[0]);
  const [state, setState] = useState({ loading: false, error: null, data: null });
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = () => {
    if (!cls.school || !cls.className) return;
    setState({ loading: true, error: null, data: null });
    api.results.status({ ...cls, section: cls.section || undefined, academicYear: year })
      .then((r) => setState({ loading: false, error: null, data: r.data })).catch((error) => setState({ loading: false, error, data: null }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [cls.school, cls.className, cls.section, year]);
  if (!can("results.publish")) return <Layout title="Publish results"><NoAccess /></Layout>;
  const act = async (exam, publish) => {
    setBusy(exam);
    try { const r = await api.results.publish({ ...cls, section: cls.section || undefined, academicYear: year, exam, publish }); setNotice(r.message); load(); }
    catch (err) { setNotice(err.message); } finally { setBusy(null); }
  };
  return (
    <Layout title="Publish results">
      <PageHeader title="Publish results" subtitle="Teachers enter marks as drafts. Parents see them only after you publish." />
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      <Card className="mb-4">
        <ClassPicker value={cls} onChange={setCls} />
        <label className="form-control w-40 mt-2"><span className="label-text mb-1">Year</span>
          <select className="select select-bordered select-sm" value={year} onChange={(e) => setYear(e.target.value)}>{academicYearOptions().map((y) => <option key={y}>{y}</option>)}</select>
        </label>
      </Card>
      <Card>
        {!cls.school || !cls.className ? <EmptyState title="Choose a class" message="Pick a school and class to see its exams." /> :
          state.loading ? <Loading /> : state.error ? <ErrorState error={state.error} onRetry={load} /> : state.data?.exams.length === 0 ? <EmptyState title="No marks entered yet" message="Exams appear here once teachers enter marks." /> : state.data && (
            <table className="table w-full">
              <thead><tr><th>Exam</th><th>Marks entered</th><th>Status</th><th className="text-right">Action</th></tr></thead>
              <tbody>
                {state.data.exams.map((e) => {
                  const all = e.published === e.results;
                  return (
                    <tr key={e.exam}>
                      <td className="font-medium">{e.exam}</td>
                      <td>{e.results} of {state.data.students} students</td>
                      <td><span className={`badge ${all ? "badge-success" : e.published ? "badge-warning" : "badge-ghost"}`}>{all ? "Published" : e.published ? `${e.published} published` : "Draft"}</span></td>
                      <td className="text-right space-x-2">
                        {!all && <button className={`btn btn-primary btn-sm ${busy === e.exam ? "loading" : ""}`} onClick={() => act(e.exam, true)}>Publish</button>}
                        {e.published > 0 && <button className="btn btn-ghost btn-sm" onClick={() => act(e.exam, false)}>Unpublish</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </Card>
    </Layout>
  );
}
