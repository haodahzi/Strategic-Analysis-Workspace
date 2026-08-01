import { useState } from "react";
import { SavedReport, listReports, removeReport } from "../llm/reportLib";
import { houseDocFromMarkdown } from "../export/exporter";
import ReportView from "./ReportView";

// 报告库（#7）：列出一键排版 / 自动存入的成品，按类型分区（#6），点开即房子样式查看 / 导出。
const FILTERS = ["全部", "行业深度分析", "企业画像", "项目可行性"] as const;

export default function ReportLibrary() {
  const [items, setItems] = useState<SavedReport[]>(() => listReports());
  const [tab, setTab] = useState<(typeof FILTERS)[number]>("全部");
  const [view, setView] = useState<{ title: string; doc: string } | null>(null);

  const open = (r: SavedReport) => {
    const doc = houseDocFromMarkdown(r.markdown, { title: r.title, badges: [r.focus, r.subject].filter(Boolean) });
    setView({ title: r.title, doc });
  };
  const del = (id: string) => { removeReport(id); setItems(listReports()); };

  const count = (f: (typeof FILTERS)[number]) => (f === "全部" ? items.length : items.filter((r) => r.focus === f).length);
  const shown = tab === "全部" ? items : items.filter((r) => r.focus === tab);

  return (
    <div className="dash">
      <div className="dash-head"><h2>报告库</h2></div>
      {items.length === 0 ? (
        <div className="set-hint" style={{ marginTop: 8 }}>还没有报告——在某个分析的「深度分析」里生成定稿（或点「一键排版」）即会存入这里。</div>
      ) : (
        <>
          <div className="pw-tabs" style={{ marginBottom: 14 }}>
            {FILTERS.map((f) => (
              <button key={f} type="button" className={"pw-tab" + (tab === f ? " on" : "")} onClick={() => setTab(f)}>
                {f}<span className="rl-count">{count(f)}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <div className="set-hint">该类型下暂无报告。</div>
          ) : (
            <div className="rl-list">
              {shown.map((r) => (
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
        </>
      )}
      {view && <ReportView title={view.title} doc={view.doc} onClose={() => setView(null)} />}
    </div>
  );
}
