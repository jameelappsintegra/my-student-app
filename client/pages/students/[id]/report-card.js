import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { ErrorState, Loading } from "../../../components/common";
import Icon from "../../../components/common/Icon";
import useApi from "../../../hooks/useApi";
import { api } from "../../../services/api";
import { classLabel, formatDate } from "../../../constants";

// Printable report card. Uses the browser's print dialog (Save as PDF).
export default function ReportCard() {
  const router = useRouter();
  const { id, year } = router.query;
  const { data, loading, error, reload } = useApi(() => (id ? api.results.reportCard(id, year) : new Promise(() => {})), [id, year]);
  if (loading) return <Loading />;
  if (error) return <div className="p-6"><ErrorState error={error} onRetry={reload} /></div>;
  const d = data;
  const att = d.attendance;
  return (
    <>
      <Head><title>{`Report card · ${d.student.name}`}</title></Head>
      <style>{`@media print { .no-print { display: none !important } body { background: white } @page { margin: 14mm } }`}</style>
      <div className="no-print flex gap-2 p-4 max-w-3xl mx-auto">
        <Link href={`/students/${id}?tab=academics`}><a className="btn btn-ghost btn-sm">← Back</a></Link>
        <button className="btn btn-primary btn-sm gap-2 ml-auto" onClick={() => window.print()}><Icon name="print" className="w-4 h-4" />Print or save as PDF</button>
      </div>
      <main className="max-w-3xl mx-auto bg-white p-8 print:p-0 text-slate-900">
        <header className="text-center border-b-2 border-slate-800 pb-3">
          <h1 className="text-2xl font-bold">{d.school.name}</h1>
          <p className="text-sm">{[d.school.address, d.school.city].filter(Boolean).join(", ")}{d.school.phone ? ` · ${d.school.phone}` : ""}{d.school.board ? ` · ${d.school.board}` : ""}</p>
          <p className="mt-2 font-semibold tracking-wide">PROGRESS REPORT · {d.academicYear}</p>
        </header>
        {d.includesDrafts && <p className="no-print mt-3 text-sm text-warning">Includes draft marks that parents can&apos;t see yet.</p>}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mt-4">
          <div><dt className="inline text-slate-500">Name: </dt><dd className="inline font-medium">{d.student.name}</dd></div>
          <div><dt className="inline text-slate-500">Admission no: </dt><dd className="inline font-mono">{d.student.admissionNumber}</dd></div>
          <div><dt className="inline text-slate-500">Class: </dt><dd className="inline">{classLabel(d.student.className)}{d.student.section ? ` – ${d.student.section}` : ""}</dd></div>
          <div><dt className="inline text-slate-500">Roll no: </dt><dd className="inline">{d.student.rollNumber || "—"}</dd></div>
          <div><dt className="inline text-slate-500">Date of birth: </dt><dd className="inline">{formatDate(d.student.dateOfBirth)}</dd></div>
          <div><dt className="inline text-slate-500">Parent: </dt><dd className="inline">{d.student.father || d.student.mother || "—"}</dd></div>
        </dl>
        {d.results.length === 0 ? <p className="mt-6 text-sm text-slate-500">No published results for this year yet.</p> : d.results.map((r) => (
          <section key={r.id} className="mt-6 break-inside-avoid">
            <h2 className="font-semibold mb-1">{r.exam}{r.examDate ? ` · ${formatDate(r.examDate)}` : ""}</h2>
            <table className="w-full text-sm border border-slate-400 border-collapse">
              <thead><tr className="bg-slate-100">{["Subject", "Marks", "Max", "%", "Grade", "Result"].map((h) => <th key={h} className="border border-slate-400 px-2 py-1 text-left">{h}</th>)}</tr></thead>
              <tbody>
                {r.subjects.map((s) => (
                  <tr key={s.subject}>
                    <td className="border border-slate-400 px-2 py-1">{s.subject}</td>
                    <td className="border border-slate-400 px-2 py-1 tabular-nums">{s.marks}</td>
                    <td className="border border-slate-400 px-2 py-1 tabular-nums">{s.maxMarks}</td>
                    <td className="border border-slate-400 px-2 py-1 tabular-nums">{s.percentage}</td>
                    <td className="border border-slate-400 px-2 py-1">{s.grade}</td>
                    <td className="border border-slate-400 px-2 py-1">{s.passed ? "Pass" : "Re-test"}</td>
                  </tr>
                ))}
                <tr className="font-semibold bg-slate-50">
                  <td className="border border-slate-400 px-2 py-1">Total</td>
                  <td className="border border-slate-400 px-2 py-1 tabular-nums">{r.total}</td>
                  <td className="border border-slate-400 px-2 py-1 tabular-nums">{r.maxTotal}</td>
                  <td className="border border-slate-400 px-2 py-1 tabular-nums">{r.percentage}</td>
                  <td className="border border-slate-400 px-2 py-1">{r.grade}</td>
                  <td className="border border-slate-400 px-2 py-1">{r.passed ? "Pass" : "Re-test"}</td>
                </tr>
              </tbody>
            </table>
            {r.remarks && <p className="text-sm mt-1"><span className="text-slate-500">Remarks:</span> {r.remarks}</p>}
          </section>
        ))}
        <section className="mt-6 text-sm break-inside-avoid">
          <h2 className="font-semibold mb-1">Attendance</h2>
          <p>{att.workingDays} school days · present {att.present + att.late} · half days {att.half_day} · absent {att.absent} · leave {att.leave} · <strong>{att.percentage ?? "—"}%</strong></p>
        </section>
        <p className="mt-4 text-xs text-slate-500">Grades: A1 91–100, A2 81–90, B1 71–80, B2 61–70, C1 51–60, C2 41–50, D 33–40, E below 33.</p>
        <footer className="mt-16 grid grid-cols-3 gap-6 text-center text-sm">
          {["Class teacher", "Principal", "Parent"].map((s) => <div key={s} className="border-t border-slate-500 pt-1">{s}</div>)}
        </footer>
        <p className="mt-6 text-[10px] text-slate-400 text-right">Generated by EduPro on {formatDate(d.generatedAt)}</p>
      </main>
    </>
  );
}
