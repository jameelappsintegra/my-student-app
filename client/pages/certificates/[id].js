import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { Dialog, ErrorState, Loading } from "../../components/common";
import useApi from "../../hooks/useApi";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { classLabel, formatDate } from "../../constants";

function Body({ c }) {
  const s = c.snapshot || {};
  const ward = s.gender === "female" ? "daughter" : s.gender === "male" ? "son" : "ward";
  const parent = s.father || s.mother || s.guardian;
  const cls = `${classLabel(s.className)}${s.section ? ` (${s.section})` : ""}`;
  if (c.type === "transfer") {
    const rows = [
      ["Name of the student", s.name], ["Admission number", s.admissionNumber], ["Date of birth", formatDate(s.dateOfBirth)],
      ["Father's name", s.father], ["Mother's name", s.mother], ["Nationality", s.nationality],
      ["Date of admission", formatDate(s.admissionDate)], ["Class last studied", cls], ["Academic year", s.academicYear],
      ["Date of leaving", formatDate(c.leavingDate)], ["Reason for leaving", c.reason], ["Conduct and character", c.conduct],
      ["School dues", c.duesCleared ? "All dues paid" : "Dues pending (see school office)"], ["Remarks", c.remarks],
    ].filter(([, v]) => v);
    return (
      <table className="w-full text-sm border-collapse">
        <tbody>{rows.map(([k, v], i) => <tr key={k} className="border-b border-slate-200"><td className="py-2 pr-4 w-8 text-slate-400">{i + 1}.</td><td className="py-2 pr-4 w-1/2">{k}</td><td className="py-2 font-medium">{v}</td></tr>)}</tbody>
      </table>
    );
  }
  const lead = `This is to certify that ${s.name}${parent ? `, ${ward} of ${parent},` : ""} (admission number ${s.admissionNumber}, date of birth ${formatDate(s.dateOfBirth)})`;
  const text = {
    bonafide: `${lead} is a bonafide student of this school, studying in ${cls} during the academic year ${s.academicYear}.${c.purpose ? ` This certificate is issued on request for the purpose of ${c.purpose}.` : ""}`,
    study: `${lead} has been studying in this school since ${formatDate(s.admissionDate)} and is at present in ${cls}, academic year ${s.academicYear}.${c.purpose ? ` Issued for ${c.purpose}.` : ""}`,
    character: `${lead} is known to us as a student of ${cls}. During this period their conduct and character have been ${String(c.conduct || "good").toLowerCase()}.`,
  }[c.type];
  return <p className="leading-8 text-[15px]">{text}{c.remarks ? ` ${c.remarks}` : ""}</p>;
}

// Printable certificate with the school's letterhead and verification code.
export default function CertificatePage() {
  const { query } = useRouter();
  const { can } = useAuth();
  const { data: c, loading, error, reload } = useApi(() => (query.id ? api.certificates.get(query.id) : new Promise(() => {})), [query.id]);
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelError, setCancelError] = useState(null);
  if (loading) return <Loading />;
  if (error) return <div className="p-4"><ErrorState error={error} /></div>;
  const verifyUrl = typeof window !== "undefined" ? `${window.location.origin}/verify/${c.verificationCode}` : `/verify/${c.verificationCode}`;
  return (
    <div className="min-h-screen bg-slate-100 print:bg-white py-6 px-4">
      <Head><title>{`${c.label} ${c.serialNumber}`}</title></Head>
      <div className="max-w-3xl mx-auto flex flex-wrap gap-2 mb-4 print:hidden">
        <Link href={can("certificates.issue") ? "/certificates" : "/"}><a className="btn btn-sm">‹ Back</a></Link>
        <button className="btn btn-sm btn-primary" onClick={() => window.print()} disabled={c.status === "cancelled"}>Print</button>
        {can("certificates.issue") && c.status === "issued" && <button className="btn btn-sm btn-ghost text-error" onClick={() => setCancel(true)}>Cancel certificate</button>}
      </div>
      <article className="max-w-3xl mx-auto bg-white border border-slate-300 print:border-0 rounded-lg p-8 sm:p-12 relative">
        {c.status === "cancelled" && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="text-6xl font-bold text-error/20 -rotate-12">CANCELLED</span></div>}
        <header className="text-center border-b-2 border-slate-800 pb-4 mb-6">
          <h1 className="text-2xl font-bold uppercase tracking-wide">{c.school?.name}</h1>
          <p className="text-sm text-slate-600">{[c.school?.address, c.school?.city].filter(Boolean).join(", ")}</p>
          <p className="text-xs text-slate-500">{[c.school?.board && `${c.school.board} affiliated`, c.school?.phone, c.school?.email].filter(Boolean).join(" · ")}</p>
        </header>
        <div className="flex justify-between text-sm mb-6">
          <span>No. <strong className="font-mono">{c.serialNumber}</strong></span>
          <span>Date: {formatDate(c.issuedAt)}</span>
        </div>
        <h2 className="text-center text-xl font-semibold uppercase underline underline-offset-4 mb-8">{c.label}</h2>
        <Body c={c} />
        <footer className="mt-16 flex justify-between items-end text-sm">
          <div className="text-xs text-slate-500 max-w-[55%]">
            <p>Verify this certificate at</p>
            <p className="font-mono break-all">{verifyUrl}</p>
            <p className="mt-1">Code <strong className="font-mono">{c.verificationCode}</strong></p>
          </div>
          <div className="text-center">
            <div className="h-12" />
            <p className="border-t border-slate-500 pt-1 px-6">{c.school?.principalName || "Principal"}</p>
            <p className="text-xs text-slate-500">Principal (seal and signature)</p>
          </div>
        </footer>
        {c.status === "cancelled" && <p className="text-sm text-error mt-6">Cancelled on {formatDate(c.cancelledAt)}: {c.cancelReason}</p>}
      </article>
      {cancel && (
        <Dialog title={`Cancel ${c.serialNumber}?`} onClose={() => setCancel(false)}
          footer={<><button className="btn btn-ghost" onClick={() => setCancel(false)}>Keep it</button><button className="btn btn-error" onClick={async () => {
            try { await api.certificates.cancel(c.id, reason); setCancel(false); reload(); } catch (err) { setCancelError(err.errors?.[0]?.message || err.message); }
          }}>Cancel certificate</button></>}>
          <p className="text-sm text-slate-600 mb-2">The verification page will show it as cancelled.{c.type === "transfer" ? " The student goes back on the roll." : ""}</p>
          <input className="input input-bordered input-sm w-full" placeholder="Reason" aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          {cancelError && <p className="text-error text-sm mt-2">{cancelError}</p>}
        </Dialog>
      )}
    </div>
  );
}
