import { STAGES, Stage } from "../types";

const STAGE_DESC: Record<Stage, string> = {
  调研前: "深度分析 + 洽谈清单",
  洽谈中: "带问题去核 · 记录录入",
  洽谈后: "项目报告 · 交易框架 · 定调",
};

// 项目工作区主轴：定框 → 调研前 → 洽谈中 → 洽谈后。点任一段跳转。
export default function PhaseRail({ current, onPick }: { current: Stage; onPick: (s: Stage) => void }) {
  const idx = STAGES.indexOf(current);
  return (
    <div className="phase-rail">
      {STAGES.map((s, i) => (
        <button
          key={s}
          type="button"
          className={"phase-step" + (i === idx ? " cur" : "") + (i < idx ? " done" : "")}
          onClick={() => onPick(s)}
        >
          <span className="phase-n">{i < idx ? "✓" : i + 1}</span>
          <span className="phase-txt">
            <span className="phase-l">{s}</span>
            <span className="phase-d">{STAGE_DESC[s]}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
