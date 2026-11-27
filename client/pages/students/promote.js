import { useState } from "react";
import Layout from "../../components/layout/layout";
import { Card, EmptyState, NoAccess, Notice, PageHeader } from "../../components/common";
import ClassPicker from "../../components/forms/ClassPicker";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { academicYearOptions, classLabel } from "../../constants";

const nextYear = (y) => { const a = Number(y.slice(0, 4)) + 1; return `${a}-${a + 1}`; };

export default function Promote() {
  const { can } = useAuth();
  const [cls, setCls] = useState({ school: "", className: "", section: "" });
  const [fromYear, setFromYear] = useState(academicYearOptions()[0]);
  const [plan, setPlan] = useState(null);
  const [keep, setKeep] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  if (!can("students.promote")) return <Layout title="Promote students" back><NoAccess /></Layout>;
  const body = (dryRun) => ({ ...cls, section: cls.section || undefined, fromYear, toYear: nextYear(fromYear), keep, dryRun });
  const preview = async () => { setBusy(true); setNotice(null); try { const r = await api.promotion.run(body(true)); setPlan(r.data); if (!r.data.plan.length) setNotice(r.message); } catch (err) { setNotice(err.message); } finally { setBusy(false); } };
  const run = async () => { setBusy(true); try { const r = await api.promotion.run(body(false)); setNotice(r.message); setPlan(null); setKeep([]); } catch (err) { setNotice(err.message); } finally { setBusy(false); } };
  return (
    <Layout title="Promote students" back>
      <PageHeader title="Year-end promotion" subtitle="Move a class up for the new academic year. Class 12 students are marked graduated." />
      <Notice message={notice} tone={notice?.startsWith("Done") ? "success" : "info"} onDismiss={() => setNotice(null)} />
      <Card className="mb-4">
        <ClassPicker value={cls} onChange={(v) => { setCls(v); setPlan(null); }} />
        <div className="flex flex-wrap items-end gap-3 mt-2">
          <label className="form-control w-40"><span className="label-text mb-1">Current year</span>
            <select className="select select-bordered select-sm" value={fromYear} onChange={(e) => { setFromYear(e.target.value); setPlan(null); }}>{academicYearOptions().map((y) => <option key={y}>{y}</option>)}</select>
          </label>
          <span className="text-sm text-slate-500 pb-2">→ {nextYear(fromYear)}</span>
          <button className={`btn btn-primary btn-sm ${busy ? "loading" : ""}`} disabled={!cls.school || !cls.className || busy} onClick={preview}>Preview</button>
        </div>
      </Card>
      {plan && plan.plan.length > 0 && (
        <Card>
          <p className="text-sm mb-3">{plan.toClass ? `Ticked students move to ${classLabel(plan.toClass)} for ${nextYear(fromYear)}.` : "Ticked students are marked graduated."} Untick anyone repeating the year. Roll numbers are cleared so the new class can be re-numbered.</p>
          <ul className="divide-y divide-slate-100 mb-4">
            {plan.plan.map((p) => (
              <li key={p.id} className="py-2">
                <label className="label cursor-pointer justify-start gap-3 py-0">
                  <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={!keep.includes(p.id)} onChange={(e) => setKeep(e.target.checked ? keep.filter((k) => k !== p.id) : [...keep, p.id])} />
                  <span className="label-text">{p.name} <span className="text-xs text-slate-500 font-mono">{p.admissionNumber}</span></span>
                  {keep.includes(p.id) && <span className="badge badge-warning badge-sm">Repeats</span>}
                </label>
              </li>
            ))}
          </ul>
          <button className={`btn btn-success ${busy ? "loading" : ""}`} disabled={busy} onClick={run}>
            {plan.toClass ? `Promote ${plan.plan.length - keep.length} students` : `Graduate ${plan.plan.length - keep.length} students`}
          </button>
        </Card>
      )}
      {plan && plan.plan.length === 0 && <Card><EmptyState title="No active students" message="There are no active students in that class for that year." /></Card>}
    </Layout>
  );
}
