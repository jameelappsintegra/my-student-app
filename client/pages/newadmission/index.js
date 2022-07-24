import Layout from "../../components/layout/layout";
import Datepicker from "react-datepicker";
import { useEffect, useState } from "react";
import "react-datepicker/dist/react-datepicker.css";
import { useRouter } from "next/router";

// CSS Modules, react-datepicker-cssmodules.css
import "react-datepicker/dist/react-datepicker-cssmodules.css";

const Newadmisison = () => {
  const router = useRouter();

  const [dateofBirth, setDateofBirth] = useState(new Date());
  const [studentData, setStudentData] = useState({
    studentName: "",
    dateOfBirth: "",
    admissionDate: new Date(),
    fatherName: "",
    motherName: "",
    address: "",
    class: "",
    section: "",
    incharge: "",
  });
  const saveStudent = async (e) => {
    e.preventDefault();
    try {
      // console.log(studentData, dateofBirth);
      const body = studentData;
      // if (
      // studentData.studentName !== ""
      // // studentData.dateOfBirth !== "" &&
      // studentData.class !== "" &&
      // studentData.incharge !== "" &&
      // studentData.section !== "" &&
      // studentData.fatherName !== "" &&
      // studentData.motherName !== "" &&
      // studentData.address !== "" &&
      // studentData.admissionDate !== ""
      // ) {
      const resp = await fetch("http://localhost:4000/add-student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        router.push("/allstudents");
      }
    } catch (err) {
      console.log(err);
    }
  };
  return (
    <>
      <Layout>
        <h2 className="text-2xl">New Admission</h2>
        <h2 className="text-md">Student Details</h2>
        <div>
          <div className="my-4">
            <input
              type="text"
              placeholder="Full Name"
              className="input w-full max-w-xs"
              required
              value={studentData.studentName}
              onChange={(e) => {
                setStudentData({
                  ...studentData,
                  studentName: e.target.value,
                });
              }}
            />
          </div>
          <div className="my-4">
            <Datepicker
              selected={dateofBirth}
              showYearDropdown // year show and scrolldown alos
              scrollableYearDropdown
            />
          </div>
          <div className="my-4">
            <div className="form-control w-full max-w-xs">
              <label className="label">
                <span className="label-text">Select Class</span>
              </label>
            </div>
            <select
              className="select select-bordered"
              required
              selected={studentData.class}
              onChange={(e) => {
                setStudentData({ ...studentData, class: e.target.value });
              }}
            >
              <option>LKG</option>
              <option>UKG</option>
              <option>1</option>
              <option>2</option>
              <option>3</option>
              <option>4</option>
              <option>5</option>
              <option>6</option>
              <option>7</option>
              <option>8</option>
              <option>9</option>
              <option>10</option>
              <option>11</option>
              <option>12</option>
            </select>
          </div>
        </div>
        <div className="my-4">
          <input
            type="text"
            placeholder="Section"
            required
            value={studentData.section}
            className="input w-full max-w-xs"
            onChange={(e) => {
              setStudentData({ ...studentData, section: e.target.value });
            }}
          />
        </div>
        <div className="my-4">
          <input
            type="text"
            placeholder="Incharge"
            required
            value={studentData.incharge}
            className="input w-full max-w-xs"
            onChange={(e) => {
              setStudentData({ ...studentData, incharge: e.target.value });
            }}
          />
        </div>
        <div className="my-4">
          <input
            type="text"
            placeholder="Father Name"
            required
            value={studentData.fatherName}
            className="input w-full max-w-xs"
            onChange={(e) => {
              setStudentData({ ...studentData, fatherName: e.target.value });
            }}
          />
        </div>
        <div className="my-4">
          <input
            type="text"
            placeholder="Mother Name"
            required
            value={studentData.motherName}
            className="input w-full max-w-xs"
            onChange={(e) => {
              setStudentData({ ...studentData, motherName: e.target.value });
            }}
          />
        </div>
        <div className="my-4">
          <textarea
            placeholder="Student Address"
            required
            value={studentData.address}
            className="input w-full max-w-xs min-h-16"
            onChange={(e) => {
              setStudentData({ ...studentData, address: e.target.value });
            }}
          ></textarea>
        </div>
        <button className="btn btn-primary" onClick={saveStudent}>
          Save
        </button>
      </Layout>
    </>
  );
};

export default Newadmisison;
