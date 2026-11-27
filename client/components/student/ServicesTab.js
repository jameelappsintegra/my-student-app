import Link from "next/link";
import { Card, EmptyState, ErrorState, Loading } from "../common";
import useApi from "../../hooks/useApi";
import { api } from "../../services/api";
import { CERTIFICATE_TYPES, TRANSPORT, formatDate, money } from "../../constants";

// School bus, library loans and certificates for one student.
export default function ServicesTab({ studentId }) {
  const { data, loading, error, reload } = useApi(() => api.students.services(studentId), [studentId]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const t = data.transport;
  const open = data.library.filter((x) => !x.returnedAt);
  const fines = data.library.filter((x) => x.fineStatus === "due");
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card title="School bus">
        {t.route ? (
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-slate-500">Route</dt><dd className="col-span-2 font-medium">{t.route.name}{t.route.vehicleNumber ? ` · ${t.route.vehicleNumber}` : ""}</dd>
            <dt className="text-slate-500">Stop</dt><dd className="col-span-2">{t.stop.name}</dd>
            <dt className="text-slate-500">Pickup</dt><dd className="col-span-2">{t.stop.pickupTime || "—"}</dd>
            <dt className="text-slate-500">Drop</dt><dd className="col-span-2">{t.stop.dropTime || "—"}</dd>
            {t.stop.fee != null && <><dt className="text-slate-500">Fee</dt><dd className="col-span-2">{money(t.stop.fee, data.currency, data.locale)} per term</dd></>}
            <dt className="text-slate-500">Driver</dt><dd className="col-span-2">{t.route.driverName || "—"} {t.route.driverPhone && <a className="link" href={`tel:${t.route.driverPhone}`}>{t.route.driverPhone}</a>}</dd>
            {t.route.attendantName && <><dt className="text-slate-500">Attendant</dt><dd className="col-span-2">{t.route.attendantName} {t.route.attendantPhone && <a className="link" href={`tel:${t.route.attendantPhone}`}>{t.route.attendantPhone}</a>}</dd></>}
          </dl>
        ) : <p className="text-sm text-slate-600">{t.mode ? TRANSPORT[t.mode] || t.mode : "Not using the school bus."}</p>}
      </Card>
      <Card title="Library">
        {data.library.length === 0 ? <EmptyState title="No books borrowed yet" /> : (
          <>
            {fines.length > 0 && <div className="alert alert-warning py-2 mb-3 text-sm"><span>Unpaid library fine: {money(fines.reduce((a, x) => a + x.fine, 0), data.currency, data.locale)}. Pay at the library to borrow again.</span></div>}
            <p className="text-sm text-slate-500 mb-2">{open.length} book{open.length === 1 ? "" : "s"} borrowed now.</p>
            <ul className="divide-y divide-slate-100">
              {data.library.slice(0, 8).map((x) => (
                <li key={x.id} className="py-2 flex justify-between gap-2 text-sm">
                  <span className="truncate">{x.book?.title}</span>
                  {x.returnedAt ? <span className="text-slate-400 whitespace-nowrap">Returned {formatDate(x.returnedAt)}</span>
                    : <span className={`whitespace-nowrap ${x.overdue ? "text-error font-medium" : ""}`}>{x.overdue ? "Overdue since" : "Due"} {formatDate(x.dueAt)}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card title="Certificates" className="md:col-span-2">
        {data.certificates.length === 0 ? <p className="text-sm text-slate-600">No certificates issued. Ask the school office for a bonafide or transfer certificate.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.certificates.map((c) => (
              <li key={c.id} className="py-2 flex justify-between items-center gap-2 text-sm">
                <span>{CERTIFICATE_TYPES[c.type]} <span className="font-mono text-xs text-slate-500">{c.serialNumber}</span>{c.status === "cancelled" && <span className="badge badge-error badge-sm ml-2">Cancelled</span>}</span>
                <Link href={`/certificates/${c.id}`}><a className="btn btn-xs">View</a></Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
