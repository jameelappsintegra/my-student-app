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
