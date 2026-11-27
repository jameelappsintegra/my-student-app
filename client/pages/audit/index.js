import { useState } from "react";
import Layout from "../../components/layout/layout";
import { Card, EmptyState, ErrorState, Loading, NoAccess, PageHeader, Pagination } from "../../components/common";
import useApi from "../../hooks/useApi";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";

export default function Audit() {
  const { can } = useAuth();
  const [f, setF] = useState({ event: "", actor: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const key = JSON.stringify([f, page]);
  const { data, pagination, loading, error, reload } = useApi(() => (can("audit.view") ? api.audit.list({ ...f, page }) : Promise.resolve({ data: { items: [], events: [] } })), [key]);
  if (!can("audit.view")) return <Layout title="Audit log"><NoAccess /></Layout>;
  const set = (k) => (e) => { setPage(1); setF({ ...f, [k]: e.target.value }); };
  return (
    <Layout title="Audit log">
      <PageHeader title="Audit log" subtitle="Who did what, and when. Kept for 12 months." />
      <Card>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 mb-4">
          <select className="select select-bordered select-sm" aria-label="Action" value={f.event} onChange={set("event")}>
            <option value="">All actions</option>
            {(data?.events || []).map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <input className="input input-bordered input-sm" placeholder="Person" aria-label="Person" value={f.actor} onChange={set("actor")} />
          <input type="date" className="input input-bordered input-sm" aria-label="From" value={f.from} onChange={set("from")} />
          <input type="date" className="input input-bordered input-sm" aria-label="To" value={f.to} onChange={set("to")} />
        </div>
        {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.items.length === 0 ? <EmptyState title="No matching entries" /> : (
          <div className="overflow-x-auto">
            <table className="table table-compact w-full">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th><th>IP</th></tr></thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap text-xs">{new Date(a.at).toLocaleString()}</td>
                    <td>{a.actorName || "—"}<div className="text-xs text-slate-500 capitalize">{a.actorRole}</div></td>
                    <td className="font-mono text-xs">{a.event}</td>
                    <td className="text-xs text-slate-600 max-w-md truncate" title={JSON.stringify(a.details)}>{Object.entries(a.details || {}).filter(([k]) => !["actor"].includes(k)).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ")}</td>
                    <td className="text-xs font-mono">{a.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination pagination={pagination} onPage={setPage} />
      </Card>
    </Layout>
  );
}
