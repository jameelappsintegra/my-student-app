import { useState } from "react";
import { api } from "../../services/api";
import { classLabel } from "../../constants";

// Find one student by name or admission number (uses the search API, so
// it only finds students the signed-in person may see).
export default function StudentPicker({ value, onChange, label = "Student", school }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const search = async (text) => {
    setQ(text);
    if (text.trim().length < 2) return setResults([]);
    try {
      const rows = (await api.search(text.trim())).data;
      setResults(school ? rows.filter((r) => r.school?.id === school) : rows);
    } catch {
      setResults([]);
    }
    return undefined;
  };
  if (value) {
    return (
      <div className="form-control">
        <span className="label-text mb-1">{label}</span>
        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50">
          <span className="text-sm font-medium flex-1 truncate">{value.name} <span className="text-xs text-slate-500">{value.admissionNumber}</span></span>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => onChange(null)} aria-label="Change student">Change</button>
        </div>
      </div>
    );
  }
  return (
    <label className="form-control relative">
      <span className="label-text mb-1">{label}</span>
      <input className="input input-bordered input-sm" placeholder="Name or admission number" value={q} onChange={(e) => search(e.target.value)} aria-label={`Find ${label.toLowerCase()}`} />
      {results.length > 0 && (
        <ul className="absolute top-full z-20 left-0 right-0 bg-white border border-slate-200 rounded-lg mt-1 max-h-48 overflow-auto shadow">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50" onClick={() => { onChange({ id: r.id, name: `${r.firstName} ${r.lastName}`, admissionNumber: r.admissionNumber, school: r.school?.id }); setQ(""); setResults([]); }}>
                {r.firstName} {r.lastName} <span className="text-xs text-slate-500">{r.admissionNumber} · {classLabel(r.className)} {r.section || ""} · {r.school?.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
