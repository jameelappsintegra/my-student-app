import dynamic from "next/dynamic";

// ECharts touches `window`, so render it on the client only. `label` is read
// by screen readers; pages also list the same numbers as text.
const ReactEcharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export default function Chart({ option, height = 240, label }) {
  return (
    <div role="img" aria-label={label}>
      <ReactEcharts option={option} style={{ height }} opts={{ renderer: "svg" }} />
    </div>
  );
}
