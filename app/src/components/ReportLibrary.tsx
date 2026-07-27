import { useState } from "react";
import { SavedReport, listReports, removeReport } from "../llm/reportLib";
import { houseDocFromMarkdown } from "../export/exporter";
import ReportView from "./ReportView";

// 报告库（#7）：列出一键排版存下的成品，点开即房子样式查看 / 导出。
export default function ReportLibrary() {
  const [items, setItems] = useState<SavedReport[]>(() => listReports());
  const [view, setView] = useState<{ title: string; doc: string } | null>(null);

  const open = (r: SavedReport) => {
    const doc = houseDocFromMarkdown(r.markdown, { title: r.title, badges: [r.focus, r.subject].filter(Boolean) });
    setView({ title: r.title, doc });
  };
  const del = (id: string) => { removeReport(id); setItems(listReports()); };

  return (
    <div className="dash">
      <div className="dash-head"><h2>报告库</h2></div>
      {items.length === 0 ? (
        <div className="set-hint" style={{ marginTop: 8 }}>还没有报告——在某个分析的「深度分析」里点「一键排版」即可把定稿排版存入这里。</div>
      ) : (
        <div className="rl-list">
          {items.map((r) => (
            <div key={r.id} className="rl-item">
              <button type="button" className="rl-open" onClick={() => open(r)}>
                <span className="rl-title">{r.title}</span>
                <span className="rl-meta">{r.focus} · {r.savedAt.slice(0, 16).replace("T", " ")}</span>
              </button>
              <button type="button" className="ql-del" onClick={() => del(r.id)}>删</button>
            </div>
          ))}
        </div>
      )}
      {view && <ReportView title={view.title} doc={view.doc} onClose={() => setView(null)} />}
    </div>
  );
}
