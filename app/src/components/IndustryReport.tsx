import { useRef } from "react";
import sampleHtml from "../assets/suanli-sample.html?raw";
import { Analysis } from "../types";
import { exportReport } from "../export/exporter";

// 把参考样例的正文（.wrap 内容）抽出来，注入统一的 .report 渲染容器。
// 该样例即框架 §3 点名的《算力租赁·深度研究与项目评估》深度基准，
// 也是所有行业分析交付物的目标深度与导出模板。
// 生产环境由 LLM 产出同款组件库 HTML（带 class 白名单校验），此处用样例演示深度。
function extractWrap(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const w = doc.querySelector(".wrap");
    return w ? w.innerHTML : doc.body.innerHTML;
  } catch {
    return html;
  }
}
const REPORT_INNER = extractWrap(sampleHtml);

export default function IndustryReport({ project, onBack }: { project: Analysis; onBack: () => void }) {
  const reportRef = useRef<HTMLDivElement>(null);
  const title = `行业深度分析·${project.industry}`;
  return (
    <div className="report-view">
      <div className="report-bar">
        <button type="button" className="app-btn ghost" onClick={onBack}>← 返回工作区</button>
        <div className="report-bar-title">
          行业深度分析 · {project.industry}
          <span className="report-bar-tag">半耐用</span>
        </div>
        <div className="report-bar-actions">
          <button type="button" className="app-btn" onClick={() => exportReport(reportRef.current, title, "word")}>导出 Word</button>
          <button type="button" className="app-btn ghost" onClick={() => exportReport(reportRef.current, title, "pdf")}>导出 PDF</button>
          <button type="button" className="app-btn ghost" onClick={() => exportReport(reportRef.current, title, "html")}>导出 HTML</button>
        </div>
      </div>
      <div className="report" ref={reportRef}>
        <div className="wrap" dangerouslySetInnerHTML={{ __html: REPORT_INNER }} />
      </div>
    </div>
  );
}
