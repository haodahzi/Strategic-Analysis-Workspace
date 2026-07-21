import { DIMENSIONS, PHASE_COLS, Project, CellState } from "../types";

const CELL_CLASS: Record<CellState, string> = {
  空: "c-empty", 假设: "c-hyp", 验证: "c-ver", 结论: "c-con",
};

export default function TwoAxisBoard({ project, onOpenReport }: { project: Project; onOpenReport: () => void }) {
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
        {project.hasIndustryReport && (
          <button type="button" className="app-btn" onClick={onOpenReport}>查看行业深度分析 →</button>
        )}
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
        <div className="ml-t">贯穿主线</div>
        <p>
          前提假设 <strong>{project.assumptions}</strong> 条，其中
          <span className="warn"> 能推翻这单 {project.dealBreakers} 条</span>
          → 转成洽谈问题清单里优先级最高的几条 → 洽谈后在合作备忘里逐条确认或推翻。
        </p>
      </div>
    </div>
  );
}
