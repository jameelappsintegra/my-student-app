import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Loading } from "../../components/common";
import { api } from "../../services/api";
import { formatDate } from "../../constants";

// Public page: anyone (another school, an embassy) can check a certificate
// by the code printed on it. It shows only what the certificate itself says.
export default function Verify() {
  const { query } = useRouter();
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    if (!query.code) return;
    api.certificates.verify(query.code)
      .then((r) => setState({ data: r.data, message: r.message }))
      .catch((err) => setState({ error: err.status === 404 ? "No certificate matches this code. Check the code printed at the bottom of the certificate." : "Couldn't check the certificate right now. Try again later." }));
  }, [query.code]);
  const d = state.data;
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <Head><title>Verify certificate · EduPro</title></Head>
      <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md w-full">
        <h1 className="text-lg font-semibold mb-4">Certificate verification</h1>
        {state.loading ? <Loading label="Checking…" /> : state.error ? (
          <div className="alert alert-error" role="alert"><span>{state.error}</span></div>
        ) : (
          <>
            <div className={`alert ${d.valid ? "alert-success" : "alert-error"} mb-4`} role="status"><span>{state.message}</span></div>
            <dl className="grid grid-cols-3 gap-y-2 text-sm">
              <dt className="text-slate-500">Certificate</dt><dd className="col-span-2 font-medium">{d.type}</dd>
              <dt className="text-slate-500">Number</dt><dd className="col-span-2 font-mono">{d.serialNumber}</dd>
              <dt className="text-slate-500">Student</dt><dd className="col-span-2">{d.name}</dd>
              <dt className="text-slate-500">School</dt><dd className="col-span-2">{d.school}{d.city ? `, ${d.city}` : ""}</dd>
              <dt className="text-slate-500">Issued</dt><dd className="col-span-2">{formatDate(d.issuedAt)}</dd>
            </dl>
          </>
        )}
      </div>
    </div>
  );
}
