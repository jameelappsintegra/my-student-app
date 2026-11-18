import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../../components/layout/layout";
import { Avatar, Card, EmptyState, ErrorState, Loading, PageHeader, Pagination } from "../../components/common";
import Icon from "../../components/common/Icon";
import useApi from "../../hooks/useApi";
import useSchools from "../../hooks/useSchools";
import { api } from "../../services/api";
import { CLASSES, STUDENT_STATUS, classLabel, formatDate, fullName } from "../../constants";

const Students = () => {
  const { schools } = useSchools();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [school, setSchool] = useState("");
  useEffect(() => {
    if (typeof router.query.school === "string") setSchool(router.query.school);
  }, [router.query.school]);
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const { data, pagination, loading, error, reload } = useApi(
    () =>
      api.students.list({
        page,
        limit: 20,
        school,
        className,
        section: section.trim(),
        search: query,
        sort: className ? "rollNumber" : "lastName",
      }),
    [page, school, className, section, query]
  );
  const filtered = Boolean(school || className || section || query);
  const reset = (fn) => (e) => {
    setPage(1);
    fn(e.target.value);
  };

  return (
    <Layout title="Students">
      <PageHeader
        title="Students"
        subtitle="Every enrolled student across your schools."
        actions={
          <Link href="/students/new">
            <a className="btn btn-primary hidden sm:inline-flex">Add student</a>
          </Link>
        }
      />
      <Card>
        <form
          className="grid gap-2 grid-cols-2 sm:flex sm:flex-wrap mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <input
            className="input input-bordered input-sm col-span-2 sm:flex-1 sm:min-w-[12rem]"
            placeholder="Filter by name or admission number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Filter students"
          />
          <select className="select select-bordered select-sm col-span-2 sm:col-span-1" value={school} onChange={reset(setSchool)} aria-label="Filter by school">
            <option value="">All schools</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className="select select-bordered select-sm" value={className} onChange={reset(setClassName)} aria-label="Filter by class">
            <option value="">All classes</option>
            {CLASSES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
          <input
            className="input input-bordered input-sm sm:w-24"
            placeholder="Section"
            value={section}
            maxLength={5}
            onChange={(e) => {
              setPage(1);
              setSection(e.target.value.replace(/[^A-Za-z]/g, ""));
            }}
            aria-label="Filter by section"
          />
          <button className="btn btn-sm col-span-2 sm:col-span-1" type="submit">Search</button>
        </form>

        {loading && !data ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : data.length === 0 ? (
          <EmptyState
            title={filtered ? "No matching students" : "No students yet"}
            message={filtered ? "Try a different school, class, section or name." : "Add a student, or enrol an approved admission."}
            action={!filtered && <Link href="/students/new"><a className="btn btn-primary btn-sm">Add student</a></Link>}
          />
        ) : (
          <>
            {/* Phone: tappable cards */}
            <ul className="sm:hidden divide-y divide-slate-100 -mx-2">
              {data.map((s) => (
                <li key={s.id}>
                  <Link href={`/students/${s.id}`}>
                    <a className="flex items-center gap-3 px-2 py-3 active:bg-slate-50">
                      <Avatar student={s} size="w-11 h-11" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 truncate">{fullName(s)}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {classLabel(s.className)}
                          {s.section ? ` ${s.section}` : ""}
                          {s.rollNumber ? ` · Roll ${s.rollNumber}` : ""} · {s.school?.code}
                        </p>
                      </div>
                      <span className={`badge badge-sm ${STUDENT_STATUS[s.status] || ""}`}>{s.status}</span>
                    </a>
                  </Link>
                </li>
              ))}
            </ul>
            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="table table-compact w-full">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Admission no.</th>
                    <th>School</th>
                    <th>Class</th>
                    <th>Roll</th>
                    <th>Date of birth</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((s) => (
                    <tr key={s.id} className="hover">
                      <td>
                        <Link href={`/students/${s.id}`}>
                          <a className="flex items-center gap-3 font-medium text-slate-800 hover:text-primary">
                            <Avatar student={s} size="w-8 h-8" text="text-xs" />
                            {fullName(s)}
                          </a>
                        </Link>
                      </td>
                      <td className="font-mono text-xs">{s.admissionNumber}</td>
                      <td>{s.school?.name}</td>
                      <td>
                        {classLabel(s.className)}
                        {s.section ? ` – ${s.section}` : ""}
                      </td>
                      <td>{s.rollNumber || "—"}</td>
                      <td>{formatDate(s.dateOfBirth)}</td>
                      <td>
                        <span className={`badge badge-sm ${STUDENT_STATUS[s.status] || ""}`}>{s.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <Pagination pagination={pagination} onPage={setPage} />
      </Card>

      <Link href="/students/new">
        <a className="sm:hidden btn btn-primary btn-circle btn-lg fixed right-4 bottom-24 z-20 shadow-lg" aria-label="Add student">
          <Icon name="plus" className="w-6 h-6" />
        </a>
      </Link>
    </Layout>
  );
};

export default Students;
