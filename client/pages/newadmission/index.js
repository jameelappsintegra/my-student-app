import { useState } from "react";
import Link from "next/link";
import DatePicker from "react-datepicker";
import Layout from "../../components/layout/layout";
import { Card, PageHeader } from "../../components/common";
import { api, ApiError } from "../../services/api";
import useSchools from "../../hooks/useSchools";
import AadhaarFill from "../../components/forms/AadhaarFill";
import {
  CLASSES,
  GENDERS,
  BLOOD_GROUPS,
  academicYearOptions,
} from "../../constants";

const emptyPerson = () => ({ name: "", phone: "", email: "", occupation: "" });

const initialForm = () => ({
  school: "",
  firstName: "",
  middleName: "",
  lastName: "",
  dateOfBirth: null,
  gender: "",
  bloodGroup: "",
  nationality: "Indian",
  address: "",
  previousSchool: "",
  classApplied: "",
  academicYear: academicYearOptions()[0],
  father: emptyPerson(),
  mother: emptyPerson(),
  guardian: { name: "", relation: "", phone: "", email: "" },
  emergencyContact: { name: "", relation: "", phone: "" },
});

// Local calendar date -> "YYYY-MM-DD" (toISOString would shift by timezone).
const toDateString = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const yearsAgo = (n) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d;
};

const PHONE_RE = /^\+?[0-9][0-9\s-]{6,18}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(f) {
  const e = {};
  if (!f.school) e.school = "Select a school";
  if (!f.firstName.trim()) e.firstName = "First name is required";
  if (!f.lastName.trim()) e.lastName = "Last name is required";
  if (!f.dateOfBirth) e.dateOfBirth = "Date of birth is required";
  if (!f.gender) e.gender = "Select a gender";
  if (!f.address.trim()) e.address = "Address is required";
  if (!f.classApplied) e.classApplied = "Select a class";

  ["father", "mother", "guardian", "emergencyContact"].forEach((p) => {
    const { phone, email } = f[p];
    if (phone && !PHONE_RE.test(phone.trim()))
      e[`${p}.phone`] = "Enter a valid phone number";
    if (email && !EMAIL_RE.test(email.trim()))
      e[`${p}.email`] = "Enter a valid email address";
  });
  if (!f.father.name.trim() && !f.mother.name.trim() && !f.guardian.name.trim())
    e["father.name"] = "Enter at least one parent or guardian name";
  if (
    !f.father.phone.trim() &&
    !f.mother.phone.trim() &&
    !f.guardian.phone.trim() &&
    !f.emergencyContact.phone.trim()
  )
    e["father.phone"] =
      e["father.phone"] ||
      "Enter at least one parent, guardian or emergency phone number";
  return e;
}

// The label is linked to the child control's id for screen readers.
function Field({ label, error, required, children, className = "" }) {
  const id = children.props.id;
  return (
    <div className={`form-control w-full ${className}`}>
      <label className="label" htmlFor={id}>
        <span className="label-text font-medium">
          {label}
          {required && <span className="text-error"> *</span>}
        </span>
      </label>
      {children}
      {error && (
        <span className="text-error text-xs mt-1" role="alert" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}

const NewAdmission = () => {
  const { schools } = useSchools();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(null);

  const set = (path, value) => {
    setForm((f) => {
      const [a, b] = path.split(".");
      return b ? { ...f, [a]: { ...f[a], [b]: value } } : { ...f, [a]: value };
    });
    setErrors((e) => {
      if (!e[path]) return e;
      const next = { ...e };
      delete next[path];
      return next;
    });
  };

  const input = (path, props = {}) => {
    const [a, b] = path.split(".");
    const value = b ? form[a][b] : form[a];
    return {
      id: path,
      name: path,
      value,
      onChange: (e) => set(path, e.target.value),
      "aria-invalid": errors[path] ? true : undefined,
      "aria-describedby": errors[path] ? `${path}-error` : undefined,
      className: `input input-bordered w-full ${
        errors[path] ? "input-error" : ""
      }`,
      ...props,
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const clientErrors = validate(form);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) {
      setSubmitError({ message: "Please fix the highlighted fields." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.admissions.create({
        ...form,
        dateOfBirth: toDateString(form.dateOfBirth),
        bloodGroup: form.bloodGroup || undefined,
      });
      setSubmitted(res.data);
      setForm(initialForm());
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Layout title="New Admission">
        <PageHeader title="New Admission" />
        <Card>
          <div className="alert alert-success mb-4" role="status">
            <span>
              Application <strong>{submitted.applicationNumber}</strong> for{" "}
              {submitted.firstName} {submitted.lastName} has been submitted.
            </span>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            It is now waiting for review. Once approved it can be enrolled from
            the Admissions page, which creates the student record and admission
            number.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admissions">
              <a className="btn btn-primary">View admissions</a>
            </Link>
            <button className="btn" onClick={() => setSubmitted(null)}>
              Start another application
            </button>
          </div>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title="New Admission">
      <PageHeader
        title="New Admission"
        subtitle="Register an application for a prospective student. Fields marked * are required."
      />

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {submitError && (
          <div className="alert alert-error" role="alert">
            <span>{submitError.message}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
          <AadhaarFill
            onFill={(d) => {
              setForm((f) => ({
                ...f,
                firstName: d.firstName || f.firstName,
                middleName: d.middleName || f.middleName,
                lastName: d.lastName || f.lastName,
                dateOfBirth: d.dateOfBirth ? new Date(`${d.dateOfBirth}T00:00:00`) : f.dateOfBirth,
                gender: d.gender || f.gender,
                address: d.address || f.address,
                father: d.father ? { ...f.father, name: d.father.name } : f.father,
                guardian: d.guardian ? { ...f.guardian, name: d.guardian.name } : f.guardian,
              }));
              setErrors({});
            }}
          />
          <span className="text-sm text-slate-500">Parents can share their child&apos;s Aadhaar offline e-KYC file to fill this in.</span>
        </div>

        <Card title="Student details">
          <div className="grid gap-x-4 md:grid-cols-3">
            <Field label="First name" required error={errors.firstName}>
              <input {...input("firstName")} autoComplete="off" />
            </Field>
            <Field label="Middle name" error={errors.middleName}>
              <input {...input("middleName")} autoComplete="off" />
            </Field>
            <Field label="Last name" required error={errors.lastName}>
              <input {...input("lastName")} autoComplete="off" />
            </Field>

            <Field label="Date of birth" required error={errors.dateOfBirth}>
              <DatePicker
                id="dateOfBirth"
                selected={form.dateOfBirth}
                onChange={(d) => set("dateOfBirth", d)}
                dateFormat="dd/MM/yyyy"
                placeholderText="DD/MM/YYYY"
                minDate={yearsAgo(25)}
                maxDate={yearsAgo(2)}
                showYearDropdown
                showMonthDropdown
                dropdownMode="select"
                className={`input input-bordered w-full ${
                  errors.dateOfBirth ? "input-error" : ""
                }`}
              />
            </Field>
            <Field label="Gender" required error={errors.gender}>
              <select
                {...input("gender")}
                className={`select select-bordered w-full ${
                  errors.gender ? "select-error" : ""
                }`}
              >
                <option value="">Select…</option>
                {GENDERS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Blood group" error={errors.bloodGroup}>
              <select
                {...input("bloodGroup")}
                className="select select-bordered w-full"
              >
                <option value="">Not known</option>
                {BLOOD_GROUPS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>

            <Field label="Nationality" error={errors.nationality}>
              <input {...input("nationality")} />
            </Field>
            <Field
              label="Previous school"
              error={errors.previousSchool}
              className="md:col-span-2"
            >
              <input {...input("previousSchool")} />
            </Field>

            <Field
              label="Address"
              required
              error={errors.address}
              className="md:col-span-3"
            >
              <textarea
                {...input("address")}
                rows={3}
                className={`textarea textarea-bordered w-full ${
                  errors.address ? "textarea-error" : ""
                }`}
              />
            </Field>
          </div>
        </Card>

        <Card title="School and class">
          <div className="grid gap-x-4 md:grid-cols-3">
            <Field label="School" required error={errors.school}>
              <select
                {...input("school")}
                className={`select select-bordered w-full ${errors.school ? "select-error" : ""}`}
              >
                <option value="">Select…</option>
                {schools.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Class applied for" required error={errors.classApplied}>
              <select
                {...input("classApplied")}
                className={`select select-bordered w-full ${
                  errors.classApplied ? "select-error" : ""
                }`}
              >
                <option value="">Select…</option>
                {CLASSES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Academic year" required error={errors.academicYear}>
              <select
                {...input("academicYear")}
                className="select select-bordered w-full"
              >
                {academicYearOptions().map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Parents and guardian">
          <p className="text-sm text-slate-500 -mt-2 mb-2">
            Give at least one parent or guardian name and one contact number.
          </p>
          {[
            ["father", "Father"],
            ["mother", "Mother"],
          ].map(([key, label]) => (
            <div key={key} className="grid gap-x-4 md:grid-cols-4 mb-4">
              <Field label={`${label}'s name`} error={errors[`${key}.name`]}>
                <input {...input(`${key}.name`)} />
              </Field>
              <Field label="Phone" error={errors[`${key}.phone`]}>
                <input {...input(`${key}.phone`, { type: "tel" })} />
              </Field>
              <Field label="Email" error={errors[`${key}.email`]}>
                <input {...input(`${key}.email`, { type: "email" })} />
              </Field>
              <Field label="Occupation" error={errors[`${key}.occupation`]}>
                <input {...input(`${key}.occupation`)} />
              </Field>
            </div>
          ))}
          <div className="grid gap-x-4 md:grid-cols-4">
            <Field label="Guardian's name" error={errors["guardian.name"]}>
              <input {...input("guardian.name")} />
            </Field>
            <Field label="Relation" error={errors["guardian.relation"]}>
              <input {...input("guardian.relation")} />
            </Field>
            <Field label="Phone" error={errors["guardian.phone"]}>
              <input {...input("guardian.phone", { type: "tel" })} />
            </Field>
            <Field label="Email" error={errors["guardian.email"]}>
              <input {...input("guardian.email", { type: "email" })} />
            </Field>
          </div>
        </Card>

        <Card title="Emergency contact">
          <div className="grid gap-x-4 md:grid-cols-3">
            <Field label="Name" error={errors["emergencyContact.name"]}>
              <input {...input("emergencyContact.name")} />
            </Field>
            <Field label="Relation" error={errors["emergencyContact.relation"]}>
              <input {...input("emergencyContact.relation")} />
            </Field>
            <Field label="Phone" error={errors["emergencyContact.phone"]}>
              <input {...input("emergencyContact.phone", { type: "tel" })} />
            </Field>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={submitting}
            onClick={() => {
              setForm(initialForm());
              setErrors({});
              setSubmitError(null);
            }}
          >
            Clear
          </button>
          <button
            type="submit"
            className={`btn btn-primary ${submitting ? "loading" : ""}`}
            disabled={submitting}
          >
            {submitting ? "Submitting…" : "Submit application"}
          </button>
        </div>
      </form>
    </Layout>
  );
};

export default NewAdmission;
