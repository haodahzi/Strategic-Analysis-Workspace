import { projects, kbIndustry, kbEnterprise } from "../data/seed";
import { STAGES, Stage } from "../types";

const STAGE_CLASS: Record<Stage, string> = {
  定框: "st-def", 调研前: "st-pre", 洽谈中: "st-neg", 洽谈后: "st-post",
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

export default function Dashboard({ onOpen }: { onOpen: (id: string, report?: boolean) => void }) {
  const byStage = (s: Stage) => projects.filter((p) => p.stage === s).length;
  const inProgress = projects.filter((p) => p.deliverables.some((d) => d.status !== "完成")).length;
  const kbCount = kbIndustry.length + kbEnterprise.length;
  const dealBreakers = projects.reduce((n, p) => n + p.dealBreakers, 0);

  return (
    <div className="dash">
      <div className="dash-head">
        <h2>项目总览</h2>
        <div className="dash-sub">总部职能部门 · 接洽前后可行性初评 · 决策建议权</div>
      </div>

      {/* KPI */}
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-n">{projects.length}</div>
          <div className="kpi-l">运行项目</div>
          <div className="kpi-x">{inProgress} 个尚有在办交付物</div>
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
          <div className="kpi-n">{kbCount}</div>
          <div className="kpi-l">交付物库 · 半耐用</div>
          <div className="kpi-x">行业分析 {kbIndustry.length} · 企业画像 {kbEnterprise.length}（可复用复利资产）</div>
        </div>
        <div className="kpi">
          <div className="kpi-n" style={{ color: "var(--red)" }}>{dealBreakers}</div>
          <div className="kpi-l">能推翻这单的前提</div>
          <div className="kpi-x">跨项目 deal-breaker 假设，洽谈优先验证</div>
        </div>
      </div>

      {/* 运行项目 */}
      <div className="sec-head">运行项目 · 各处什么阶段</div>
      <div className="proj-list">
        {projects.map((p) => (
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
              <span className="warn">能推翻这单 <strong>{p.dealBreakers}</strong></span>
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

      {/* 交付物库 */}
      <div className="sec-head">交付物库（知识库 · 半耐用 · 复利资产）</div>
      <div className="kb-grid">
        <div className="kb-col">
          <div className="kb-col-h">行业深度分析 · {kbIndustry.length}</div>
          {kbIndustry.map((k) => (
            <div key={k.id} className="kb-item">
              <span>{k.industry}<span className="kb-ver">v{k.version}</span></span>
              <span className="kb-up">{k.updatedAt}{k.hasSample ? " · 有样张" : ""}</span>
            </div>
          ))}
        </div>
        <div className="kb-col">
          <div className="kb-col-h">企业画像 · {kbEnterprise.length}</div>
          {kbEnterprise.map((k) => (
            <div key={k.id} className="kb-item">
              <span>{k.company}<span className="kb-ver">v{k.version}</span></span>
              <span className="kb-up">{k.updatedAt}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
