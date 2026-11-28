import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, EmptyState, ErrorState, Loading, Notice, PageHeader } from "../common";
import useSchools from "../../hooks/useSchools";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { classLabel, formatDate, money } from "../../constants";

function Tile({ label, value, hint, tone = "", href }) {
  const body = (
    <div className={`rounded-xl bg-white border border-slate-200 p-4 h-full ${href ? "hover:border-primary/40" : ""}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}><a className="block">{body}</a></Link> : body;
}

// The librarian's day: what's out, what's late, fines and reservations.
export default function LibrarianHome() {
  const { user } = useAuth();
  const { schools } = useSchools();
  const [school, setSchool] = useState("");
  const [state, setState] = useState({ loading: true });
  const [notice, setNotice] = useState(null);
  useEffect(() => { if (!school && schools[0]) setSchool(schools[0].id); }, [school, schools]);
  const load = () => {
    if (!school) return;
    api.library.dashboard(school).then((r) => setState({ data: r.data })).catch((error) => setState({ error }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [school]);
  const act = async (fn) => { try { const r = await fn(); setNotice(r.message); load(); } catch (err) { setNotice(err.message); } };
  const d = state.data;
  const m = (n) => money(n, d?.currency, d?.locale);
  const first = (user?.name || "").split(" ")[0];
  return (
    <>
      <PageHeader title={`Good day${first ? `, ${first}` : ""}`} subtitle="Your library today"
        actions={schools.length > 1 && <select className="select select-bordered select-sm" aria-label="School" value={school} onChange={(e) => setSchool(e.target.value)}>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>} />
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      {state.error ? <ErrorState error={state.error} onRetry={load} /> : !d ? <Loading /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Books" value={d.books.titles} hint={`${d.books.copies} copies · ${d.books.onShelf} on the shelf`} href="/library" />
            <Tile label="On loan" value={d.loans.onLoan} hint={`${d.loans.dueToday} due back today`} href="/library?tab=loans" />
            <Tile label="Overdue" value={d.loans.overdue} tone={d.loans.overdue ? "text-error" : "text-success"} hint={d.loans.overdue ? "Send reminders below" : "Nothing late"} href="/library?tab=loans&status=overdue" />
            <Tile label="Reservations" value={d.reservations.ready + d.reservations.waiting} hint={`${d.reservations.ready} ready to collect · ${d.reservations.waiting} waiting`} href="/library?tab=reservations" />
            <Tile label="Unpaid fines" value={m(d.fines.due)} tone={d.fines.due ? "text-warning" : ""} hint={`Fine is ${m(d.fines.finePerDay)} a day`} href="/library?tab=loans&status=fines" />
            <Tile label="Fines collected this month" value={m(d.fines.collectedThisMonth)} hint={d.fines.waivedThisMonth ? `${m(d.fines.waivedThisMonth)} waived` : "None waived"} />
            <Tile label="Lent this month" value={d.loans.thisMonth} hint={`${d.loans.returnsThisMonth} returned`} />
            <div className="rounded-xl bg-white border border-slate-200 p-4 flex flex-col gap-2 justify-center">
              <Link href="/library"><a className="btn btn-primary btn-sm">Lend a book</a></Link>
              <Link href="/library?tab=import"><a className="btn btn-sm">Import books (CSV)</a></Link>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title={`Overdue (${d.loans.overdue})`} className="lg:col-span-2">
              {d.overdue.length === 0 ? <EmptyState title="No overdue books" message="Every book on loan is within its return date." /> : (
                <>
                  <ul className="divide-y divide-slate-100">
                    {d.overdue.map((x) => (
                      <li key={x.id} className="py-2 flex flex-wrap justify-between items-center gap-2">
                        <span className="min-w-0">
                          <span className="block font-medium truncate">{x.book?.title}</span>
                          <span className="text-xs text-slate-500">{x.student?.name} · {classLabel(x.student?.className)} {x.student?.section || ""} · due {formatDate(x.dueAt)}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="badge badge-error badge-sm whitespace-nowrap">{x.daysLate} days · {m(x.daysLate * d.fines.finePerDay)}</span>
                          <button className="btn btn-xs" onClick={() => act(() => api.library.remind(x.id))}>{x.remindedAt ? `Remind again` : "Remind"}</button>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button className="btn btn-sm btn-warning" onClick={() => act(() => api.library.remindOverdue(school))}>Remind all overdue</button>
                    <Link href="/library?tab=loans&status=overdue"><a className="btn btn-sm btn-ghost">See all overdue</a></Link>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Reminders go to the student&apos;s and parents&apos; EduPro notifications. &ldquo;Remind all&rdquo; skips loans reminded in the last 2 days.</p>
                </>
              )}
            </Card>
            <Card title="Most borrowed (90 days)">
              {d.popular.length === 0 ? <EmptyState title="No loans yet" /> : (
                <ol className="space-y-2">
                  {d.popular.map((b, i) => (
                    <li key={b.id} className="flex items-center gap-3 text-sm">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{b.title}</span><span className="text-xs text-slate-500 truncate block">{b.author}</span></span>
                      <span className="text-xs text-slate-500 whitespace-nowrap">{b.loans} loan{b.loans === 1 ? "" : "s"}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
