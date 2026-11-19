import { useState } from "react";
import { Card } from "../common";
import AadhaarFill from "./AadhaarFill";
import useSchools from "../../hooks/useSchools";
import { ApiError } from "../../services/api";
import { BLOOD_GROUPS, CLASSES, GENDERS, TRANSPORT, academicYearOptions } from "../../constants";

const PHONE_RE = /^\+?[0-9][0-9\s-]{6,18}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const person = () => ({ name: "", phone: "", email: "", occupation: "" });

export function blankStudent() {
  return {
    school: "",
    firstName: "",
    middleName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
    bloodGroup: "",
    nationality: "Indian",
    className: "",
    section: "",
    rollNumber: "",
    academicYear: academicYearOptions()[0],
    admissionDate: "",
    address: "",
    phone: "",
    email: "",
    transport: "",
    busRoute: "",
    previousSchool: "",
    medicalNotes: "",
    father: person(),
    mother: person(),
    guardian: { name: "", relation: "", phone: "", email: "" },
    emergencyContact: { name: "", relation: "", phone: "" },
  };
}

// Server record -> form values (empty strings for missing values).
export function fromStudent(s) {
  const f = blankStudent();
  for (const k of Object.keys(f)) {
    if (typeof f[k] === "object") f[k] = { ...f[k], ...Object.fromEntries(Object.entries(s[k] || {}).map(([a, b]) => [a, b ?? ""])) };
    else if (s[k] !== undefined && s[k] !== null) f[k] = String(s[k]);
  }
  f.school = s.school?.id || "";
  f.dateOfBirth = s.dateOfBirth ? s.dateOfBirth.slice(0, 10) : "";
  f.admissionDate = s.admissionDate ? s.admissionDate.slice(0, 10) : "";
  f.medicalNotes = "";
  return f;
}

function validate(f, isNew) {
  const e = {};
  if (isNew && !f.school) e.school = "Select a school";
  if (!f.firstName.trim()) e.firstName = "First name is required";
  if (!f.lastName.trim()) e.lastName = "Last name is required";
  if (!f.dateOfBirth) e.dateOfBirth = "Date of birth is required";
  if (!f.gender) e.gender = "Select a gender";
  if (!f.className) e.className = "Select a class";
  if (!f.address.trim()) e.address = "Address is required";
  if (f.section && !/^[A-Za-z]{1,5}$/.test(f.section)) e.section = "Section must be letters, e.g. A";
  if (f.rollNumber && !(Number.isInteger(Number(f.rollNumber)) && Number(f.rollNumber) >= 1)) e.rollNumber = "Roll number must be 1 or more";
  if (f.phone && !PHONE_RE.test(f.phone.trim())) e.phone = "Enter a valid phone number";
  if (f.email && !EMAIL_RE.test(f.email.trim())) e.email = "Enter a valid email address";
  for (const p of ["father", "mother", "guardian", "emergencyContact"]) {
    if (f[p].phone && !PHONE_RE.test(f[p].phone.trim())) e[`${p}.phone`] = "Enter a valid phone number";
    if (f[p].email && !EMAIL_RE.test(f[p].email.trim())) e[`${p}.email`] = "Enter a valid email address";
  }
  return e;
}

// Form values -> API body (strings trimmed; numbers converted; create-only
// fields dropped when editing).
function toBody(f, isNew) {
  const trim = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
  const body = trim({ ...f });
  for (const p of ["father", "mother", "guardian", "emergencyContact"]) body[p] = trim(f[p]);
  body.rollNumber = f.rollNumber === "" ? undefined : Number(f.rollNumber);
  if (!body.medicalNotes) delete body.medicalNotes;
  if (body.transport !== "school_bus") body.busRoute = "";
  if (!isNew) {
    delete body.school;
    delete body.admissionDate;
  }
  return body;
}

// Defined outside the form so inputs keep focus between renders.
function Field({ path, label, required, children, className = "", errors }) {
  return (
    <div className={`form-control w-full ${className}`}>
      <label className="label py-1" htmlFor={`s-${path.replace(".", "-")}`}>
        <span className="label-text font-medium">
          {label}
          {required && <span className="text-error"> *</span>}
        </span>
      </label>
      {children}
      {errors[path] && <span className="text-error text-xs mt-1" role="alert">{errors[path]}</span>}
    </div>
  );
}

export default function StudentForm({ initial, isNew, onSubmit, submitLabel, onAadhaarPhoto }) {
  const { schools } = useSchools();
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  const set = (path, value) => {
    const [a, b] = path.split(".");
    setF((s) => (b ? { ...s, [a]: { ...s[a], [b]: value } } : { ...s, [a]: value }));
    if (errors[path]) setErrors(({ [path]: _gone, ...rest }) => rest);
  };
  const val = (path) => {
    const [a, b] = path.split(".");
    return b ? f[a][b] : f[a];
  };
  const props = (path, extra = {}) => ({
    id: `s-${path.replace(".", "-")}`,
    value: val(path),
    onChange: (e) => set(path, e.target.value),
    "aria-invalid": errors[path] ? true : undefined,
    className: `input input-bordered w-full ${errors[path] ? "input-error" : ""}`,
    ...extra,
  });
  const select = (path, options, placeholder) => (
    <select {...props(path)} className={`select select-bordered w-full ${errors[path] ? "select-error" : ""}`}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    const errs = validate(f, isNew);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError({ message: "Please fix the highlighted fields." });
      return;
    }
    setBusy(true);
    try {
      await onSubmit(toBody(f, isNew));
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setFormError(err);
      setBusy(false);
    }
  };

  const fillFromAadhaar = (d) => {
    setF((s) => ({
      ...s,
      firstName: d.firstName || s.firstName,
      middleName: d.middleName || s.middleName,
      lastName: d.lastName || s.lastName,
      dateOfBirth: d.dateOfBirth || s.dateOfBirth,
      gender: d.gender || s.gender,
      address: d.address || s.address,
      father: d.father ? { ...s.father, name: d.father.name } : s.father,
      guardian: d.guardian ? { ...s.guardian, name: d.guardian.name } : s.guardian,
    }));
    setErrors({});
    if (d.photo) onAadhaarPhoto?.(d.photo);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {formError && <div className="alert alert-error" role="alert"><span>{formError.message}</span></div>}
      {isNew && (
        <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
          <AadhaarFill onFill={fillFromAadhaar} />
          <span className="text-sm text-slate-500">Save typing: read the name, date of birth, address and photo from the parent&apos;s Aadhaar offline e-KYC file.</span>
        </div>
      )}

      <Card title="School and class">
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          {isNew ? (
            <Field errors={errors} path="school" label="School" required>{select("school", schools.filter((s) => s.active).map((s) => [s.id, s.name]), "Select…")}</Field>
          ) : null}
          <Field errors={errors} path="className" label="Class" required>{select("className", CLASSES.map((c) => [c.code, c.label]), "Select…")}</Field>
          <Field errors={errors} path="section" label="Section"><input {...props("section", { maxLength: 5, autoCapitalize: "characters" })} /></Field>
          <Field errors={errors} path="rollNumber" label="Roll number"><input {...props("rollNumber", { type: "number", inputMode: "numeric", min: 1 })} /></Field>
          <Field errors={errors} path="academicYear" label="Academic year" required>{select("academicYear", academicYearOptions().map((y) => [y, y]))}</Field>
          {isNew && <Field errors={errors} path="admissionDate" label="Admission date"><input {...props("admissionDate", { type: "date" })} /></Field>}
        </div>
      </Card>

      <Card title="Personal details">
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field errors={errors} path="firstName" label="First name" required><input {...props("firstName", { autoComplete: "off" })} /></Field>
          <Field errors={errors} path="middleName" label="Middle name"><input {...props("middleName", { autoComplete: "off" })} /></Field>
          <Field errors={errors} path="lastName" label="Last name" required><input {...props("lastName", { autoComplete: "off" })} /></Field>
          <Field errors={errors} path="dateOfBirth" label="Date of birth" required><input {...props("dateOfBirth", { type: "date" })} /></Field>
          <Field errors={errors} path="gender" label="Gender" required>{select("gender", GENDERS.map((g) => [g.value, g.label]), "Select…")}</Field>
          <Field errors={errors} path="bloodGroup" label="Blood group">{select("bloodGroup", BLOOD_GROUPS.map((b) => [b, b]), "Not known")}</Field>
          <Field errors={errors} path="nationality" label="Nationality"><input {...props("nationality")} /></Field>
          <Field errors={errors} path="previousSchool" label="Previous school" className="lg:col-span-2"><input {...props("previousSchool")} /></Field>
        </div>
      </Card>

      <Card title="Address, contact and transport">
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field errors={errors} path="address" label="Home address" required className="sm:col-span-2 lg:col-span-3">
            <textarea {...props("address")} rows={2} className={`textarea textarea-bordered w-full ${errors.address ? "textarea-error" : ""}`} />
          </Field>
          <Field errors={errors} path="phone" label="Student phone"><input {...props("phone", { type: "tel", inputMode: "tel" })} /></Field>
          <Field errors={errors} path="email" label="Student email"><input {...props("email", { type: "email", inputMode: "email" })} /></Field>
          <Field errors={errors} path="transport" label="Transport">{select("transport", Object.entries(TRANSPORT), "Not recorded")}</Field>
          {f.transport === "school_bus" && <Field errors={errors} path="busRoute" label="Bus route"><input {...props("busRoute")} /></Field>}
        </div>
      </Card>

      <Card title="Parents and guardian">
        {[["father", "Father"], ["mother", "Mother"]].map(([k, label]) => (
          <div key={k} className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4 mb-3">
            <Field errors={errors} path={`${k}.name`} label={`${label}'s name`}><input {...props(`${k}.name`)} /></Field>
            <Field errors={errors} path={`${k}.phone`} label="Phone"><input {...props(`${k}.phone`, { type: "tel", inputMode: "tel" })} /></Field>
            <Field errors={errors} path={`${k}.email`} label="Email"><input {...props(`${k}.email`, { type: "email", inputMode: "email" })} /></Field>
            <Field errors={errors} path={`${k}.occupation`} label="Occupation"><input {...props(`${k}.occupation`)} /></Field>
          </div>
        ))}
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field errors={errors} path="guardian.name" label="Guardian's name"><input {...props("guardian.name")} /></Field>
          <Field errors={errors} path="guardian.relation" label="Relation"><input {...props("guardian.relation")} /></Field>
          <Field errors={errors} path="guardian.phone" label="Phone"><input {...props("guardian.phone", { type: "tel", inputMode: "tel" })} /></Field>
          <Field errors={errors} path="guardian.email" label="Email"><input {...props("guardian.email", { type: "email" })} /></Field>
        </div>
      </Card>

      <Card title="Emergency and medical">
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field errors={errors} path="emergencyContact.name" label="Emergency contact"><input {...props("emergencyContact.name")} /></Field>
          <Field errors={errors} path="emergencyContact.relation" label="Relation"><input {...props("emergencyContact.relation")} /></Field>
          <Field errors={errors} path="emergencyContact.phone" label="Phone"><input {...props("emergencyContact.phone", { type: "tel", inputMode: "tel" })} /></Field>
          <Field errors={errors} path="medicalNotes" label="Medical notes" className="sm:col-span-3">
            <textarea {...props("medicalNotes")} rows={2} className="textarea textarea-bordered w-full" placeholder={isNew ? "" : "Leave blank to keep the existing notes"} />
            <span className="text-xs text-slate-500 mt-1">Kept private: saved, but never shown again on screen.</span>
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-2 sticky bottom-20 lg:bottom-4 z-10">
        <button type="submit" className={`btn btn-primary shadow-md ${busy ? "loading" : ""}`} disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
