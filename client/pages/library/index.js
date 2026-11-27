import { useState } from "react";
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

function Loans({ school }) {
  const [status, setStatus] = useState("open");
  const { data, loading, error, reload } = useApi(() => api.library.issues({ school, status }), [school, status]);
  const [notice, setNotice] = useState(null);
  const act = async (fn) => { try { const r = await fn(); setNotice(r.message); reload(); } catch (err) { setNotice(err.message); } };
  return (
    <>
      <div className="tabs tabs-boxed bg-white border border-slate-200 inline-flex mb-3" role="tablist">
        {[["open", "On loan"], ["overdue", "Overdue"], ["fines", "Unpaid fines"], ["returned", "Returned"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={status === k} className={`tab ${status === k ? "tab-active" : ""}`} onClick={() => setStatus(k)}>{l}</button>
        ))}
      </div>
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      {loading && !data ? <Loading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.length === 0 ? <Card><EmptyState title="Nothing here" /></Card> : (
        <Card className="p-0 sm:p-0 overflow-x-auto">
          <table className="table w-full">
            <thead><tr><th>Book</th><th>Student</th><th>Due</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.map((x) => (
                <tr key={x.id}>
                  <td className="max-w-[14rem]"><p className="font-medium truncate">{x.book?.title}</p><p className="text-xs text-slate-400 truncate">{x.book?.author}</p></td>
                  <td>{x.student?.name}<p className="text-xs text-slate-400">{classLabel(x.student?.className)} {x.student?.section || ""}</p></td>
                  <td>{formatDate(x.dueAt)}</td>
                  <td>
                    {x.returnedAt ? <span className="badge badge-ghost badge-sm">Returned {formatDate(x.returnedAt)}</span> : x.overdue ? <span className="badge badge-error badge-sm">Overdue</span> : <span className="badge badge-info badge-sm">On loan</span>}
                    {x.fine > 0 && <p className="text-xs mt-1">Fine {x.fine} · {x.fineStatus}</p>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {!x.returnedAt && <button className="btn btn-xs btn-primary" onClick={() => act(() => api.library.returnBook(x.id))}>Return</button>}
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

export default function Library() {
  const { can, user } = useAuth();
  const manage = can("library.manage");
  const family = user?.role === "parent" || user?.role === "student";
  const [school, setSchool] = useState("");
  const [tab, setTab] = useState("books");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const ready = family || school;
  const { data, loading, error, reload } = useApi(() => (ready ? api.library.books({ ...(school ? { school } : {}), search: search || undefined }) : Promise.resolve({ data: null })), [school, search, ready]);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(null);
  const [delError, setDelError] = useState(null);
  const done = (m) => { setDialog(null); setNotice(m); reload(); };
  return (
    <Layout title="Library">
      <PageHeader title="Library" subtitle={manage ? "Catalogue, loans and late fines." : "Books in your school library."} actions={manage && school && tab === "books" && <button className="btn btn-primary" onClick={() => setDialog({ kind: "book" })}>Add book</button>} />
      <Notice message={notice} onDismiss={() => setNotice(null)} />
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {!family && <div className="w-64"><SchoolSelect value={school} onChange={setSchool} /></div>}
        {manage && (
          <div className="tabs tabs-boxed bg-white border border-slate-200" role="tablist">
            <button role="tab" aria-selected={tab === "books"} className={`tab ${tab === "books" ? "tab-active" : ""}`} onClick={() => setTab("books")}>Catalogue</button>
            <button role="tab" aria-selected={tab === "loans"} className={`tab ${tab === "loans" ? "tab-active" : ""}`} onClick={() => setTab("loans")}>Loans</button>
          </div>
        )}
      </div>
      {tab === "loans" && manage ? (school ? <Loans school={school} /> : null) : (
        <>
          <form className="flex gap-2 mb-4 max-w-md" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}>
            <input className="input input-bordered input-sm flex-1" placeholder="Title, author, ISBN or category" aria-label="Search books" value={q} onChange={(e) => setQ(e.target.value)} />
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
                  {manage && (
                    <div className="flex gap-2 justify-end mt-3">
                      <button className="btn btn-sm btn-primary" disabled={!b.available} onClick={() => setDialog({ kind: "lend", book: b })}>Lend</button>
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
