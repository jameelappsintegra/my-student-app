import useSchools from "../../hooks/useSchools";
import { CLASSES } from "../../constants";

// School / class / section selects, shared by homework, timetable,
// results and promotion pages.
export default function ClassPicker({ value, onChange, sectionPlaceholder = "All", requireSection = false }) {
  const { schools } = useSchools();
  const set = (k) => (e) => onChange({ ...value, [k]: k === "section" ? e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase() : e.target.value });
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
      <label className="form-control col-span-2 sm:col-span-2">
        <span className="label-text mb-1">School</span>
        <select className="select select-bordered select-sm" value={value.school} onChange={set("school")}>
          <option value="">Select…</option>
          {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="form-control">
        <span className="label-text mb-1">Class</span>
        <select className="select select-bordered select-sm" value={value.className} onChange={set("className")}>
          <option value="">Select…</option>
          {CLASSES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
      </label>
      <label className="form-control">
        <span className="label-text mb-1">Section{requireSection ? "" : " (optional)"}</span>
        <input className="input input-bordered input-sm" maxLength={5} placeholder={sectionPlaceholder} value={value.section} onChange={set("section")} />
      </label>
    </div>
  );
}
