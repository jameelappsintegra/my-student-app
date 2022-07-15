import Layout from "../../components/layout/layout";
import Calendar from "calendar-reactjs";

const Attendance = () => {
  return (
    <>
      <Layout>
        <h2 className="text-2xl">Attendance</h2>
        <Calendar
          onCellClick={(val) => console.log(val)}
          month={{
            date: "2021-05-13",
            days: [
              { date: "2021-05-01", status: "vacation" },
              { date: "2021-05-02", status: "vacation" },
              { date: "2021-05-03", status: "present" },
              { date: "2021-05-04", status: "present" },
              { date: "2021-05-05", status: "present" },
              { date: "2021-05-06", status: "present" },
              { date: "2021-05-07", status: "present" },
              { date: "2021-05-08", status: "vacation" },
              { date: "2021-05-09", status: "vacation" },
              { date: "2021-05-10", status: "present" },
              { date: "2021-05-11", status: "present" },
              { date: "2021-05-12", status: "present" },
              { date: "2021-05-13", status: "present" },
              { date: "2021-05-14", status: "present" },
              { date: "2021-05-15", status: "vacation" },
              { date: "2021-05-16", status: "vacation" },
              { date: "2021-05-17", status: "absent" },
              { date: "2021-05-18", status: "leave" },
              { date: "2021-05-19", status: "leave" },
              { date: "2021-05-20", status: "leave" },
              { date: "2021-05-21", status: "leave" },
              { date: "2021-05-22", status: "vacation" },
              { date: "2021-05-23", status: "vacation" },
              { date: "2021-05-24", status: "present" },
              { date: "2021-05-25", status: "present" },
              { date: "2021-05-26", status: "present" },
              { date: "2021-05-27", status: "present" },
              { date: "2021-05-28", status: "present" },
              { date: "2021-05-29", status: "vacation" },
              { date: "2021-05-30", status: "vacation" },
              { date: "2021-05-31", status: "present" },
            ],
          }}
          emptyCellStyle={{ backgroundColor: "white" }}
          status={{
            present: {
              labelStyle: {
                backgroundColor: "green",
                color: "black",
                borderRadius: "8px",
                padding: "0px 0px 3px 0px",
              },
            },
            absent: {
              labelStyle: {
                backgroundColor: "red",
                color: "black",
                borderRadius: "8px",
                padding: "0px 0px 3px 0px",
              },
            },
            vacation: {
              labelStyle: {
                backgroundColor: "yellow",
                color: "black",
                borderRadius: "8px",
                padding: "0px 0px 3px 0px",
              },
            },
            leave: {
              labelStyle: {
                backgroundColor: "orange",
                color: "black",
                borderRadius: "8px",
                padding: "0px 0px 3px 0px",
              },
            },
          }}
        />
      </Layout>
    </>
  );
};

export default Attendance;
