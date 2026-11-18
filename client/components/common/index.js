import { useEffect } from "react";

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = "" }) {
  return (
    <section
      className={`bg-white rounded-xl border border-slate-200 p-5 ${className}`}
    >
      {title && (
        <h2 className="text-base font-semibold text-slate-800 mb-4">{title}</h2>
      )}
      {children}
    </section>
  );
}

export function Loading({ label = "Loading…" }) {
  return (
    <div
      className="flex items-center gap-3 py-10 justify-center text-slate-500"
      role="status"
    >
      <span className="h-5 w-5 rounded-full border-2 border-slate-300 border-t-primary animate-spin" />
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="alert alert-error" role="alert">
      <div className="flex-1">
        <span>{error?.message || "Something went wrong."}</span>
      </div>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="text-center py-12 px-4">
      <p className="font-medium text-slate-700">{title}</p>
      {message && (
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
          {message}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total } = pagination;
  return (
    <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
      <span>
        Page {page} of {totalPages} · {total} total
      </span>
      <div className="btn-group">
        <button
          className="btn btn-sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <button
          className="btn btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

const AVATAR_TONES = ["bg-indigo-100 text-indigo-700", "bg-sky-100 text-sky-700", "bg-teal-100 text-teal-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-violet-100 text-violet-700"];

// Student photo, or initials on a tone picked from the name when there is none.
export function Avatar({ student, size = "w-10 h-10", text = "text-sm" }) {
  const initials = `${student.firstName?.[0] || ""}${student.lastName?.[0] || ""}`.toUpperCase();
  if (student.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={student.photoUrl}
        alt={`Photo of ${student.firstName} ${student.lastName}`}
        className={`${size} rounded-full object-cover bg-slate-100 shrink-0`}
        loading="lazy"
      />
    );
  }
  const tone = AVATAR_TONES[(initials.charCodeAt(0) + (initials.charCodeAt(1) || 0)) % AVATAR_TONES.length];
  return (
    <span
      className={`${size} ${text} ${tone} rounded-full font-semibold inline-flex items-center justify-center shrink-0`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

// Accessible modal; on phones it slides up from the bottom like a sheet.
export function Dialog({ title, children, onClose, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal modal-open modal-bottom sm:modal-middle" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-box max-h-[90vh]">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
        {footer && <div className="modal-action flex-wrap">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "Delete", onConfirm, onClose, busy, error }) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={`btn btn-error ${busy ? "loading" : ""}`} onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
      {error && <div className="alert alert-error mt-3 py-2"><span>{error.message}</span></div>}
    </Dialog>
  );
}

export function Notice({ message, tone = "success", onDismiss }) {
  if (!message) return null;
  return (
    <div className={`alert alert-${tone} mb-4 py-2`} role="status">
      <span>{message}</span>
      {onDismiss && <button className="btn btn-ghost btn-sm" onClick={onDismiss}>Dismiss</button>}
    </div>
  );
}

// Label/value list used across the student profile.
export function Details({ items }) {
  const shown = items.filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!shown.length) return <p className="text-sm text-slate-500">Nothing recorded.</p>;
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {shown.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="text-sm text-slate-800 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
