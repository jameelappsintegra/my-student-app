import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../../components/layout/layout";
import { Avatar, Card, EmptyState, ErrorState, Loading, NoAccess, PageHeader } from "../../components/common";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { FEE_STATUS, PAYMENT_METHODS, classLabel, formatDate, fullName, money } from "../../constants";

async function load() {
  const kids = (await api.me.children()).data;
  const fees = await Promise.all(kids.map((k) => api.students.fees(k.id).then((r) => r.data)));
  return kids.map((k, i) => ({ kid: k, fees: fees[i] }));
}

function ChildFees({ kid, fees }) {
  const s = fees.summary;
  const m = (n) => money(n, s.currency, s.locale);
  const payments = fees.invoices.flatMap((inv) => inv.payments.map((p) => ({ ...p, invoice: inv }))).sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <Avatar student={kid} size="w-12 h-12" />
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900 truncate">{fullName(kid)}</h2>
          <p className="text-xs text-slate-500">{classLabel(kid.className)}{kid.section ? ` ${kid.section}` : ""} · {kid.school?.name}</p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center mb-4">
        <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Billed</dt><dd className="font-semibold tabular-nums">{m(s.billed)}</dd></div>
        <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Paid</dt><dd className="font-semibold tabular-nums text-success">{m(s.paid)}</dd></div>
        <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Due</dt><dd className={`font-semibold tabular-nums ${s.overdue ? "text-error" : ""}`}>{s.balance ? m(s.balance) : "Nil"}</dd></div>
      </dl>
      {s.overdue > 0 && <div className="alert alert-error py-2 mb-3 text-sm" role="status"><span>{m(s.overdue)} is overdue. Please pay at the school office.</span></div>}
      <h3 className="text-sm font-semibold mb-2">Bills</h3>
      {fees.invoices.length === 0 ? <p className="text-sm text-slate-500 mb-3">No bills yet.</p> : (
        <ul className="divide-y divide-slate-100 mb-4">
          {fees.invoices.map((inv) => {
            const st = FEE_STATUS[inv.overdue ? "overdue" : inv.status] || FEE_STATUS.unpaid;
            return (
              <li key={inv.id} className="py-2 flex justify-between items-start gap-3 text-sm">
                <span className="min-w-0"><span className="block font-medium truncate">{inv.title}</span><span className="text-xs text-slate-500">{inv.academicYear} · due {formatDate(inv.dueDate)}</span></span>
                <span className="text-right whitespace-nowrap"><span className="block tabular-nums">{m(inv.amount)}</span><span className={`badge badge-sm ${st.badge}`}>{st.label}{inv.balance && inv.status !== "unpaid" ? ` · ${m(inv.balance)} left` : ""}</span></span>
              </li>
            );
          })}
        </ul>
      )}
      <h3 className="text-sm font-semibold mb-2">Payments</h3>
      {payments.length === 0 ? <p className="text-sm text-slate-500">No payments recorded yet.</p> : (
        <ul className="divide-y divide-slate-100">
          {payments.map((p) => (
            <li key={p.id} className="py-2 flex justify-between items-center gap-3 text-sm">
              <span className="min-w-0"><span className="block tabular-nums font-medium">{m(p.amount)} <span className="font-normal text-slate-500">· {PAYMENT_METHODS[p.method] || p.method}</span></span><span className="text-xs text-slate-500 truncate block">{formatDate(p.paidAt)} · {p.invoice.title} · {p.receiptNumber}</span></span>
              <Link href={`/fees/receipt?student=${kid.id}&invoice=${p.invoice.id}&payment=${p.id}`}><a className="btn btn-xs">Receipt</a></Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// Parents: every child's bills, payments and receipts in one place.
export default function Fees() {
  const { user, can } = useAuth();
  const [state, setState] = useState({ loading: true });
  const ok = user?.role === "parent" && can("fees.view");
  useEffect(() => {
    if (!ok) return;
    load().then((data) => setState({ data })).catch((error) => setState({ error }));
  }, [ok]);
  if (!ok) return <Layout title="Fees"><NoAccess /></Layout>;
  return (
    <Layout title="Fees & receipts">
      <PageHeader title="Fees & receipts" subtitle="Bills, payments and printable receipts for your children." />
      {state.loading ? <Loading /> : state.error ? <ErrorState error={state.error} /> : state.data.length === 0 ? (
        <Card><EmptyState title="No children linked to your account" /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {state.data.map(({ kid, fees }) => <ChildFees key={kid.id} kid={kid} fees={fees} />)}
        </div>
      )}
    </Layout>
  );
}
