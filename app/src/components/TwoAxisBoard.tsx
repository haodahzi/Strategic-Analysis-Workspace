import { DIMENSIONS, PHASE_COLS, Analysis, CellState } from "../types";

const CELL_CLASS: Record<CellState, string> = {
  空: "c-empty", 假设: "c-hyp", 验证: "c-ver", 结论: "c-con",
};

export default function TwoAxisBoard(
  { project, onOpenReport, onOpenTx, onOpenStep0, onOpenPipeline }:
  { project: Analysis; onOpenReport: () => void; onOpenTx: () => void; onOpenStep0: () => void; onOpenPipeline: () => void },
) {
  return (
    <div className="board">
      <div className="board-head">
        <div>
          <h2>{project.name}</h2>
          <div className="board-meta">
            <span className="role-badge">我方：{project.ourRole}</span>
            <span className="ind-badge">{project.industry}</span>
            <span className="st-chip st-cur">当前阶段：{project.stage}</span>
          </div>
        </div>
        <div className="board-actions">
          <button type="button" className="app-btn" onClick={onOpenStep0}>Step 0 定框 · 生成 →</button>
          <button type="button" className="app-btn" onClick={onOpenPipeline}>推进 · 多智能体生成分析 →</button>
          {project.hasIndustryReport && (
            <button type="button" className="app-btn ghost dark" onClick={onOpenReport}>查看行业深度分析 →</button>
          )}
          <button type="button" className="app-btn ghost dark" onClick={onOpenTx}>交易结构 · 合规探测 →</button>
        </div>
      </div>

      <div className="board-note">
        <strong>定框</strong>已确认我方角色为「{project.ourRole}」，并据此为各维度排权重。
        下表：<strong>纵轴 = 评估维度，横轴 = 时间阶段</strong>；同一维度随阶段推进：假设 → 验证 → 结论。
      </div>

      <div className="tw">
        <table className="matrix">
          <thead>
            <tr>
              <th className="mx-dim">评估维度 ＼ 阶段</th>
              {PHASE_COLS.map((c) => (<th key={c}>{c}</th>))}
            </tr>
          </thead>
          <tbody>
            {DIMENSIONS.map((d) => (
              <tr key={d}>
                <td className="mx-dim">{d}</td>
                {PHASE_COLS.map((c) => {
                  const s = project.matrix[d][c];
                  return (
                    <td key={c} className="mx-cell">
                      <span className={"cell " + CELL_CLASS[s]}>{s === "空" ? "—" : s}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend">
        <span><i className="cell c-hyp">假设</i> 调研前立起</span>
        <span><i className="cell c-ver">验证</i> 洽谈中带着问题去核</span>
        <span><i className="cell c-con">结论</i> 洽谈后确认/推翻</span>
      </div>

      <div className="board-mainline">
        <div className="ml-t">贯穿主线 · 这单成立所依赖的前提假设</div>
        {project.premises && project.premises.length > 0 ? (
          <>
            <ul className="premise-list">
              {project.premises.map((pr, i) => (
                <li key={i} className={"premise" + (pr.dealBreaker ? " db" : "")}>
                  <span className="premise-dim">{pr.dimension}</span>
                  <span className="premise-text">{pr.text}</span>
                  {pr.dealBreaker && <span className="premise-badge">能推翻这单</span>}
                  {pr.status && <span className="premise-st">{pr.status}</span>}
                </li>
              ))}
            </ul>
            <p className="ml-foot">
              共 <strong>{project.premises.length}</strong> 条前提，其中
              <span className="warn"> {project.premises.filter((p) => p.dealBreaker).length} 条能推翻这单</span>。
              读法：<strong>调研前</strong>立起这些假设（矩阵该维度＝「假设」）→ <strong>洽谈中</strong>带着它们逐条去问 / 去核（＝「验证」）→ <strong>洽谈后</strong>确认或推翻（＝「结论」）。deal-breaker 自动排进洽谈问题清单最前。
            </p>
          </>
        ) : (
          <p>本单尚在定框，前提假设待「调研前」阶段立起（行业深度分析 / 企业画像产出）。</p>
        )}
      </div>
    </div>
  );
}
