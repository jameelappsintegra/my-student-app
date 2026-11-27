import { useState } from "react";
import { Dialog } from "../common";
import { api } from "../../services/api";

// Reads an Aadhaar Paperless Offline e-KYC file to pre-fill a form. The file
// is read by the server in memory and not stored; nothing is saved until
// the form itself is submitted.
export default function AadhaarFill({ onFill }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.identity.aadhaarOffline(file, code.trim());
      setResult(res.data);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    setOpen(false);
    setResult(null);
    setFile(null);
    setCode("");
    setError(null);
  };

  return (
    <>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>Fill from Aadhaar</button>
      {open && (
        <Dialog
          title="Fill details from Aadhaar"
          onClose={close}
          footer={
            result ? (
              <>
                <button className="btn btn-ghost" onClick={() => setResult(null)}>Back</button>
                <button className="btn btn-primary" onClick={() => { onFill(result); close(); }}>Use these details</button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={close}>Cancel</button>
                <button className={`btn btn-primary ${busy ? "loading" : ""}`} onClick={read} disabled={!file || busy}>Read file</button>
              </>
            )
          }
        >
          {!result ? (
            <>
              <ol className="text-sm text-slate-600 list-decimal pl-5 space-y-1 mb-3">
                <li>The parent opens <span className="font-medium">myaadhaar.uidai.gov.in</span> → <span className="font-medium">Offline e-KYC</span>, signs in with the child&apos;s Aadhaar and OTP.</li>
                <li>They choose a 4-character share code and download the ZIP file.</li>
                <li>Upload the ZIP here and enter the share code.</li>
              </ol>
              <input type="file" accept=".zip,.xml,application/zip,text/xml" aria-label="Aadhaar ZIP file" className="file-input file-input-bordered file-input-sm w-full" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <label className="form-control mt-2 w-40">
                <span className="label-text mb-1">Share code</span>
                <input className="input input-bordered input-sm" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
              </label>
              <p className="text-xs text-slate-500 mt-3">EduPro never stores the Aadhaar number or the file. Only the details you choose to keep in the form are saved.</p>
              {error && <div className="alert alert-error mt-3 py-2" role="alert"><span>{error.message}</span></div>}
            </>
          ) : (
            <>
              <div className="flex gap-4 items-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {result.photo && <img src={result.photo} alt="Aadhaar photo" className="w-20 h-24 object-cover rounded border" />}
                <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="text-slate-500">Name</dt><dd>{[result.firstName, result.middleName, result.lastName].filter(Boolean).join(" ")}</dd>
                  <dt className="text-slate-500">Date of birth</dt><dd>{result.dateOfBirth}</dd>
                  <dt className="text-slate-500">Gender</dt><dd>{result.gender}</dd>
                  <dt className="text-slate-500">{result.father ? "Father" : "Guardian"}</dt><dd>{result.father?.name || result.guardian?.name || "—"}</dd>
                  <dt className="text-slate-500">Address</dt><dd>{result.address}</dd>
                  <dt className="text-slate-500">Aadhaar</dt><dd>XXXX XXXX {result.aadhaarLast4}</dd>
                </dl>
              </div>
              {result.verified === true && <div className="alert alert-success mt-3 py-2"><span>UIDAI signature verified.</span></div>}
              {result.warnings.map((w) => <div key={w} className="alert alert-warning mt-3 py-2 text-sm"><span>{w}</span></div>)}
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
