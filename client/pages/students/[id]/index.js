import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../../components/layout/layout";
import { ErrorState, Loading, Notice } from "../../../components/common";
import ProfileHeader from "../../../components/student/ProfileHeader";
import OverviewTab from "../../../components/student/OverviewTab";
import ParentsTab from "../../../components/student/ParentsTab";
import AcademicsTab from "../../../components/student/AcademicsTab";
import AttendanceTab from "../../../components/student/AttendanceTab";
import FeesTab from "../../../components/student/FeesTab";
import ServicesTab from "../../../components/student/ServicesTab";
import useApi from "../../../hooks/useApi";
import { api } from "../../../services/api";
import { fullName } from "../../../constants";
import { useAuth } from "../../../context/auth";

const TABS = [
  ["overview", "Overview"],
  ["academics", "Academics"],
  ["attendance", "Attendance"],
  ["parents", "Parents"],
  ["fees", "Fees"],
  ["services", "Bus & library"],
];

// The student and its record summaries (fees only for roles that see them).
const TAB_SCOPE = { academics: "academic", attendance: "attendance", parents: "personal", fees: "fees" };

// A record type the viewer can't see (403, e.g. a limited share) is null.
const orNull = (p) => p.catch((err) => (err.status === 403 ? { data: null } : Promise.reject(err)));

async function loadAll(id, withFees) {
  const student = await api.students.get(id);
  const scopes = student.data.sharedAccess?.scopes;
  const allow = (s) => !scopes || scopes.includes(s);
  const [attendance, results, fees] = await Promise.all([
    allow("attendance") ? orNull(api.students.attendance(id)) : { data: null },
    allow("academic") ? orNull(api.students.results(id)) : { data: null },
    (scopes ? scopes.includes("fees") : withFees) ? orNull(api.students.fees(id)) : { data: null },
  ]);
  return { data: { student: student.data, attendance: attendance.data, results: results.data, fees: fees.data } };
}

export default function StudentProfile() {
  const router = useRouter();
  const { can } = useAuth();
  const { id, tab: tabParam, added, saved } = router.query;
  const { data, loading, error, reload } = useApi(() => (id ? loadAll(id, can("fees.view")) : new Promise(() => {})), [id]);
  // Under a cross-school share, only the approved kinds of record show.
  const shared = data?.student?.sharedAccess;
  const tabs = TABS.filter(([k]) => {
    if (shared) return k === "overview" || (TAB_SCOPE[k] && shared.scopes.includes(TAB_SCOPE[k]));
    return k !== "fees" || can("fees.view");
  });
  const tab = tabs.some(([k]) => k === tabParam) ? tabParam : "overview";
  const [student, setStudent] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (data) setStudent(data.student);
  }, [data]);
  useEffect(() => {
    if (added) setNotice("Student added.");
    else if (saved) setNotice("Changes saved.");
  }, [added, saved]);

  const changed = (msg) => {
    setNotice(msg);
    reload();
  };
  const selectTab = (k) =>
    router.replace({ pathname: router.pathname, query: { id, ...(k === "overview" ? {} : { tab: k }) } }, undefined, { shallow: true, scroll: false });

  const s = student || data?.student;
  return (
    <Layout title={s ? fullName(s) : "Student"} back>
      {loading && !data ? (
        <Loading label="Loading student…" />
      ) : error ? (
        <ErrorState error={error.status === 404 ? { message: "This student doesn't exist or has been deleted." } : error} onRetry={reload} />
      ) : (
        <div className="space-y-4">
          <Notice message={notice} onDismiss={() => setNotice(null)} />
          {shared && (
            <div className="alert alert-info py-2" role="status">
              <span>Shared with you by {s.school?.name}, read-only, until {new Date(shared.expiresAt).toLocaleDateString()}. Includes: {shared.scopes.join(", ")}.</span>
            </div>
          )}
          <ProfileHeader
            key={s.id}
            student={s}
            attendance={data.attendance}
            results={data.results}
            fees={data.fees}
            onChange={(updated, msg) => {
              setStudent(updated);
              setNotice(msg);
            }}
            onDeleted={() => router.replace("/students")}
          />
          <div>
            <div className="tabs tabs-boxed bg-white border border-slate-200 flex flex-wrap gap-1 sm:inline-flex" role="tablist" aria-label="Student details">
              {tabs.map(([k, label]) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  className={`tab whitespace-nowrap ${tab === k ? "tab-active" : ""}`}
                  onClick={() => selectTab(k)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div role="tabpanel" aria-label={tabs.find(([k]) => k === tab)[1]}>
            {tab === "overview" && <OverviewTab s={s} />}
            {tab === "academics" && data.results && <AcademicsTab studentId={s.id} results={data.results} onChanged={changed} canEdit={!shared && can("results.manage")} />}
            {tab === "attendance" && data.attendance && <AttendanceTab studentId={s.id} yearSummary={data.attendance} onChanged={changed} canEdit={!shared && can("attendance.mark")} />}
            {tab === "parents" && <ParentsTab s={s} />}
            {tab === "services" && <ServicesTab studentId={s.id} />}
            {tab === "fees" && data.fees && <FeesTab studentId={s.id} fees={data.fees} onChanged={changed} canEdit={!shared && can("fees.manage")} />}
          </div>
        </div>
      )}
    </Layout>
  );
}
