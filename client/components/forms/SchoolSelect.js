import { useEffect } from "react";
import useSchools from "../../hooks/useSchools";

// A school select that picks the first school when there is only one.
export default function SchoolSelect({ value, onChange, label = "School", allowAll = false }) {
  const { schools } = useSchools();
  useEffect(() => {
    if (!value && !allowAll && schools.length) onChange(schools[0].id);
  }, [value, allowAll, schools, onChange]);
  return (
    <label className="form-control">
      <span className="label-text mb-1">{label}</span>
      <select className="select select-bordered select-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {allowAll ? <option value="">All schools</option> : !value && <option value="">Select…</option>}
        {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );
}
