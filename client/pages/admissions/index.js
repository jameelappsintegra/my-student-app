import { useState } from "react";
import Link from "next/link";
import Layout from "../../components/layout/layout";
import {
  Card,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Pagination,
} from "../../components/common";
import useApi from "../../hooks/useApi";
import { api } from "../../services/api";
import {
  ADMISSION_STATUS,
  NEXT_ACTIONS,
  classLabel,
  formatDate,
} from "../../constants";

const ACTION_LABEL = {
  submitted: "Submit",
  under_review: "Start review",
  documents_required: "Request documents",
  approved: "Approve",
  rejected: "Reject",
};

function StatusBadge({ status }) {
  const s = ADMISSION_STATUS[status] || { label: status, badge: "" };
  return <span className={`badge ${s.badge} whitespace-nowrap`}>{s.label}</span>;
}

// Dialog for a status change (with optional note) or for enrolment.
function ActionDialog({ admission, action, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [section, setSection] = useState("A");
  const [rollNumber, setRollNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const enrolling = action === "enroll";
  const destructive = action === "rejected";

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = enrolling
        ? await api.admissions.enroll(admission.id, {
            section: section || undefined,
            rollNumber: rollNumber || undefined,
          })
        : await api.admissions.setStatus(admission.id, action, note || undefined);
      onDone(res.message);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="modal modal-open" role="dialog" aria-modal="true">
      <div className="modal-box">
        <h3 className="font-semibold text-lg">
          {enrolling ? "Enrol student" : ACTION_LABEL[action]}:{" "}
          {admission.firstName} {admission.lastName}
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          {admission.applicationNumber} · {classLabel(admission.classApplied)} ·{" "}
          {admission.academicYear}
        </p>

        {error && (
          <div className="alert alert-error mt-4">
            <span>{error.message}</span>
          </div>
        )}

        {enrolling ? (
          <div className="grid grid-cols-2 gap-3 mt-4">
            <label className="form-control">
              <span className="label-text mb-1">Section</span>
              <input
                className="input input-bordered"
                value={section}
                maxLength={5}
                onChange={(e) => setSection(e.target.value)}
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Roll number (optional)</span>
              <input
                className="input input-bordered"
                type="number"
                min={1}
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
              />
            </label>
            <p className="col-span-2 text-sm text-slate-500">
              This creates the student record and assigns an admission number.
            </p>
          </div>
        ) : (
          <label className="form-control mt-4">
            <span className="label-text mb-1">Note (optional)</span>
            <textarea
              className="textarea textarea-bordered"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                destructive ? "Reason for rejection" : "Visible in the history"
              }
            />
          </label>
        )}

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className={`btn ${destructive ? "btn-error" : "btn-primary"} ${
              busy ? "loading" : ""
            }`}
            onClick={confirm}
            disabled={busy}
          >
            {enrolling ? "Enrol" : ACTION_LABEL[action]}
          </button>
        </div>
      </div>
    </div>
  );
}

const Admissions = () => {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(null);

  const { data, pagination, loading, error, reload } = useApi(
    () => api.admissions.list({ page, limit: 10, status, search: query }),
    [page, status, query]
  );

  const actionsFor = (a) => {
    const list = NEXT_ACTIONS[a.status].filter((s) => s !== "rejected");
    return {
      primary: list,
      canEnroll: a.status === "approved",
      canReject: NEXT_ACTIONS[a.status].includes("rejected"),
    };
  };

  return (
    <Layout title="Admissions">
      <PageHeader
        title="Admissions"
        subtitle="Review applications and enrol approved students."
        actions={
          <Link href="/newadmission">
            <a className="btn btn-primary">New admission</a>
          </Link>
        }
      />

      {notice && (
        <div className="alert alert-success mb-4" role="status">
          <span>{notice}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}

      <Card>
        <form
          className="flex flex-wrap gap-2 mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <input
            className="input input-bordered input-sm flex-1 min-w-[12rem]"
            placeholder="Search name or application number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search admissions"
          />
          <select
            className="select select-bordered select-sm"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {Object.entries(ADMISSION_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <button className="btn btn-sm" type="submit">
            Search
          </button>
        </form>

        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : data.length === 0 ? (
          <EmptyState
            title={query || status ? "No matching applications" : "No applications yet"}
            message={
              query || status
                ? "Try a different search or status filter."
                : "Applications submitted from New Admission will appear here."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-compact w-full">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Applicant</th>
                  <th>Class</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((a) => {
                  const { primary, canEnroll, canReject } = actionsFor(a);
                  return (
                    <tr key={a.id}>
                      <td className="font-mono text-xs">{a.applicationNumber}</td>
                      <td>
                        {a.firstName} {a.lastName}
                        <div className="text-xs text-slate-500">
                          Born {formatDate(a.dateOfBirth)}
                        </div>
                      </td>
                      <td>
                        {classLabel(a.classApplied)}
                        <div className="text-xs text-slate-500">{a.academicYear}</div>
                      </td>
                      <td>{formatDate(a.createdAt)}</td>
                      <td>
                        <StatusBadge status={a.status} />
                      </td>
                      <td>
                        <div className="flex justify-end gap-1 flex-wrap">
                          {primary.map((s) => (
                            <button
                              key={s}
                              className="btn btn-xs"
                              onClick={() => setDialog({ admission: a, action: s })}
                            >
                              {ACTION_LABEL[s]}
                            </button>
                          ))}
                          {canEnroll && (
                            <button
                              className="btn btn-xs btn-primary"
                              onClick={() =>
                                setDialog({ admission: a, action: "enroll" })
                              }
                            >
                              Enrol
                            </button>
                          )}
                          {canReject && (
                            <button
                              className="btn btn-xs btn-ghost text-error"
                              onClick={() =>
                                setDialog({ admission: a, action: "rejected" })
                              }
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination pagination={pagination} onPage={setPage} />
      </Card>

      {dialog && (
        <ActionDialog
          {...dialog}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setDialog(null);
            setNotice(message);
            reload();
          }}
        />
      )}
    </Layout>
  );
};

export default Admissions;
