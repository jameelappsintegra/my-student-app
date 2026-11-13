import { useState } from "react";
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
import { CLASSES, STUDENT_STATUS, classLabel, formatDate } from "../../constants";

const Students = () => {
  const [page, setPage] = useState(1);
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const { data, pagination, loading, error, reload } = useApi(
    () =>
      api.students.list({
        page,
        limit: 20,
        className,
        section: section.trim(),
        search: query,
        sort: className ? "rollNumber" : "lastName",
      }),
    [page, className, section, query]
  );
  const filtered = Boolean(className || section || query);

  return (
    <Layout title="Students">
      <PageHeader
        title="Students"
        subtitle="Enrolled students, filterable by class and section."
      />
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
            placeholder="Search name or admission number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search students"
          />
          <select
            className="select select-bordered select-sm"
            value={className}
            onChange={(e) => {
              setPage(1);
              setClassName(e.target.value);
            }}
            aria-label="Filter by class"
          >
            <option value="">All classes</option>
            {CLASSES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            className="input input-bordered input-sm w-24"
            placeholder="Section"
            value={section}
            maxLength={5}
            onChange={(e) => {
              setPage(1);
              setSection(e.target.value.replace(/[^A-Za-z]/g, ""));
            }}
            aria-label="Filter by section"
          />
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
            title={filtered ? "No matching students" : "No students enrolled yet"}
            message={
              filtered
                ? "Try a different class, section or search."
                : "Students appear here once an approved admission is enrolled."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-compact w-full">
              <thead>
                <tr>
                  <th>Admission no.</th>
                  <th>Name</th>
                  <th>Class</th>
                  <th>Roll</th>
                  <th>Date of birth</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id}>
                    <td className="font-mono text-xs">{s.admissionNumber}</td>
                    <td>
                      {[s.firstName, s.middleName, s.lastName]
                        .filter(Boolean)
                        .join(" ")}
                    </td>
                    <td>
                      {classLabel(s.className)}
                      {s.section ? ` – ${s.section}` : ""}
                    </td>
                    <td>{s.rollNumber || "—"}</td>
                    <td>{formatDate(s.dateOfBirth)}</td>
                    <td>
                      <span
                        className={`badge badge-sm ${STUDENT_STATUS[s.status] || ""}`}
                      >
                        {s.status}
                      </span>
                    </td>
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
};

export default Students;
