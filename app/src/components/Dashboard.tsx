import { Analysis, STAGES, Stage } from "../types";
import { listReports } from "../llm/reportLib";

const STAGE_CLASS: Record<Stage, string> = {
  调研前: "st-pre", 洽谈中: "st-neg", 洽谈后: "st-post",
};

function StageProgress({ stage }: { stage: Stage }) {
  const idx = STAGES.indexOf(stage);
  return (
    <div className="stage-prog">
      {STAGES.map((s, i) => (
        <div key={s} className={"sp-step" + (i <= idx ? " done" : "") + (i === idx ? " cur" : "")}>
          <span className="sp-dot" />
          <span className="sp-label">{s}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ items, onOpen, onOpenReports }: { items: Analysis[]; onOpen: (id: string, report?: boolean) => void; onOpenReports?: () => void }) {
  const byStage = (s: Stage) => items.filter((p) => p.stage === s).length;
  const inProgress = items.filter((p) => p.deliverables.some((d) => d.status !== "完成")).length;
  const reports = listReports();

  return (
    <div className="dash">
      <div className="dash-head">
        <h2>研究分析总览</h2>
      </div>

      {/* KPI */}
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-n">{items.length}</div>
          <div className="kpi-l">在办分析</div>
          <div className="kpi-x">{inProgress} 个仍在推进</div>
        </div>
        <div className="kpi">
          <div className="kpi-stages">
            {STAGES.map((s) => (
              <div key={s} className="kpi-st">
                <span className={"st-chip " + STAGE_CLASS[s]}>{byStage(s)}</span>
                <span className="kpi-st-l">{s}</span>
              </div>
            ))}
          </div>
          <div className="kpi-l">阶段分布</div>
        </div>
        <div className="kpi">
          <div className="kpi-n">{reports.length}</div>
          <div className="kpi-l">报告库</div>
          <div className="kpi-x">已排版成品 · 可查看 / 导出 PDF</div>
        </div>
      </div>

      {/* 在办分析（每次分析＝对一个业务项目的评估） */}
      <div className="sec-head">在办分析 · 各处什么阶段</div>
      <div className="proj-list">
        {items.map((p) => (
          <div key={p.id} className="proj-card">
            <div className="proj-top">
              <div>
                <div className="proj-name">{p.name}</div>
                <div className="proj-meta">
                  <span className="role-badge">我方：{p.ourRole}</span>
                  <span className="ind-badge">{p.industry}</span>
                  <span className={"st-chip " + STAGE_CLASS[p.stage]}>{p.stage}</span>
                </div>
              </div>
              <div className="proj-updated">更新 {p.updatedAt}</div>
            </div>

            <StageProgress stage={p.stage} />

            <div className="proj-facts">
              <span>前提假设 <strong>{p.assumptions}</strong></span>
              <span>交付物 <strong>{p.deliverables.length}</strong></span>
            </div>

            <div className="deliv-chips">
              {p.deliverables.map((d, i) => (
                <span key={i} className={"deliv-chip " + (d.durability === "半耐用" ? "durable" : "consumable")}>
                  {d.kind}
                  <span className="deliv-st">{d.status}</span>
                </span>
              ))}
            </div>

            <div className="proj-actions">
              <button type="button" className="app-btn" onClick={() => onOpen(p.id, false)}>打开工作区</button>
              {p.hasIndustryReport && (
                <button type="button" className="app-btn ghost" onClick={() => onOpen(p.id, true)}>查看行业分析</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 报告库（一键排版成品） */}
      <div className="sec-head">
        报告库 · 已排版成品
        {onOpenReports && reports.length > 0 && (
          <button type="button" className="app-btn ghost" style={{ marginLeft: 12 }} onClick={onOpenReports}>全部 {reports.length} 篇 →</button>
        )}
      </div>
      {reports.length === 0 ? (
        <div className="set-hint">还没有报告——在某个分析的「深度分析」里生成定稿并点「一键排版」，即会存入报告库。</div>
      ) : (
        <div className="rl-list">
          {reports.slice(0, 6).map((r) => (
            <div key={r.id} className="rl-item">
              <button type="button" className="rl-open" onClick={onOpenReports}>
                <span className="rl-title">{r.title}</span>
                <span className="rl-meta">{r.focus} · {r.subject}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
