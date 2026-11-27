import { useEffect, useState } from "react";
import Layout from "../../components/layout/layout";
import { Card, ErrorState, Loading, NoAccess, Notice, PageHeader } from "../../components/common";
import SchoolSelect from "../../components/forms/SchoolSelect";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { WEEKDAYS, money } from "../../constants";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SAR", "QAR", "KWD", "OMR", "SGD", "MYR", "LKR", "NPR", "BDT", "PKR", "KES", "NGN", "ZAR", "AUD", "CAD"];
const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Riyadh", "Asia/Qatar", "Asia/Singapore", "Asia/Kuala_Lumpur", "Asia/Colombo", "Asia/Kathmandu", "Asia/Dhaka", "Asia/Karachi", "Africa/Nairobi", "Africa/Lagos", "Africa/Johannesburg", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Toronto", "Australia/Sydney"];

function Rows({ rows, onChange, blank, render, addLabel }) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap gap-2 items-center">
          {render(r, (patch) => onChange(rows.map((x, j) => (j === i ? { ...x, ...patch } : x))))}
          <button type="button" className="btn btn-ghost btn-xs text-error" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button type="button" className="btn btn-sm btn-outline" onClick={() => onChange([...rows, { ...blank }])}>{addLabel}</button>
    </div>
  );
}

export default function Settings() {
  const { can } = useAuth();
  const [school, setSchool] = useState("");
  const [f, setF] = useState(null);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!school) return;
    setF(null); setError(null);
    api.settings.get(school).then((r) => setF(r.data.settings)).catch(setError);
  }, [school]);

  if (!can("settings.manage")) return <Layout title="School settings"><NoAccess /></Layout>;
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    setBusy(true); setSaveError(null);
    try {
      const body = {
        currency: f.currency, locale: f.locale, timezone: f.timezone,
        academicYearStartMonth: Number(f.academicYearStartMonth), weeklyOffs: f.weeklyOffs,
        passPercentage: Number(f.passPercentage),
        gradingScale: f.gradingScale.map((g) => ({ min: Number(g.min), grade: g.grade.trim(), remark: g.remark?.trim() || undefined })),
        terms: f.terms.filter((t) => t.name && t.start && t.end),
        holidays: f.holidays.filter((h) => h.date && h.name),
        library: { finePerDay: Number(f.library.finePerDay), loanDays: Number(f.library.loanDays), maxBooks: Number(f.library.maxBooks) },
        homework: { allowLate: f.homework.allowLate },
      };
      const r = await api.settings.save(school, body);
      setF(r.data.settings);
      setNotice(r.message);
    } catch (err) {
      setSaveError(err.errors?.length ? { message: err.errors.map((e) => `${e.field ? `${e.field}: ` : ""}${e.message}`).join(". ") } : err);
    } finally { setBusy(false); }
  };

  return (
    <Layout title="School settings">
      <PageHeader title="School settings" subtitle="Currency, time zone, grading and the academic calendar for one school." />
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      <div className="max-w-xs mb-4"><SchoolSelect value={school} onChange={setSchool} /></div>
      {error ? <ErrorState error={error} /> : !f ? (school ? <Loading /> : null) : (
        <div className="space-y-4">
          <Card title="Region and money">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="form-control"><span className="label-text mb-1">Currency</span>
                <select className="select select-bordered select-sm" value={f.currency} onChange={(e) => set("currency", e.target.value)}>
                  {[...new Set([f.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="form-control"><span className="label-text mb-1">Number format (locale)</span>
                <input className="input input-bordered input-sm" value={f.locale} onChange={(e) => set("locale", e.target.value)} placeholder="en-IN" />
              </label>
              <label className="form-control"><span className="label-text mb-1">Time zone</span>
                <select className="select select-bordered select-sm" value={f.timezone} onChange={(e) => set("timezone", e.target.value)}>
                  {[...new Set([f.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}
                </select>
              </label>
            </div>
            <p className="text-sm text-slate-500 mt-2">Fees will show like <strong>{money(125000, f.currency, f.locale)}</strong>. &quot;Today&quot; for attendance and late homework follows the school&apos;s time zone.</p>
          </Card>

          <Card title="Academic year and school days">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="form-control"><span className="label-text mb-1">Academic year starts in</span>
                <select className="select select-bordered select-sm" value={f.academicYearStartMonth} onChange={(e) => set("academicYearStartMonth", Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
              <fieldset><legend className="label-text mb-1">Weekly off days</legend>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d, i) => (
                    <label key={d} className="label cursor-pointer gap-1 p-0">
                      <input type="checkbox" className="checkbox checkbox-xs checkbox-primary" checked={f.weeklyOffs.includes(i)} onChange={(e) => set("weeklyOffs", e.target.checked ? [...f.weeklyOffs, i].sort() : f.weeklyOffs.filter((x) => x !== i))} />
                      <span className="label-text text-sm">{d.slice(0, 3)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <h3 className="font-medium text-sm mt-4 mb-2">Terms</h3>
            <Rows rows={f.terms} onChange={(v) => set("terms", v)} blank={{ name: "", start: "", end: "" }} addLabel="Add term" render={(t, patch) => (
              <>
                <input className="input input-bordered input-sm w-32" aria-label="Term name" placeholder="Term 1" value={t.name} onChange={(e) => patch({ name: e.target.value })} />
                <input type="date" className="input input-bordered input-sm" aria-label="Term starts" value={t.start} onChange={(e) => patch({ start: e.target.value })} />
                <span className="text-slate-400">to</span>
                <input type="date" className="input input-bordered input-sm" aria-label="Term ends" value={t.end} onChange={(e) => patch({ end: e.target.value })} />
              </>
            )} />
            <h3 className="font-medium text-sm mt-4 mb-2">Holidays</h3>
            <Rows rows={f.holidays} onChange={(v) => set("holidays", v)} blank={{ date: "", name: "" }} addLabel="Add holiday" render={(h, patch) => (
              <>
                <input type="date" className="input input-bordered input-sm" aria-label="Holiday date" value={h.date} onChange={(e) => patch({ date: e.target.value })} />
                <input className="input input-bordered input-sm flex-1 min-w-[10rem]" aria-label="Holiday name" placeholder="e.g. Diwali" value={h.name} onChange={(e) => patch({ name: e.target.value })} />
              </>
            )} />
            <p className="text-xs text-slate-500 mt-2">Holidays and weekly offs are skipped when leave is approved, and the attendance register warns if you open one.</p>
          </Card>

          <Card title="Grading">
            <label className="form-control w-40 mb-3"><span className="label-text mb-1">Pass mark (%)</span>
              <input type="number" min="0" max="100" className="input input-bordered input-sm" value={f.passPercentage} onChange={(e) => set("passPercentage", e.target.value)} />
            </label>
            <Rows rows={f.gradingScale} onChange={(v) => set("gradingScale", v)} blank={{ min: "", grade: "", remark: "" }} addLabel="Add grade" render={(g, patch) => (
              <>
                <span className="text-sm text-slate-500">From</span>
                <input type="number" min="0" max="100" className="input input-bordered input-sm w-20" aria-label="Minimum percentage" value={g.min} onChange={(e) => patch({ min: e.target.value })} />
                <span className="text-sm text-slate-500">% →</span>
                <input className="input input-bordered input-sm w-28" aria-label="Grade" placeholder="A1" value={g.grade} onChange={(e) => patch({ grade: e.target.value })} />
                <input className="input input-bordered input-sm flex-1 min-w-[8rem]" aria-label="Remark" placeholder="Remark (optional)" value={g.remark || ""} onChange={(e) => patch({ remark: e.target.value })} />
              </>
            )} />
            <p className="text-xs text-slate-500 mt-2">Results, report cards and reports use this scale. One grade must start at 0%.</p>
          </Card>

          <Card title="Library and homework">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="form-control"><span className="label-text mb-1">Late fine per day</span>
                <input type="number" min="0" className="input input-bordered input-sm" value={f.library.finePerDay} onChange={(e) => set("library", { ...f.library, finePerDay: e.target.value })} />
              </label>
              <label className="form-control"><span className="label-text mb-1">Loan period (days)</span>
                <input type="number" min="1" max="90" className="input input-bordered input-sm" value={f.library.loanDays} onChange={(e) => set("library", { ...f.library, loanDays: e.target.value })} />
              </label>
              <label className="form-control"><span className="label-text mb-1">Books per student</span>
                <input type="number" min="1" max="20" className="input input-bordered input-sm" value={f.library.maxBooks} onChange={(e) => set("library", { ...f.library, maxBooks: e.target.value })} />
              </label>
            </div>
            <label className="label cursor-pointer justify-start gap-3 mt-3">
              <input type="checkbox" className="toggle toggle-primary" checked={f.homework.allowLate} onChange={(e) => set("homework", { allowLate: e.target.checked })} />
              <span className="label-text">Accept homework handed in after the due date (marked late)</span>
            </label>
          </Card>

          {saveError && <div className="alert alert-error py-2" role="alert"><span>{saveError.message}</span></div>}
          <div className="flex justify-end"><button className={`btn btn-primary ${busy ? "loading" : ""}`} disabled={busy} onClick={save}>Save settings</button></div>
        </div>
      )}
    </Layout>
  );
}
