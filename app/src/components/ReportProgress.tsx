import { useCallback, useState, useSyncExternalStore } from "react";
import { Analysis } from "../types";
import { loadConfig, providerById } from "../config/store";
import Markdown from "./Markdown";
import { PipelineInput, REPORT_PIPELINE } from "../llm/pipeline";
import { getRun, setMaterials, startRun, subscribe } from "../llm/pipelineStore";
import { houseDocFromMarkdown } from "../export/exporter";
import { saveReport } from "../llm/reportLib";
import ReportView from "./ReportView";
import { extractPdfText } from "../lib/pdf";

const ROLE_CLASS: Record<string, string> = {
  规划: "r-plan", 资料: "r-plan", 起草: "r-draft", 红队: "r-red", 定稿: "r-final", 验收: "r-check",
};

export default function ReportProgress({ analysis, onBack }: { analysis: Analysis; onBack?: () => void }) {
  const input: PipelineInput = {
    industry: analysis.industry, ourRole: analysis.ourRole, focus: analysis.focus ?? "行业深度分析",
    company: analysis.company, counterparty: analysis.counterparty,
  };
  const subjectLabel = analysis.company || analysis.industry || analysis.name;

  // 生成状态来自 store（后台运行、切页不丢），组件只订阅
  const sub = useCallback((cb: () => void) => subscribe(analysis.id, cb), [analysis.id]);
  const snap = useCallback(() => getRun(analysis.id), [analysis.id]);
  const run = useSyncExternalStore(sub, snap);
  const { started, running, done, status, outputs, report, realReport, err, materials } = run;

  const cfg = loadConfig();
  const draftProv = providerById(cfg, cfg.agents["起草"].provider);
  const realMode = draftProv.id !== "mock";
  const [pdfBusy, setPdfBusy] = useState("");
  const [houseView, setHouseView] = useState<{ title: string; doc: string } | null>(null);

  // 一键排版（#7）：把定稿 markdown 排成房子样式，存入报告库并在工作台内查看
  const openHouse = () => {
    const md = realReport ?? "";
    const title = `${subjectLabel} · ${input.focus}`;
    const doc = houseDocFromMarkdown(md, { title, badges: [input.focus, analysis.industry].filter(Boolean) as string[] });
    saveReport({ analysisId: analysis.id, title, subject: subjectLabel, focus: input.focus, markdown: md });
    setHouseView({ title, doc });
  };

  const appendMaterials = (text: string) => {
    if (!text) return;
    const cur = getRun(analysis.id).materials;
    setMaterials(analysis.id, cur ? cur + "\n\n" + text : text);
  };
  const onPickFile = async (f?: File) => {
    if (!f) return;
    if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
      setPdfBusy("解析 PDF…");
      try {
        const text = await extractPdfText(f, (p, t) => setPdfBusy(`解析 PDF… ${p}/${t} 页`));
        appendMaterials(text);
        setPdfBusy(text.trim() ? "" : "这份 PDF 没提取到文本（多为扫描件 / 图片，需 OCR，暂不支持）");
      } catch (e) { setPdfBusy("PDF 解析失败：" + (e as Error).message.slice(0, 120)); }
    } else {
      const r = new FileReader();
      r.onload = () => appendMaterials(String(r.result ?? ""));
      r.readAsText(f);
    }
  };

  const outMap = new Map(outputs.map((o) => [o.stageId, o.summary]));
  const doneCount = REPORT_PIPELINE.filter((s) => status[s.id] === "完成").length;

  return (
    <div className="report-view">
      <div className="report-bar">
        {onBack && <button type="button" className="app-btn ghost" onClick={onBack}>← 返回洽谈清单</button>}
        <div className="report-bar-title">
          深度分析 · {subjectLabel} · {input.focus}
          <span className="report-bar-tag">{!started ? "未生成" : done ? "待审初稿" : `进行中 ${doneCount}/${REPORT_PIPELINE.length}`}</span>
        </div>
        <div className="report-bar-actions">
          <span className="rb-meta">{realMode ? `真实 · 起草 ${draftProv.label} · 红队 ${providerById(cfg, cfg.agents["红队"].provider).label}` : "流水线演示 · Mock（无 Key）"}</span>
          {done && <button type="button" className="app-btn ghost" onClick={() => void startRun(analysis.id, input)}>重新生成</button>}
        </div>
      </div>

      <div className="dash">
        {!started && (
          <div className="pipe-empty">
            <div className="pipe-empty-h">深度分析尚未生成</div>
            <p>多智能体流水线（规划 → 资料 → 起草 → 红队 → 定稿 → 验收）逐步产出，<strong>后台运行、切换页面不中断</strong>。{realMode ? "各子任务走你配置的真实模型，红队换一款互查。" : "当前无真实 Key，仅演示流程、内容为示例；到设置为子任务配置真实模型后再生成本单真实分析。"}</p>
            <label className="fld" style={{ textAlign: "left", maxWidth: 560, margin: "0 auto 8px" }}>
              <span>本单资料（可选，喂给「资料 / 起草」：尽调稿 / 对方资料 / 已知数据）
                <label className="mn-upload" style={{ marginLeft: 8 }}>上传 PDF / 文本
                  <input type="file" accept=".pdf,.txt,.md,.csv,application/pdf,text/plain" onChange={(e) => { void onPickFile(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              </span>
              <textarea className="key-input wide" rows={4} value={materials} placeholder="粘贴本单已知材料，或上传尽调 PDF 自动提取…（越具体，分析越有据）" onChange={(e) => setMaterials(analysis.id, e.target.value)} />
            </label>
            {pdfBusy && <div className="set-hint" style={{ maxWidth: 560, margin: "0 auto 12px" }}>{pdfBusy}</div>}
            <button type="button" className="app-btn" onClick={() => void startRun(analysis.id, input)}>生成深度分析 →</button>
          </div>
        )}
        {started && <div className="sec-head">生成进度{running ? "（后台运行中，可切走）" : ""}</div>}
        {started && <ol className="pipe">
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
                  {outMap.has(s.id) && <div className="pipe-out"><Markdown text={outMap.get(s.id)!} /></div>}
                </div>
              </li>
            );
          })}
        </ol>}

        {err && <div className="pr-finding red" style={{ marginTop: 12 }}><div className="pr-finding-tag">出错 · 已停在该步</div><p>{err}</p></div>}
        {started && !done && !err && <div className="set-hint" style={{ marginTop: 10 }}>流水线运行中……（可切到别的页面，回来仍在）</div>}

        {/* 真实模型成品：定稿文本 */}
        {done && realReport !== null && (
          <div className="rp-realwrap">
            <div className="rp-realhead">
              <div className="pipe-done-tag">✓ 定稿 · 待审初稿（可推翻；到「洽谈后 · 项目报告」可行内编辑 / 驳回 / 重估）</div>
              <button type="button" className="app-btn" onClick={openHouse}>一键排版 · 房子样式查看（存入报告库）</button>
            </div>
            <div className="rp-realbody"><Markdown text={realReport} /></div>
          </div>
        )}

        {/* Mock 成品：结构化示例 */}
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
      {houseView && <ReportView title={houseView.title} doc={houseView.doc} onClose={() => setHouseView(null)} />}
    </div>
  );
}
