import { Card, Details } from "../common";
import { TRANSPORT, ageFrom, classLabel, formatDate } from "../../constants";

export default function OverviewTab({ s }) {
  const age = ageFrom(s.dateOfBirth);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Personal">
        <Details
          items={[
            ["Date of birth", `${formatDate(s.dateOfBirth)}${age !== null ? ` (${age} years)` : ""}`],
            ["Gender", s.gender && s.gender[0].toUpperCase() + s.gender.slice(1)],
            ["Blood group", s.bloodGroup],
            ["Nationality", s.nationality],
            ["Previous school", s.previousSchool],
          ]}
        />
      </Card>
      <Card title="School">
        <Details
          items={[
            ["School", s.school?.name],
            ["Admission number", s.admissionNumber],
            ["Class", `${classLabel(s.className)}${s.section ? ` – ${s.section}` : ""}`],
            ["Roll number", s.rollNumber],
            ["Academic year", s.academicYear],
            ["Admitted on", formatDate(s.admissionDate)],
          ]}
        />
      </Card>
      <Card title="Address and contact">
        <Details
          items={[
            ["Home address", s.address],
            ["Student phone", s.phone && <a className="link link-primary" href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a>],
            ["Student email", s.email && <a className="link link-primary" href={`mailto:${s.email}`}>{s.email}</a>],
          ]}
        />
      </Card>
      <Card title="Transport">
        <Details items={[["Mode", TRANSPORT[s.transport]], ["Bus route", s.busRoute]]} />
      </Card>
    </div>
  );
}
