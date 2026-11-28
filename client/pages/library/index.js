import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/layout/layout";
import { Card, ConfirmDialog, Dialog, EmptyState, ErrorState, Loading, Notice, PageHeader } from "../../components/common";
import SchoolSelect from "../../components/forms/SchoolSelect";
import StudentPicker from "../../components/forms/StudentPicker";
import useApi from "../../hooks/useApi";
import { useAuth } from "../../context/auth";
import { api } from "../../services/api";
import { classLabel, formatDate } from "../../constants";

const errText = (err) => (err.errors?.length ? err.errors.map((e) => e.message).join(". ") : err.message);

function BookDialog({ book, school, onClose, onSaved }) {
  const [f, setF] = useState({ title: book?.title || "", author: book?.author || "", isbn: book?.isbn || "", category: book?.category || "", publisher: book?.publisher || "", shelf: book?.shelf || "", copies: book?.copies || 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog title={book ? `Edit ${book.title}` : "Add a book"} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className={`btn btn-primary ${busy ? "loading" : ""}`} disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        const body = { school: book?.school || school, ...f, copies: Number(f.copies) };
        try { const r = book ? await api.library.updateBook(book.id, body) : await api.library.addBook(body); onSaved(r.message); } catch (err) { setError(errText(err)); setBusy(false); }
      }}>Save</button></>}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="form-control sm:col-span-2"><span className="label-text mb-1">Title</span><input className="input input-bordered input-sm" value={f.title} onChange={set("title")} /></label>
        <label className="form-control"><span className="label-text mb-1">Author</span><input className="input input-bordered input-sm" value={f.author} onChange={set("author")} /></label>
        <label className="form-control"><span className="label-text mb-1">ISBN</span><input className="input input-bordered input-sm" value={f.isbn} onChange={set("isbn")} /></label>
        <label className="form-control"><span className="label-text mb-1">Category</span><input className="input input-bordered input-sm" value={f.category} onChange={set("category")} placeholder="Fiction, Science…" /></label>
        <label className="form-control"><span className="label-text mb-1">Shelf</span><input className="input input-bordered input-sm" value={f.shelf} onChange={set("shelf")} placeholder="B-3" /></label>
        <label className="form-control"><span className="label-text mb-1">Publisher</span><input className="input input-bordered input-sm" value={f.publisher} onChange={set("publisher")} /></label>
        <label className="form-control"><span className="label-text mb-1">Copies</span><input type="number" min="1" className="input input-bordered input-sm" value={f.copies} onChange={set("copies")} /></label>
      </div>
      {error && <div className="alert alert-error mt-3 py-2" role="alert"><span>{error}</span></div>}
    </Dialog>
  );
}

function LendDialog({ book, onClose, onSaved }) {
  const [student, setStudent] = useState(null);
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <Dialog title={`Lend "${book.title}"`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className={`btn btn-primary ${busy ? "loading" : ""}`} disabled={busy || !student} onClick={async () => {
        setBusy(true); setError(null);
        try { const r = await api.library.issue({ book: book.id, student: student.id, ...(due ? { dueDate: due } : {}) }); onSaved(r.message); } catch (err) { setError(errText(err)); setBusy(false); }
      }}>Lend book</button></>}>
      <div className="grid gap-3">
        <StudentPicker value={student} onChange={setStudent} school={book.school} />
        <label className="form-control w-48"><span className="label-text mb-1">Return by (optional)</span><input type="date" className="input input-bordered input-sm" value={due} onChange={(e) => setDue(e.target.value)} /></label>
      </div>
      <p className="text-xs text-slate-500 mt-2">Leave the date empty to use the school&apos;s loan period.</p>
      {error && <div className="alert alert-error mt-3 py-2" role="alert"><span>{error}</span></div>}
    </Dialog>
  );
}

function Loans({ school, initialStatus }) {
  const [status, setStatus] = useState(initialStatus || "open");
  const { data, loading, error, reload } = useApi(() => api.library.issues({ school, status }), [school, status]);
  const [notice, setNotice] = useState(null);
  const act = async (fn) => { try { const r = await fn(); setNotice(r.message); reload(); } catch (err) { setNotice(err.message); } };
  return (
    <>
      <div className="tabs tabs-boxed bg-white border border-slate-200 inline-flex flex-wrap mb-3" role="tablist">
        {[["open", "On loan"], ["overdue", "Overdue"], ["fines", "Unpaid fines"], ["returned", "Returned"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={status === k} className={`tab ${status === k ? "tab-active" : ""}`} onClick={() => setStatus(k)}>{l}</button>
        ))}
      </div>
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      {status === "overdue" && data?.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button className="btn btn-sm btn-warning" onClick={() => act(() => api.library.remindOverdue(school))}>Remind all overdue</button>
          <span className="text-xs text-slate-500">Sends an EduPro notification to each student and their parents (skips loans reminded in the last 2 days).</span>
        </div>
      )}
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.length === 0 ? <Card><EmptyState title="Nothing here" /></Card> : (
        <Card className="p-0 sm:p-0 xl:overflow-x-auto stack-wrap">
          <table className="table w-full table-stack">
            <thead><tr><th>Book</th><th>Student</th><th>Due</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.map((x) => (
                <tr key={x.id}>
                  <td data-primary className="xl:max-w-[14rem]"><p className="font-medium xl:truncate">{x.book?.title}</p><p className="text-xs font-normal text-slate-400 xl:truncate">{x.book?.author}</p></td>
                  <td data-label="Student">{x.student?.name}<p className="text-xs text-slate-400">{classLabel(x.student?.className)} {x.student?.section || ""}</p></td>
                  <td data-label="Due">{formatDate(x.dueAt)}{x.renewals > 0 && <p className="text-xs text-slate-400">Renewed {x.renewals}×</p>}{x.remindedAt && !x.returnedAt && <p className="text-xs text-slate-400">Reminded {formatDate(x.remindedAt)}</p>}</td>
                  <td data-label="Status">
                    {x.returnedAt ? <span className="badge badge-ghost badge-sm">Returned {formatDate(x.returnedAt)}</span> : x.overdue ? <span className="badge badge-error badge-sm">Overdue</span> : <span className="badge badge-info badge-sm">On loan</span>}
                    {x.fine > 0 && <p className="text-xs mt-1">Fine {x.fine} · {x.fineStatus}</p>}
                  </td>
                  <td data-actions className="text-right whitespace-nowrap">
                    {!x.returnedAt && <button className="btn btn-xs btn-primary" onClick={() => act(() => api.library.returnBook(x.id))}>Return</button>}
                    {!x.returnedAt && !x.overdue && <button className="btn btn-xs ml-1" onClick={() => act(() => api.library.renew(x.id))}>Renew</button>}
                    {!x.returnedAt && x.overdue && <button className="btn btn-xs btn-warning ml-1" onClick={() => act(() => api.library.remind(x.id))}>Remind</button>}
                    {x.fineStatus === "due" && <>
                      <button className="btn btn-xs ml-1" onClick={() => act(() => api.library.settleFine(x.id, "collect"))}>Fine paid</button>
                      <button className="btn btn-xs btn-ghost ml-1" onClick={() => act(() => api.library.settleFine(x.id, "waive"))}>Waive</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function Reservations({ school, staff }) {
  const { data, loading, error, reload } = useApi(() => api.library.reservations(staff ? { school } : {}), [school, staff]);
  const [notice, setNotice] = useState(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!staff && data.length === 0) return null;
  return (
    <Card title={staff ? "Reservations" : "My reservations"} className="mb-4">
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      {data.length === 0 ? <EmptyState title="No reservations" message="Students and parents reserve books that are out; you'll see the queue here." /> : (
        <ul className="divide-y divide-slate-100">
          {data.map((r) => (
            <li key={r.id} className="py-2 flex flex-wrap justify-between items-center gap-2 text-sm">
              <span className="min-w-0">
                <span className="block font-medium truncate">{r.book?.title}</span>
                <span className="text-xs text-slate-500">{r.student?.name}{staff ? ` · ${classLabel(r.student?.className)} ${r.student?.section || ""}` : ""} · reserved {formatDate(r.createdAt)}</span>
              </span>
              <span className="flex items-center gap-2">
                {r.status === "ready" ? <span className="badge badge-success badge-sm whitespace-nowrap">Ready · collect by {formatDate(r.readyUntil)}</span> : <span className="badge badge-ghost badge-sm">Waiting</span>}
                <button className="btn btn-ghost btn-xs text-error" onClick={async () => { try { const x = await api.library.cancelReservation(r.id); setNotice(x.message); reload(); } catch (err) { setNotice(err.message); } }}>Cancel</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ImportBooks({ school, onDone }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (dryRun) => {
    setBusy(true);
    try {
      const r = await api.library.importBooks(school, file, dryRun);
      setResult({ ok: true, message: r.message, data: r.data, done: !dryRun });
      if (!dryRun) onDone(r.message);
    } catch (err) {
      setResult({ ok: false, message: err.message, errors: err.errors });
    } finally { setBusy(false); }
  };
  return (
    <Card title="Import books from a spreadsheet">
      <ol className="list-decimal ml-5 text-sm text-slate-600 space-y-1 mb-4">
        <li><a className="link link-primary" href={api.library.importTemplateUrl()}>Download the template</a> and fill it in Excel or Google Sheets: title, author, ISBN, category, publisher, shelf, copies.</li>
        <li>Save it as CSV and choose it below. Check it first; nothing is saved until you import.</li>
        <li>A book with the same ISBN (or the same title and author) as one already in the library gets the extra copies added.</li>
      </ol>
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="file-input file-input-bordered file-input-sm w-full max-w-sm" aria-label="CSV file" onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }} />
      <div className="flex gap-2 mt-3">
        <button className={`btn btn-sm ${busy ? "loading" : ""}`} disabled={!file || busy} onClick={() => run(true)}>Check file</button>
        <button className={`btn btn-sm btn-primary ${busy ? "loading" : ""}`} disabled={!file || busy || (result && !result.ok)} onClick={() => run(false)}>Import</button>
      </div>
      {result && (
        <div className={`alert ${result.ok ? (result.data?.errors?.length ? "alert-warning" : "alert-success") : "alert-error"} mt-3 py-2 text-sm`} role="status">
          <div>
            <p>{result.message}</p>
            {result.ok && result.data && !result.data.errors?.length && <p className="text-xs">{result.data.rows} rows · {result.data.newBooks} new books · {result.data.addedCopiesTo} existing books get more copies · {result.data.copies} copies in total</p>}
            {(result.errors || result.data?.errors || []).slice(0, 10).map((e, i) => <p key={i} className="text-xs">Row {e.row}{e.field ? ` (${e.field})` : ""}: {e.message}</p>)}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Library() {
  const { can, user } = useAuth();
  const manage = can("library.manage");
  const family = user?.role === "parent" || user?.role === "student";
  const [school, setSchool] = useState("");
  const router = useRouter();
  // Declared before the catalogue query so returning to the tab reloads it
  // (loans and returns change what's on the shelf).
  const [tab, setTab] = useState("books");
  // Deep links from the librarian's dashboard: ?tab=loans&status=overdue.
  useEffect(() => {
    if (["loans", "reservations", "import"].includes(router.query.tab)) setTab(router.query.tab);
  }, [router.query.tab]);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const ready = family || school;
  const { data, loading, error, reload } = useApi(() => (ready ? api.library.books({ ...(school ? { school } : {}), search: search || undefined }) : Promise.resolve({ data: null })), [school, search, ready, tab === "books"]);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(null);
  const [delError, setDelError] = useState(null);
  const done = (m) => { setDialog(null); setNotice(m); reload(); };
  return (
    <Layout title="Library">
      <PageHeader title="Library" subtitle={manage ? "Catalogue, loans, fines, reservations and reminders." : family ? "Books in your school library. Reserve one that's out and you'll be told when it's ready." : "Books in your school library."} actions={manage && school && tab === "books" && <button className="btn btn-primary" onClick={() => setDialog({ kind: "book" })}>Add book</button>} />
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {!family && <div className="w-64"><SchoolSelect value={school} onChange={setSchool} /></div>}
        {manage && (
          <div className="tabs tabs-boxed bg-white border border-slate-200 flex-wrap" role="tablist">
            <button role="tab" aria-selected={tab === "books"} className={`tab ${tab === "books" ? "tab-active" : ""}`} onClick={() => setTab("books")}>Catalogue</button>
            <button role="tab" aria-selected={tab === "loans"} className={`tab ${tab === "loans" ? "tab-active" : ""}`} onClick={() => setTab("loans")}>Loans</button>
            <button role="tab" aria-selected={tab === "reservations"} className={`tab ${tab === "reservations" ? "tab-active" : ""}`} onClick={() => setTab("reservations")}>Reservations</button>
            <button role="tab" aria-selected={tab === "import"} className={`tab ${tab === "import" ? "tab-active" : ""}`} onClick={() => setTab("import")}>Import</button>
          </div>
        )}
      </div>
      {tab === "loans" && manage ? (school ? <Loans school={school} initialStatus={router.query.status} /> : null)
        : tab === "reservations" && manage ? (school ? <Reservations school={school} staff /> : null)
        : tab === "import" && manage ? (school ? <ImportBooks school={school} onDone={(m) => { setNotice(m); reload(); }} /> : null) : (
        <>
          {family && <Reservations staff={false} />}
          <form className="flex gap-2 mb-4 max-w-md" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}>
            <input className="input input-bordered input-sm flex-1 min-w-0" placeholder="Title, author, ISBN or category" aria-label="Search books" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn btn-sm">Search</button>
          </form>
          {loading || !data ? (ready ? <Loading /> : null) : error ? <ErrorState error={error} onRetry={reload} /> : data.length === 0 ? <Card><EmptyState title="No books found" message={search ? "Try another search." : "The catalogue is empty."} /></Card> : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.map((b) => (
                <Card key={b.id}>
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-slate-900 leading-snug">{b.title}</h2>
                      <p className="text-sm text-slate-500 truncate">{b.author || "Unknown author"}</p>
                    </div>
                    <span className={`badge badge-sm whitespace-nowrap ${b.available ? "badge-success" : "badge-ghost"}`}>{b.available}/{b.copies} in</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{[b.category, b.shelf && `Shelf ${b.shelf}`, b.isbn].filter(Boolean).join(" · ")}</p>
                  {(b.onHold > 0 || b.waiting > 0) && <p className="text-xs text-amber-700 mt-1">{[b.onHold && `${b.onHold} kept for reservations`, b.waiting && `${b.waiting} waiting`].filter(Boolean).join(" · ")}</p>}
                  {family && (
                    <div className="mt-3 flex justify-end">
                      {b.myReservation ? (
                        <span className={`badge ${b.myReservation.status === "ready" ? "badge-success" : "badge-ghost"}`}>{b.myReservation.status === "ready" ? `Ready to collect by ${formatDate(b.myReservation.readyUntil)}` : "Reserved · in the queue"}</span>
                      ) : b.available ? (
                        <span className="text-xs text-success">On the shelf: ask at the library desk</span>
                      ) : (
                        <button className="btn btn-sm btn-outline btn-primary" onClick={async () => { try { const r = await api.library.reserve(b.id); setNotice(r.message); reload(); } catch (err) { setNotice(err.message); } }}>Reserve</button>
                      )}
                    </div>
                  )}
                  {manage && (
                    <div className="flex gap-2 justify-end mt-3">
                      <button className="btn btn-sm btn-primary" disabled={b.copies - b.issued <= 0} onClick={() => setDialog({ kind: "lend", book: b })}>Lend</button>
                      <button className="btn btn-sm" onClick={() => setDialog({ kind: "book", book: b })}>Edit</button>
                      <button className="btn btn-sm btn-ghost text-error" onClick={() => { setDelError(null); setDialog({ kind: "delete", book: b }); }}>Remove</button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}
      {dialog?.kind === "book" && <BookDialog book={dialog.book} school={school} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === "lend" && <LendDialog book={dialog.book} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === "delete" && (
        <ConfirmDialog title={`Remove "${dialog.book.title}"?`} message="Its loan history is removed too. Books with copies out on loan can't be removed." confirmLabel="Remove" error={delError} onClose={() => setDialog(null)}
          onConfirm={async () => { try { const r = await api.library.removeBook(dialog.book.id); done(r.message); } catch (err) { setDelError(err); } }} />
      )}
    </Layout>
  );
}
