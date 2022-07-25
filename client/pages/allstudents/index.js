import { id } from "calendar-reactjs";
import dayjs from "dayjs";
import Link from "next/link";
import { useEffect, useState } from "react";
import Layout from "../../components/layout/layout";

const Allstudents = () => {
  useEffect;
  const [allStudent, setAllStudent] = useState([]);
  const getStudents = async () => {
    try {
      const resp = await fetch("http://localhost:5000/all-students");
      const respData = await resp.json();
      setAllStudent(respData);
    } catch (err) {
      console.log(err.message);
    }
  };
  const deleteStudent = async (id) => {
    try {
      const deleteUser = await fetch(`http://localhost:5000/student/${id}`, {
        method: "DELETE",
      });
      setAllStudent(allStudent.filter((user) => user.r_id !== id));
    } catch (err) {
      console.log(err.message);
    }
  };
  useEffect(() => {
    getStudents();
  }, []);

  return (
    <Layout>
      <h2 className="text-2xl">All Students</h2>
      <table className="table table-auto border-collapse border border-slate-500 w-full">
        <thead>
          <tr>
            <th className="border border-slate-600">Name</th>
            <th className="border border-slate-600">DOB</th>
            <th className="border border-slate-600">Father</th>
            <th className="border border-slate-600">Mother</th>
            <th className="border border-slate-600">Addmission</th>
            <th className="border border-slate-600" colSpan={2}>
              Option
            </th>
          </tr>
        </thead>
        <tbody>
          {allStudent.map((data, index) => (
            <tr key={data._id}>
              <td className="border border-slate-700">
                <Link href={"/allstudents/" + data._id}>
                  <a>{data.studentName}</a>
                </Link>
              </td>
              <td className="border border-slate-700">{data.dateOfBirth}</td>
              <td className="border border-slate-700">{data.fatherName}</td>
              <td className="border border-slate-700">{data.motherName}</td>
              <td className="border border-slate-700">
                {dayjs(data.admissionDate).format("DD/MM/YYYY")}
              </td>
              <td className="border border-slate-700">
                <div className="justify-around flex">
                  <button
                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded inline-flex items-center"
                    onClick={() => {
                      deleteStudent(data._id);
                    }}
                  >
                    Delete
                  </button>
                  <button className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded inline-flex items-center ml-5">
                    Edit
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  );
};

export default Allstudents;
