import { useState } from "react";
import { Card, ConfirmDialog, Dialog, EmptyState } from "../common";
import { api } from "../../services/api";
import { FEE_STATUS, PAYMENT_METHODS, academicYearOptions, formatDate, money, todayIso } from "../../constants";

function PaymentDialog({ studentId, invoice, onClose, onSaved }) {
  const [f, setF] = useState({ amount: String(invoice.balance), method: "upi", paidAt: todayIso(), reference: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.students.recordPayment(studentId, invoice.id, {
        amount: Number(f.amount),
        method: f.method,
        paidAt: f.paidAt || undefined,
        reference: f.reference.trim() || undefined,
      });
      onSaved(res.message);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={`Record payment · ${invoice.title}`}
      onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className={`btn btn-primary ${busy ? "loading" : ""}`} onClick={save} disabled={busy}>Record payment</button></>}
    >
      <p className="text-sm text-slate-500 mb-3">Still due: {money(invoice.balance)} of {money(invoice.amount)}. Record only money actually received.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="form-control"><span className="label-text mb-1">Amount (₹)</span><input className="input input-bordered" type="number" inputMode="numeric" min={1} max={invoice.balance} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
        <label className="form-control"><span className="label-text mb-1">Paid by</span><select className="select select-bordered" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="form-control"><span className="label-text mb-1">Date</span><input className="input input-bordered" type="date" max={todayIso()} value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} /></label>
        <label className="form-control"><span className="label-text mb-1">Reference</span><input className="input input-bordered" placeholder="UPI ref / cheque no." value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></label>
      </div>
      {error && <div className="alert alert-error mt-3 py-2" role="alert"><span>{error.message}</span></div>}
    </Dialog>
  );
}

function FeeDialog({ studentId, onClose, onSaved }) {
  const [f, setF] = useState({ title: "", amount: "", dueDate: "", academicYear: academicYearOptions()[0] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.students.createFee(studentId, { ...f, title: f.title.trim(), amount: Number(f.amount) });
      onSaved(res.message);
    } catch (err) {
      setError(err.errors?.length ? { message: err.errors.map((e) => e.message).join(". ") } : err);
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Add a fee"
      onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className={`btn btn-primary ${busy ? "loading" : ""}`} onClick={save} disabled={busy}>Add fee</button></>}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="form-control col-span-2"><span className="label-text mb-1">For</span><input className="input input-bordered" placeholder="Term 2 tuition fee" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="form-control"><span className="label-text mb-1">Amount (₹)</span><input className="input input-bordered" type="number" inputMode="numeric" min={1} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
        <label className="form-control"><span className="label-text mb-1">Due date</span><input className="input input-bordered" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
        <label className="form-control"><span className="label-text mb-1">Year</span><select className="select select-bordered" value={f.academicYear} onChange={(e) => setF({ ...f, academicYear: e.target.value })}>{academicYearOptions().map((y) => <option key={y}>{y}</option>)}</select></label>
      </div>
      {error && <div className="alert alert-error mt-3 py-2" role="alert"><span>{error.message}</span></div>}
    </Dialog>
  );
}

export default function FeesTab({ studentId, fees, onChanged }) {
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const s = fees.summary;
  const done = (msg) => { setDialog(null); onChanged(msg); };
  const confirm = async (fn, msg) => {
    setBusy(true);
    setError(null);
    try { await fn(); done(msg); } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><dt className="text-xs text-slate-500">Billed</dt><dd className="text-lg font-semibold tabular-nums">{money(s.billed)}</dd></div>
          <div><dt className="text-xs text-slate-500">Paid</dt><dd className="text-lg font-semibold tabular-nums text-success">{money(s.paid)}</dd></div>
          <div><dt className="text-xs text-slate-500">Balance</dt><dd className="text-lg font-semibold tabular-nums">{money(s.balance)}</dd></div>
          <div><dt className="text-xs text-slate-500">Overdue</dt><dd className={`text-lg font-semibold tabular-nums ${s.overdue ? "text-error" : ""}`}>{money(s.overdue)}</dd></div>
        </dl>
        <div className="flex justify-between items-center mt-3 gap-2">
          <span className={`badge ${s.status === "paid" ? "badge-success" : s.status === "overdue" ? "badge-error" : "badge-warning"}`}>
            {s.status === "paid" ? "All fees paid" : s.status === "overdue" ? `${s.overdueCount} overdue` : "Fees due"}
          </span>
          <button className="btn btn-primary btn-sm" onClick={() => setDialog({ kind: "fee" })}>Add fee</button>
        </div>
      </Card>

      {fees.invoices.length === 0 ? (
        <Card><EmptyState title="No fees recorded" message="Add the term fees for this student to track payments." /></Card>
      ) : (
        fees.invoices.map((inv) => {
          const st = inv.overdue ? FEE_STATUS.overdue : FEE_STATUS[inv.status];
          return (
            <Card key={inv.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900">{inv.title}</h3>
                  <p className="text-xs text-slate-500">{inv.academicYear} · due {formatDate(inv.dueDate)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{money(inv.amount)}</p>
                  <span className={`badge badge-sm ${st.badge}`}>{st.label}{inv.balance && inv.status !== "unpaid" ? ` · ${money(inv.balance)} due` : ""}</span>
                </div>
              </div>
              {inv.payments.length > 0 && (
                <ul className="mt-3 divide-y divide-slate-100 text-sm">
                  {inv.payments.map((p) => (
                    <li key={p.id} className="py-2 flex flex-wrap justify-between gap-2">
                      <span>
                        {money(p.amount)} by {PAYMENT_METHODS[p.method]} on {formatDate(p.paidAt)}
                        <span className="block text-xs text-slate-500 font-mono">{p.receiptNumber}{p.reference ? ` · ${p.reference}` : ""}</span>
                      </span>
                      <button className="btn btn-ghost btn-xs text-error" onClick={() => { setError(null); setDialog({ kind: "removePayment", inv, p }); }}>Remove</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 justify-end mt-3">
                {inv.balance > 0 && <button className="btn btn-sm btn-primary" onClick={() => setDialog({ kind: "pay", inv })}>Record payment</button>}
                {inv.payments.length === 0 && <button className="btn btn-sm btn-ghost text-error" onClick={() => { setError(null); setDialog({ kind: "deleteFee", inv }); }}>Delete</button>}
              </div>
            </Card>
          );
        })
      )}

      {dialog?.kind === "pay" && <PaymentDialog studentId={studentId} invoice={dialog.inv} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === "fee" && <FeeDialog studentId={studentId} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === "deleteFee" && (
        <ConfirmDialog title={`Delete ${dialog.inv.title}?`} message="This fee has no payments, so nothing else is affected." busy={busy} error={error}
          onClose={() => setDialog(null)} onConfirm={() => confirm(() => api.students.deleteFee(studentId, dialog.inv.id), "Fee deleted")} />
      )}
      {dialog?.kind === "removePayment" && (
        <ConfirmDialog title="Remove this payment?" confirmLabel="Remove payment"
          message={`${money(dialog.p.amount)} (receipt ${dialog.p.receiptNumber}) will be removed and the balance goes back up. Use this only to correct a mistake.`}
          busy={busy} error={error} onClose={() => setDialog(null)}
          onConfirm={() => confirm(() => api.students.removePayment(studentId, dialog.inv.id, dialog.p.id), "Payment removed")} />
      )}
    </div>
  );
}
