import { useState } from "react";
import { Analysis, QItem } from "../types";
import { loadConfig, providerById } from "../config/store";
import { makeClient } from "../llm/adapters";
import { getLlmFetch } from "../llm/runtime";
import { getRun, sendComplete } from "../llm/pipelineStore";
import { ProjectReportCtx, ProjectReportInput, buildProjectReportRequest, mockProjectReport } from "../llm/pipeline";
import { houseDocFromMarkdown } from "../export/exporter";
import { listReports, saveReport } from "../llm/reportLib";
import ReportView from "./ReportView";

// 洽谈后 · 项目状态精简为两档：继续推进（推向公司内部决策 · 深入探讨要不要做）/ 暂缓（因各种原因不再推进）。
type Verdict = "继续推进" | "暂缓";
const VERDICTS: Verdict[] = ["继续推进", "暂缓"];
const REASON_DEFAULT: Record<Verdict, string> = {
  继续推进: "前期了解已达成，建议推进公司内部决策、深入探讨要不要做。",
  暂缓: "因关键前提未确认 / 条件不成熟等原因，暂缓推进，待条件成熟再启动。",
};
const REPORT_FOCUS = "项目立项报告";

interface Judgment { stance: string; grounds: string[]; confidence: "高" | "中" | "低"; falsifiers: string[]; }
const emptyJudgment = (): Judgment => ({ stance: "", grounds: [""], confidence: "中", falsifiers: [""] });

// 洽谈清单 → 喂给报告的「洽谈记录」文本（问答 / 未决项，deal-breaker 标注）
function recordsText(qs: QItem[]): string {
  return qs.filter((q) => q.text.trim()).map((q) => {
    const mark = q.dealBreaker ? "[能翻单] " : "";
    const st = q.answered ? "已核" : "未决";
    const note = q.note?.trim() ? ` → ${q.note.trim()}` : "";
    return `- ${mark}[${q.intent}·${st}] ${q.text}${note}`;
  }).join("\n");
}

// 洽谈后·项目报告 = 定调（继续推进 / 暂缓）+ 可行性判断（可编辑#6）+ 交易框架（据实录入）+ 一键导出立项报告。
// 中性口径：不预设立场、不套用他单模板；内容由本单的研究与事实填。
export default function ProjectReport({ analysis }: { analysis: Analysis }) {
  const [j, setJ] = useState<Judgment>(emptyJudgment);
  const [verdict, setVerdict] = useState<Verdict>("继续推进");
  const [verdictReason, setVerdictReason] = useState(REASON_DEFAULT["继续推进"]);
  const [revInput, setRevInput] = useState("");
  const [revs, setRevs] = useState<{ at: string; note: string }[]>([]);
  const [tx, setTx] = useState("");
  const [gen, setGen] = useState<{ status: "idle" | "running" | "err"; msg?: string }>({ status: "idle" });
  const [houseView, setHouseView] = useState<{ title: string; doc: string } | null>(null);

  const cfg = loadConfig();
  const agent = cfg.agents["定稿"];
  const prov = providerById(cfg, agent.provider);
  const realMode = prov.id !== "mock";

  const editList = (key: "grounds" | "falsifiers", i: number, v: string) =>
    setJ((s) => ({ ...s, [key]: s[key].map((x, k) => (k === i ? v : x)) }));
  const addTo = (key: "grounds" | "falsifiers") => setJ((s) => ({ ...s, [key]: [...s[key], ""] }));
  const delFrom = (key: "grounds" | "falsifiers", i: number) => setJ((s) => ({ ...s, [key]: s[key].filter((_, k) => k !== i) }));

  const record = () => {
    if (!revInput.trim()) return;
    setRevs((r) => [...r, { at: new Date().toISOString().slice(0, 16).replace("T", " "), note: revInput.trim() }]);
    setRevInput("");
  };
  const clearCard = () => setJ(emptyJudgment());

  // 切定调：仅当理由为空或仍是另一档默认语时替换为该档默认，不覆盖用户自定义
  const pickVerdict = (v: Verdict) => {
    setVerdict(v);
    setVerdictReason((cur) => (!cur.trim() || (Object.values(REASON_DEFAULT) as string[]).includes(cur.trim()) ? REASON_DEFAULT[v] : cur));
  };

  const title = `${analysis.name} · 项目立项报告`;
  const badges = [REPORT_FOCUS, verdict, analysis.industry].filter(Boolean) as string[];

  // 一键导出：按框架生成立项报告 → 存入报告库 → 工作台内查看 / 打印 PDF / 导出 HTML。
  const exportReport = async () => {
    setGen({ status: "running", msg: realMode ? "正在生成项目立项报告…（走定稿模型，约 1 分钟，可稍候）" : "正在整理报告骨架…" });
    try {
      const run = getRun(analysis.id);
      const inp: ProjectReportInput = { name: analysis.name, industry: analysis.industry, counterparty: analysis.counterparty, ourRole: analysis.ourRole };
      const ctx: ProjectReportCtx = {
        deepReport: run.realReport ?? "", materials: run.materials, records: recordsText(run.questions),
        verdict, verdictReason, stance: j.stance, grounds: j.grounds, confidence: j.confidence, falsifiers: j.falsifiers, tx,
      };
      let md: string;
      if (realMode) {
        const fetchImpl = await getLlmFetch();
        md = await sendComplete(makeClient(prov, fetchImpl), buildProjectReportRequest(inp, ctx, agent.model), 5);
        if (!md.trim()) throw new Error("模型返回为空——可到「设置」为「定稿」换一款模型后重试");
      } else {
        md = mockProjectReport(inp, ctx);
      }
      // 文末附真实来源（与深度分析一致：上传 / 抓取在前，联网检索在后）
      const refs = [
        ...run.attachments.map((a) => (a.url ? `[${a.name}](${a.url})（上传 / 抓取）` : `${a.name}（上传材料）`)),
        ...run.sources.map((h) => `[${h.title || h.url}](${h.url})`),
      ];
      if (refs.length && !/(^|\n)#{1,6}\s*参考(资料|文献)/.test(md)) {
        md += "\n\n## 参考资料\n\n" + refs.map((r, i) => `${i + 1}. ${r}`).join("\n");
      }
      saveReport({ analysisId: analysis.id, title, subject: analysis.name, focus: REPORT_FOCUS, markdown: md });
      setHouseView({ title, doc: houseDocFromMarkdown(md, { title, badges }) });
      setGen({ status: "idle" });
    } catch (e) {
      setGen({ status: "err", msg: (e as Error).message.slice(0, 200) });
    }
  };

  const savedReport = listReports().find((r) => r.analysisId === analysis.id && r.focus === REPORT_FOCUS);
  const openSaved = () => {
    if (savedReport) setHouseView({ title: savedReport.title, doc: houseDocFromMarkdown(savedReport.markdown, { title: savedReport.title, badges }) });
  };

  return (
    <div className="pr-report">
      <div className="pr-top">
        <div>
          <h2>项目报告 · 定调</h2>
          <div className="set-hint">{analysis.name}{analysis.counterparty ? ` · 对方「${analysis.counterparty}」` : ""}</div>
        </div>
        <div className="pr-verdict-pick">
          {VERDICTS.map((v) => (
            <button key={v} type="button" className={"pr-vbtn wide v-" + v + (verdict === v ? " on" : "")} onClick={() => pickVerdict(v)}>{v}</button>
          ))}
        </div>
      </div>

      {/* 定调 */}
      <div className={"pr-verdict-banner v-" + verdict}>
        <div className="pr-vb-tag">定调 · {verdict === "继续推进" ? "推向公司内部决策 · 深入探讨要不要做" : "暂缓 · 各种原因不再推进"}</div>
        <textarea className="pr-vb-reason" value={verdictReason} onChange={(e) => setVerdictReason(e.target.value)} />
      </div>

      {/* 一键导出立项报告（继续推进 / 暂缓 都可导出） */}
      <div className="pr-export">
        <div className="pr-export-main">
          <button type="button" className="app-btn" disabled={gen.status === "running"} onClick={() => void exportReport()}>
            {gen.status === "running" ? "生成中…" : "一键导出项目报告 →"}
          </button>
          {savedReport && gen.status !== "running" && (
            <button type="button" className="app-btn ghost" onClick={openSaved}>查看上次导出</button>
          )}
        </div>
        <div className="set-hint">
          {gen.status === "err"
            ? <span className="pr-export-err">导出失败：{gen.msg}</span>
            : gen.status === "running"
              ? gen.msg
              : `按框架生成【项目基本情况 · 商业模式 · 经济效益 · 风险与控制措施 · 立项结论】，继续推进 / 暂缓都可导出；以「调研前 · 深度分析」为事实底稿。${realMode ? "" : "（当前无 Key，先出骨架；到「设置」为「定稿」配置真实模型后可生成完整报告）"}`}
        </div>
      </div>

      {/* 可行性判断（可编辑 #6） */}
      <div className="sec-head">可行性判断 · 可编辑（立场 / 依据 / 把握度 / falsifiers）</div>
      <div className="set-hint" style={{ marginBottom: 10 }}>据本单在「调研前 · 深度分析」得到的研究与你补充的事实填写；空白起步，不套用模板。一并写进导出的立项报告。</div>
      <div className="pr-card">
        <label className="pr-field"><span>立场 / 倾向</span>
          <input className="key-input wide" value={j.stance} placeholder="基于已知信息的客观判断…（信息不足就如实说明）" onChange={(e) => setJ((s) => ({ ...s, stance: e.target.value }))} />
        </label>

        <div className="pr-field"><span>依据</span>
          {j.grounds.map((g, i) => (
            <div key={i} className="pr-line">
              <input className="key-input wide" value={g} placeholder="一条有据可查的依据…" onChange={(e) => editList("grounds", i, e.target.value)} />
              <button type="button" className="ql-del" onClick={() => delFrom("grounds", i)}>删</button>
            </div>
          ))}
          <button type="button" className="pr-add" onClick={() => addTo("grounds")}>+ 加依据</button>
        </div>

        <label className="pr-field"><span>把握度</span>
          <select className="set-select" value={j.confidence} onChange={(e) => setJ((s) => ({ ...s, confidence: e.target.value as Judgment["confidence"] }))}>
            {["高", "中", "低"].map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </label>

        <div className="pr-field"><span>falsifiers · 哪条错了这结论就翻</span>
          {j.falsifiers.map((f, i) => (
            <div key={i} className="pr-line">
              <input className="key-input wide" value={f} placeholder="哪条前提被证伪，这个判断就要改…" onChange={(e) => editList("falsifiers", i, e.target.value)} />
              <button type="button" className="ql-del" onClick={() => delFrom("falsifiers", i)}>删</button>
            </div>
          ))}
          <button type="button" className="pr-add" onClick={() => addTo("falsifiers")}>+ 加 falsifier</button>
        </div>

        <div className="pr-reassess">
          <input className="key-input wide" value={revInput} placeholder="补充新信息 / 修改留痕（如：已拿到对方近三年审计报告）" onChange={(e) => setRevInput(e.target.value)} />
          <button type="button" className="app-btn" onClick={record}>记一条</button>
          <button type="button" className="app-btn ghost dark" onClick={clearCard}>清空重填</button>
        </div>
        {revs.length > 0 && (
          <div className="pr-revs">
            <div className="pr-revs-t">修改留痕</div>
            {revs.map((r, i) => (<div key={i} className="pr-rev">· <span className="pr-rev-at">{r.at}</span> {r.note}</div>))}
          </div>
        )}
      </div>

      {/* 交易框架：据实录入这单的资金 / 货物 / 合同 / 发票怎么走（不套模板、无则留空） */}
      <div className="sec-head">交易框架</div>
      <textarea className="nd-extra" value={tx} placeholder="据实录入这单的交易结构：各方出什么 / 拿什么、资金 / 货物 / 合同 / 发票怎么走…（洽谈后据实填，无则留空；会画进导出报告的交易结构链路图）" onChange={(e) => setTx(e.target.value)} />

      {houseView && <ReportView title={houseView.title} doc={houseView.doc} onClose={() => setHouseView(null)} />}
    </div>
  );
}
