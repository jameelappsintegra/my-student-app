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
import useApi from "../../../hooks/useApi";
import { api } from "../../../services/api";
import { fullName } from "../../../constants";

const TABS = [
  ["overview", "Overview"],
  ["academics", "Academics"],
  ["attendance", "Attendance"],
  ["parents", "Parents"],
  ["fees", "Fees"],
];

// One request for the student and its three record summaries.
async function loadAll(id) {
  const [student, attendance, results, fees] = await Promise.all([
    api.students.get(id),
    api.students.attendance(id),
    api.students.results(id),
    api.students.fees(id),
  ]);
  return { data: { student: student.data, attendance: attendance.data, results: results.data, fees: fees.data } };
}

export default function StudentProfile() {
  const router = useRouter();
  const { id, tab: tabParam, added, saved } = router.query;
  const tab = TABS.some(([k]) => k === tabParam) ? tabParam : "overview";
  const { data, loading, error, reload } = useApi(() => (id ? loadAll(id) : new Promise(() => {})), [id]);
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
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="tabs tabs-boxed bg-white border border-slate-200 inline-flex flex-nowrap" role="tablist" aria-label="Student details">
              {TABS.map(([k, label]) => (
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
          <div role="tabpanel" aria-label={TABS.find(([k]) => k === tab)[1]}>
            {tab === "overview" && <OverviewTab s={s} />}
            {tab === "academics" && <AcademicsTab studentId={s.id} results={data.results} onChanged={changed} />}
            {tab === "attendance" && <AttendanceTab studentId={s.id} yearSummary={data.attendance} onChanged={changed} />}
            {tab === "parents" && <ParentsTab s={s} />}
            {tab === "fees" && <FeesTab studentId={s.id} fees={data.fees} onChanged={changed} />}
          </div>
        </div>
      )}
    </Layout>
  );
}
