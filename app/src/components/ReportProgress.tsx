import { useEffect, useState } from "react";
import { Analysis } from "../types";
import { loadConfig, providerById } from "../config/store";
import {
  MockReport, PipelineInput, REPORT_PIPELINE, StageResult, mockReport, mockStageOutput,
} from "../llm/pipeline";

type Status = "待执行" | "进行中" | "完成";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const ROLE_CLASS: Record<string, string> = {
  规划: "r-plan", 起草: "r-draft", 红队: "r-red", 定稿: "r-final", 验收: "r-check",
};

export default function ReportProgress({ analysis, onBack }: { analysis: Analysis; onBack: () => void }) {
  const input: PipelineInput = { industry: analysis.industry, ourRole: analysis.ourRole, focus: analysis.focus ?? "行业深度分析" };
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [outputs, setOutputs] = useState<StageResult[]>([]);
  const [done, setDone] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [report, setReport] = useState<MockReport | null>(null);

  const cfg = loadConfig();
  const route = cfg.routing["行业深度分析"];
  const prov = providerById(cfg, route.provider);
  const isMock = prov.id === "mock";

  useEffect(() => {
    let cancelled = false;
    setStatus({}); setOutputs([]); setDone(false); setReport(null);
    (async () => {
      for (const s of REPORT_PIPELINE) {
        if (cancelled) return;
        setStatus((m) => ({ ...m, [s.id]: "进行中" }));
        await sleep(520);
        if (cancelled) return;
        setOutputs((o) => [...o, mockStageOutput(s, input)]);
        setStatus((m) => ({ ...m, [s.id]: "完成" }));
      }
      if (cancelled) return;
      setReport(mockReport(input));
      setDone(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  const outMap = new Map(outputs.map((o) => [o.stageId, o.summary]));
  const doneCount = REPORT_PIPELINE.filter((s) => status[s.id] === "完成").length;

  return (
    <div className="report-view">
      <div className="report-bar">
        <button type="button" className="app-btn ghost" onClick={onBack}>← 返回工作区</button>
        <div className="report-bar-title">
          多智能体生成 · {analysis.industry} · {input.focus}
          <span className="report-bar-tag">{done ? "待审初稿" : `进行中 ${doneCount}/${REPORT_PIPELINE.length}`}</span>
        </div>
        <div className="report-bar-actions">
          <span className="rb-meta">{isMock ? "流水线演示 · Mock（无 Key）" : `${prov.label} · ${route.model}`}</span>
          {done && <button type="button" className="app-btn ghost" onClick={() => setRunKey((k) => k + 1)}>重新演示</button>}
        </div>
      </div>

      <div className="dash">
        {/* 子任务进度面板 */}
        <div className="sec-head">生成进度 · 子任务（每一步都看得见，可掌控）</div>
        <ol className="pipe">
          {REPORT_PIPELINE.map((s, i) => {
            const st = status[s.id] ?? "待执行";
            return (
              <li key={s.id} className={"pipe-step " + (st === "进行中" ? "cur" : st === "完成" ? "ok" : "wait")}>
                <span className="pipe-ico">{st === "完成" ? "✓" : st === "进行中" ? "◐" : i + 1}</span>
                <div className="pipe-body">
                  <div className="pipe-h">
                    <span className={"pipe-role " + ROLE_CLASS[s.role]}>{s.role}</span>
                    <span className="pipe-title">{s.title}</span>
                    <span className="pipe-status">{st}</span>
                  </div>
                  <div className="pipe-detail">{s.detail}</div>
                  {outMap.has(s.id) && <div className="pipe-out">{outMap.get(s.id)}</div>}
                </div>
              </li>
            );
          })}
        </ol>

        {!done && <div className="set-hint" style={{ marginTop: 10 }}>多智能体流水线运行中……真实模型接入后，这里逐条显示各 agent 的真实思考与产物。</div>}

        {/* 成品：待审初稿 */}
        {done && report && (
          <div className="report" style={{ marginTop: 22 }}>
            <div className="wrap" style={{ padding: 0 }}>
              <div className="pipe-done-tag">✓ 流水线完成 · 以下为<strong>待审初稿</strong>（可推翻；下一步接入行内编辑/驳回/重估）</div>

              <h2 className="rp-title">{report.title}</h2>

              <div className="insight dark">
                <div className="insight-tag">决策主心骨</div>
                <p>{report.backbone}</p>
              </div>

              <div className="sec-t">行业分层（切开，而非罗列）</div>
              <div className="g3">
                {report.layers.map((l) => (
                  <div key={l.name} className="card">
                    <div className="card-tag">{l.name}</div>
                    <div className="card-body">{l.note}</div>
                  </div>
                ))}
              </div>

              <div className="sec-t">量化区间（每条带口径，可复核）</div>
              <table className="rp-table">
                <thead><tr><th>指标</th><th>区间</th><th>口径</th></tr></thead>
                <tbody>
                  {report.metrics.map((m) => (
                    <tr key={m.metric}><td>{m.metric}</td><td className="rp-range">{m.range}</td><td>{m.caliber}</td></tr>
                  ))}
                </tbody>
              </table>

              <div className="sec-t">命门风险（有名有姓 + 识别信号）</div>
              {report.risks.map((r, i) => (
                <div key={i} className={"anno " + (r.dealBreaker ? "red" : "gold")}>
                  <div className="anno-tag">{r.risk}{r.dealBreaker && " · 能推翻这单"}</div>
                  <p>识别信号：{r.signal}</p>
                </div>
              ))}

              <div className="sec-t">判断卡（初稿 · 四段齐全）</div>
              <div className="rp-verdict">
                <div className="rp-stance">立场：{report.judgment.stance}</div>
                <div className="rp-row"><span className="rp-k">依据</span>
                  <ul>{report.judgment.grounds.map((g, i) => (<li key={i}>{g}</li>))}</ul>
                </div>
                <div className="rp-row"><span className="rp-k">把握度</span>
                  <span className="rp-conf">{report.judgment.confidence}</span> · {report.judgment.confidenceReason}
                </div>
                <div className="rp-row"><span className="rp-k">falsifiers · 哪条错了这结论就翻</span>
                  <ul>{report.judgment.falsifiers.map((f, i) => (<li key={i}>{f}</li>))}</ul>
                </div>
              </div>

              <div className="sec-t">自检验收 · 6 条线</div>
              <ul className="rp-chk">
                {report.acceptance.map((a, i) => (<li key={i}><span className="rp-tick">✓</span>{a}</li>))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
