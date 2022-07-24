import Box from "../components/box/Box";
import ReactEcharts from "echarts-for-react";
import Layout from "../components/layout/layout";

export default function Home() {
  const academicResult = {
    xAxis: {
      type: "category",
      data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    },
    yAxis: {
      type: "value",
    },
    series: [
      {
        data: [120, 200, 150, 80, 70, 110, 130],
        type: "bar",
      },
    ],
  };

  return (
    <Layout>
      <h1 className="text-xl">Hi, Kevin William</h1>
      <h2 className="text-xs text-gray-500">
        Welcom back, nice to see you again!
      </h2>
      <Box classes={"rounded-lg p-4 shadow_none my-2 border-0"} shadowNone>
        <h4>Academic Result</h4>
        <ReactEcharts option={academicResult} />
      </Box>
    </Layout>
  );
}
