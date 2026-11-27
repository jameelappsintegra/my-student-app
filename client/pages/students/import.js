import { useState } from "react";
import Link from "next/link";
import Layout from "../../components/layout/layout";
import { Card, NoAccess, Notice, PageHeader } from "../../components/common";
import Icon from "../../components/common/Icon";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { classLabel } from "../../constants";

export default function ImportStudents() {
  const { can, user } = useAuth();
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [state, setState] = useState("idle"); // idle | checking | checked | importing | done
  const [error, setError] = useState(null);

  if (!can("students.import")) return <Layout title="Import students" back><NoAccess /></Layout>;

  const run = async (dryRun) => {
    setError(null);
    setState(dryRun ? "checking" : "importing");
    try {
      const res = await api.students.importCsv(file, dryRun);
      setResult({ ...res.data, message: res.message });
      setState(dryRun ? "checked" : "done");
    } catch (err) {
      if (err.data) setResult({ ...err.data, message: err.message });
      else setError(err);
      setState(err.data ? "checked" : "idle");
    }
  };
  const ok = result && result.errors.length === 0;

  return (
    <Layout title="Import students" back>
      <PageHeader title="Import students from a spreadsheet" subtitle="Add a whole class or school at once instead of one by one." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="1. Get the template" className="lg:col-span-1">
          <p className="text-sm text-slate-600">Fill one row per student in Excel or Google Sheets, then save as CSV.</p>
          <ul className="text-sm text-slate-600 list-disc pl-5 my-3 space-y-1">
            <li>Required: school code, first and last name, date of birth (DD/MM/YYYY), gender, class, address.</li>
            <li>Class can be 5, V, Class 5, LKG or UKG. Gender can be M/F.</li>
            <li>Admission numbers are created automatically.</li>
            {user.role === "teacher" && <li>You can import only into your own classes.</li>}
          </ul>
          <a className="btn btn-sm gap-2" href={api.students.importTemplateUrl()} download><Icon name="download" />Download template</a>
        </Card>
        <Card title="2. Check the file" className="lg:col-span-2">
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
            className="file-input file-input-bordered w-full max-w-md"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); setState("idle"); }}
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <button className={`btn btn-primary ${state === "checking" ? "loading" : ""}`} disabled={!file || state === "checking" || state === "importing"} onClick={() => run(true)}>Check file</button>
            {ok && state === "checked" && (
              <button className={`btn btn-success ${state === "importing" ? "loading" : ""}`} onClick={() => run(false)}>Import {result.totalRows} students</button>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-2">Nothing is saved until every row is valid. Then all rows are added together.</p>
          {error && <div className="alert alert-error mt-3" role="alert"><span>{error.message}</span></div>}
        </Card>
      </div>

      {result && (
        <Card className="mt-4">
          <Notice message={result.message} tone={state === "done" ? "success" : ok ? "info" : "error"} />
          {state === "done" ? (
            <Link href="/students"><a className="btn btn-primary btn-sm">View students</a></Link>
          ) : (
            <>
              <p className="text-sm text-slate-600 mb-3">{result.totalRows} rows · {result.validRows} ready · {result.errors.length} problems</p>
              {result.errors.length > 0 && (
                <div className="overflow-x-auto mb-4">
                  <table className="table table-compact w-full">
                    <thead><tr><th>Row</th><th>Column</th><th>Problem</th></tr></thead>
                    <tbody>
                      {result.errors.map((e, i) => (
                        <tr key={i}><td className="tabular-nums">{e.row}</td><td className="font-mono text-xs">{e.field}</td><td className="text-error">{e.message}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.preview?.length > 0 && (
                <>
                  <p className="font-medium text-sm mb-2">Preview of valid rows</p>
                  <div className="xl:overflow-x-auto">
                    <table className="table table-compact w-full table-stack">
                      <thead><tr><th>Row</th><th>Name</th><th>School</th><th>Class</th><th>Date of birth</th></tr></thead>
                      <tbody>
                        {result.preview.map((p) => (
                          <tr key={p.row}><td data-label="Row">{p.row}</td><td data-primary>{p.name}</td><td data-label="School">{p.school}</td><td data-label="Class">{classLabel(p.className)} {p.section}</td><td data-label="Date of birth">{p.dateOfBirth}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </Card>
      )}
    </Layout>
  );
}
