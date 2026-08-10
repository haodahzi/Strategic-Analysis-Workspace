import { RadarAxis, radarSvg } from "../export/radar";

// 工作台内的雷达图：复用导出报告同一套自绘 SVG，观感一致。
export default function Radar({ axes, title, size }: { axes: RadarAxis[]; title?: string; size?: number }) {
  return <div className="radar-wrap" dangerouslySetInnerHTML={{ __html: radarSvg(axes, { title, size }) }} />;
}
