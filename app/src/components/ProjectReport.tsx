import { useCallback, useState, useSyncExternalStore } from "react";
import { Analysis, QItem } from "../types";
import {
  Evaluation, EvalVerdict, ExpenseKey, ExpenseRow, Merchant,
  FIT_TYPES, FIT_SCORE, CREDIT_DIMS, CREDIT_HINT, EXPENSE_KEYS, EXPENSE_LABEL, RISK_KINDS,
  emptyMerchant, strategyScore, commercialScore, merchantScore, creditScore, creditRedLines,
  computeEconomics, economicsScore, riskScore, radarAxes, compositeScore, financeCost,
} from "../domain/evaluation";
import Radar from "./Radar";
import { openExternal } from "../sources/browser";
import { loadConfig, providerById } from "../config/store";
import { makeClient } from "../llm/adapters";
import { getLlmFetch } from "../llm/runtime";
import { getRun, sendComplete, setEvaluation, subscribe } from "../llm/pipelineStore";
import { ProjectReportCtx, ProjectReportInput, buildProjectReportRequest, mockProjectReport } from "../llm/pipeline";
import { houseDocFromMarkdown } from "../export/exporter";
import { listReports, saveReport } from "../llm/reportLib";
import ReportView from "./ReportView";

const TABS: { key: string; label: string }[] = [
  { key: "overview", label: "项目情况" },
  { key: "strategy", label: "战略契合度" },
  { key: "commercial", label: "商业可行性" },
  { key: "credit", label: "客商资信" },
  { key: "economics", label: "经济效益" },
  { key: "risk", label: "风险可控性" },
];
const REPORT_FOCUS = "项目立项报告";
const REASON_DEFAULT: Record<EvalVerdict, string> = {
  继续推进: "前期了解已达成，建议推进公司内部决策、深入探讨要不要做。",
  暂缓: "因关键前提未确认 / 条件不成熟等原因，暂缓推进，待条件成熟再启动。",
};
const toNum = (s: string) => { const v = parseFloat(s); return isNaN(v) ? 0 : v; };
const n1 = (x: number) => (Math.round(x * 10) / 10).toString();

function recordsText(qs: QItem[]): string {
  return qs.filter((q) => q.text.trim()).map((q) => {
    const st = q.answered ? "已核" : "未决";
    return `- ${q.dealBreaker ? "[能翻单] " : ""}[${q.intent}·${st}] ${q.text}${q.note?.trim() ? ` → ${q.note.trim()}` : ""}`;
  }).join("\n");
}

function Slider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="ev-slider">
      <input type="range" min={0} max={10} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="ev-slider-v">{value}</span>
    </div>
  );
}

// 洽谈后·六维评价工作区：项目情况(五维雷达+定调) / 战略契合度 / 商业可行性 / 客商资信 / 经济效益 / 风险可控性。
export default function ProjectReport({ analysis }: { analysis: Analysis }) {
  const run = useSyncExternalStore(
    useCallback((cb: () => void) => subscribe(analysis.id, cb), [analysis.id]),
    useCallback(() => getRun(analysis.id), [analysis.id]),
  );
  const ev = run.evaluation;
  const [tab, setTab] = useState("overview");
  const [gen, setGen] = useState<{ status: "idle" | "running" | "err"; msg?: string }>({ status: "idle" });
  const [houseView, setHouseView] = useState<{ title: string; doc: string } | null>(null);

  const cfg = loadConfig();
  const agent = cfg.agents["定稿"];
  const prov = providerById(cfg, agent.provider);
  const realMode = prov.id !== "mock";

  const update = (patch: Partial<Evaluation>) => setEvaluation(analysis.id, { ...ev, ...patch });
  const ec = ev.economics;
  const setEcon = (patch: Partial<Evaluation["economics"]>) => update({ economics: { ...ec, ...patch } });
  const setArr = (arr: number[], i: number, v: number) => arr.map((x, k) => (k === i ? v : x));

  const pickVerdict = (v: EvalVerdict) => {
    const known = (Object.values(REASON_DEFAULT) as string[]).includes(ev.verdictReason.trim());
    update({ verdict: v, verdictReason: !ev.verdictReason.trim() || known ? REASON_DEFAULT[v] : ev.verdictReason });
  };

  const title = `${analysis.name} · 项目立项报告`;
  const badges = [REPORT_FOCUS, ev.verdict, analysis.industry].filter(Boolean) as string[];
  const axes = radarAxes(ev);

  const exportReport = async () => {
    setGen({ status: "running", msg: realMode ? "正在生成项目立项报告…（走定稿模型，约 1 分钟）" : "正在整理报告…" });
    try {
      const inp: ProjectReportInput = { name: analysis.name, industry: analysis.industry, counterparty: analysis.counterparty, ourRole: analysis.ourRole };
      const ctx: ProjectReportCtx = { deepReport: run.realReport ?? "", materials: run.materials, records: recordsText(run.questions), evaluation: ev };
      let md: string;
      if (realMode) {
        const fetchImpl = await getLlmFetch();
        md = await sendComplete(makeClient(prov, fetchImpl), buildProjectReportRequest(inp, ctx, agent.model), 5);
        if (!md.trim()) throw new Error("模型返回为空——可到「设置」为「定稿」换一款模型后重试");
        md = md.replace(/^\s*#\s+.*\r?\n+/, "");   // 去掉正文里重复的报告大标题（封面已有），避免被编成 01 章
      } else md = mockProjectReport(inp, ctx);
      const refs = [
        ...run.attachments.map((a) => (a.url ? `[${a.name}](${a.url})（上传 / 抓取）` : `${a.name}（上传材料）`)),
        ...run.sources.map((h) => `[${h.title || h.url}](${h.url})`),
      ];
      if (refs.length && !/(^|\n)#{1,6}\s*参考(资料|文献)/.test(md)) md += "\n\n## 参考资料\n\n" + refs.map((r, i) => `${i + 1}. ${r}`).join("\n");
      saveReport({ analysisId: analysis.id, title, subject: analysis.name, focus: REPORT_FOCUS, markdown: md });
      setHouseView({ title, doc: houseDocFromMarkdown(md, { title, badges }) });
      setGen({ status: "idle" });
    } catch (e) { setGen({ status: "err", msg: (e as Error).message.slice(0, 200) }); }
  };
  const saved = listReports().find((r) => r.analysisId === analysis.id && r.focus === REPORT_FOCUS);
  const openSaved = () => { if (saved) setHouseView({ title: saved.title, doc: houseDocFromMarkdown(saved.markdown, { title: saved.title, badges }) }); };

  // —— 客商 ——
  const setMerchant = (i: number, m: Merchant) => update({ credit: { merchants: ev.credit.merchants.map((x, k) => (k === i ? m : x)) } });
  const addMerchant = () => update({ credit: { merchants: [...ev.credit.merchants, emptyMerchant()] } });
  const delMerchant = (i: number) => update({ credit: { merchants: ev.credit.merchants.filter((_, k) => k !== i) } });
  const redlines = creditRedLines(ev.credit);

  // —— 经济效益：费用行 ——
  const setExpense = (k: ExpenseKey, row: ExpenseRow) => setEcon({ expenses: { ...ec.expenses, [k]: row } });
  const econRows = computeEconomics(ec);

  return (
    <div className="pr-report">
      <div className="pr-top">
        <div>
          <h2>项目评价 · 立项</h2>
          <div className="set-hint">{analysis.name}{analysis.counterparty ? ` · 对方「${analysis.counterparty}」` : ""} · 综合分 <strong>{compositeScore(ev)}</strong>/10</div>
        </div>
        <div className="pr-export-main">
          <button type="button" className="app-btn" disabled={gen.status === "running"} onClick={() => void exportReport()}>
            {gen.status === "running" ? "生成中…" : "一键导出项目报告 →"}
          </button>
          {saved && gen.status !== "running" && <button type="button" className="app-btn ghost" onClick={openSaved}>查看上次导出</button>}
        </div>
      </div>
      {gen.status !== "idle" && (
        <div className="set-hint" style={{ margin: "6px 0" }}>
          {gen.status === "err" ? <span className="pr-export-err">导出失败：{gen.msg}</span> : gen.msg}
        </div>
      )}

      <div className="ev-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={"ev-tab" + (tab === t.key ? " on" : "")} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* ① 项目情况 */}
      {tab === "overview" && (
        <div className="ev-pane ev-overview">
          <div className="ev-ov-left">
            <div className="sec-head">项目情况 · 定调</div>
            <div className="pw-meta" style={{ marginBottom: 12 }}>
              {analysis.ourRole && <span className="role-badge">我方：{analysis.ourRole}</span>}
              {analysis.industry && <span className="ind-badge">{analysis.industry}</span>}
              {analysis.counterparty && <span className="ind-badge">对方：{analysis.counterparty}</span>}
              {analysis.focus && <span className="ind-badge">类型：{analysis.focus}</span>}
              <span className="st-chip st-post">状态：{analysis.stage}</span>
            </div>
            <div className="ev-verdict-pick">
              {(["继续推进", "暂缓"] as EvalVerdict[]).map((v) => (
                <button key={v} type="button" className={"pr-vbtn wide v-" + v + (ev.verdict === v ? " on" : "")} onClick={() => pickVerdict(v)}>{v}</button>
              ))}
            </div>
            <div className={"pr-verdict-banner v-" + ev.verdict}>
              <div className="pr-vb-tag">定调 · {ev.verdict === "继续推进" ? "推向公司内部决策 · 深入探讨要不要做" : "暂缓 · 各种原因不再推进"}</div>
              <textarea className="pr-vb-reason" value={ev.verdictReason} onChange={(e) => update({ verdictReason: e.target.value })} />
            </div>
            <div className="set-hint">五维分值由后面 5 个 tab 填写自动汇总；看报告的人综合评估，不设及格线。</div>
          </div>
          <div className="ev-ov-right">
            <Radar axes={axes} title="项目五维评价（0–10）" />
            <div className="ev-axis-list">
              {axes.map((a) => (
                <div key={a.label} className="ev-axis-row"><span>{a.label}</span><strong>{a.value}</strong></div>
              ))}
              <div className="ev-axis-row total"><span>综合（等权）</span><strong>{compositeScore(ev)}</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* ② 战略契合度 */}
      {tab === "strategy" && (
        <div className="ev-pane">
          <div className="sec-head">战略契合度 · {strategyScore(ev.strategy)}/10</div>
          <div className="set-hint" style={{ marginBottom: 10 }}>所需：公司战略规划、业务目录、主营业务清单。选定档位即得分。</div>
          <div className="ev-fit">
            {FIT_TYPES.map((t) => (
              <button key={t} type="button" className={"ev-fit-opt" + (ev.strategy.fitType === t ? " on" : "")} onClick={() => update({ strategy: { ...ev.strategy, fitType: t } })}>
                <span className="ev-fit-score">{FIT_SCORE[t]}</span>
                <span>{t}</span>
              </button>
            ))}
          </div>
          <label className="fld" style={{ marginTop: 12 }}><span>依据说明</span>
            <textarea className="nd-extra" value={ev.strategy.note} placeholder="为什么归到这一档：对照公司主营/战略方向的具体依据…" onChange={(e) => update({ strategy: { ...ev.strategy, note: e.target.value } })} />
          </label>
        </div>
      )}

      {/* ③ 商业可行性 */}
      {tab === "commercial" && (
        <div className="ev-pane">
          <div className="sec-head">商业可行性 · {commercialScore(ev.commercial)}/10</div>
          {([["market", "市场前景（需求 / 成长性）"], ["terms", "商务条件合理性（价格 / 账期 / 权责）"], ["model", "模式可执行性（可复制 / 壁垒 / 落地）"]] as [keyof typeof ev.commercial, string][]).map(([k, label]) => (
            <div key={k as string} className="ev-line"><span className="ev-line-l">{label}</span>
              <Slider value={ev.commercial[k] as number} onChange={(v) => update({ commercial: { ...ev.commercial, [k]: v } })} />
            </div>
          ))}
          <label className="fld" style={{ marginTop: 12 }}><span>交易结构（货 / 单 / 资金怎么走，导出报告据此画链路图）</span>
            <textarea className="nd-extra" value={ev.commercial.txStructure} placeholder="各方出什么 / 拿什么、资金 / 货物 / 合同 / 发票流向与结算方式（预付 / 赊销 / 带款提货）…" onChange={(e) => update({ commercial: { ...ev.commercial, txStructure: e.target.value } })} />
          </label>
          <label className="fld"><span>判断说明</span>
            <textarea className="nd-extra" value={ev.commercial.note} placeholder="市场与商务条件的关键判断、依据与不确定性…" onChange={(e) => update({ commercial: { ...ev.commercial, note: e.target.value } })} />
          </label>
        </div>
      )}

      {/* ④ 客商资信 */}
      {tab === "credit" && (
        <div className="ev-pane">
          <div className="sec-head">客商资信 · {creditScore(ev.credit)}/10</div>
          {redlines.length > 0 && (
            <div className="ev-redline-banner">⚠ 触红线客商：{redlines.map((m) => m.name || "未命名客商").join("、")} —— 该家资信封顶 ≤2 并计入平均，请重点核。</div>
          )}
          {ev.credit.merchants.map((m, i) => (
            <div key={i} className={"ev-merchant" + (m.redLine ? " redline" : "")}>
              <div className="ev-merchant-top">
                <input className="key-input" value={m.name} placeholder="核心客商名称" onChange={(e) => setMerchant(i, { ...m, name: e.target.value })} />
                <span className="ev-merchant-score">{merchantScore(m)}/10</span>
                <button type="button" className="app-btn ghost" disabled={!m.name.trim()} onClick={() => void openExternal(`https://www.qcc.com/web/search?key=${encodeURIComponent(m.name.trim())}`, m.name.trim() || "企查查")}>企查查查询 ↗</button>
                {ev.credit.merchants.length > 1 && <button type="button" className="ql-del" onClick={() => delMerchant(i)}>删</button>}
              </div>
              <div className="ev-merchant-body">
                <div className="ev-merchant-dims">
                  {CREDIT_DIMS.map((d, di) => (
                    <div key={d} className="ev-line"><span className="ev-line-l" title={CREDIT_HINT[d]}>{d}</span>
                      <Slider value={m.scores[di]} onChange={(v) => setMerchant(i, { ...m, scores: m.scores.map((x, k) => (k === di ? v : x)) })} />
                    </div>
                  ))}
                </div>
                <div className="ev-merchant-radar"><Radar axes={CREDIT_DIMS.map((d, di) => ({ label: d.slice(0, 4), value: m.scores[di] }))} size={220} /></div>
              </div>
              <label className="ev-redline-toggle"><input type="checkbox" checked={m.redLine} onChange={(e) => setMerchant(i, { ...m, redLine: e.target.checked })} /> 触红线（失信 / 终本 / 破产 / 控制人股权冻结 / 经营异常吊销）</label>
              {m.redLine && <input className="key-input wide" value={m.redLineNote} placeholder="红线具体：如「列入失信被执行人，金额 XXX 万」" onChange={(e) => setMerchant(i, { ...m, redLineNote: e.target.value })} />}
              <input className="key-input wide" value={m.note} placeholder="备注：工商 / 股权穿透 / 资信查询要点…" onChange={(e) => setMerchant(i, { ...m, note: e.target.value })} />
            </div>
          ))}
          <button type="button" className="pr-add" onClick={addMerchant}>+ 加核心客商</button>
        </div>
      )}

      {/* ⑤ 经济效益 */}
      {tab === "economics" && (
        <div className="ev-pane">
          <div className="sec-head">经济效益 · {economicsScore(ec)}/10</div>
          <div className="ev-econ-params">
            <label>年化资金成本率 <input className="key-input mini" type="number" value={ec.fundCostRate} onChange={(e) => setEcon({ fundCostRate: toNum(e.target.value) })} />%</label>
            <label>目标净利率 <input className="key-input mini" type="number" value={ec.targetNetMargin} onChange={(e) => setEcon({ targetNetMargin: toNum(e.target.value) })} />%（评分锚点）</label>
            <label><input type="checkbox" checked={ec.financeAuto} onChange={(e) => setEcon({ financeAuto: e.target.checked })} /> 财务费用自动＝四项资金×年化率</label>
          </div>
          <div className="ev-econ-scroll">
            <table className="ev-econ">
              <thead>
                <tr><th>指标（万元）</th>{ec.years.map((y, i) => (
                  <th key={i}><input className="key-input mini" value={y} onChange={(e) => setEcon({ years: ec.years.map((x, k) => (k === i ? e.target.value : x)) })} /></th>
                ))}</tr>
              </thead>
              <tbody>
                <tr><td>营业收入</td>{ec.revenue.map((v, i) => (<td key={i}><input className="key-input mini" type="number" value={v} onChange={(e) => setEcon({ revenue: setArr(ec.revenue, i, toNum(e.target.value)) })} /></td>))}</tr>
                <tr><td>销售毛利</td>{ec.grossProfit.map((v, i) => (<td key={i}><input className="key-input mini" type="number" value={v} onChange={(e) => setEcon({ grossProfit: setArr(ec.grossProfit, i, toNum(e.target.value)) })} /></td>))}</tr>
                {EXPENSE_KEYS.map((k) => {
                  const row = ec.expenses[k];
                  const isFin = k === "finance";
                  const finAuto = isFin && ec.financeAuto;
                  return (
                    <tr key={k} className="ev-exp-row">
                      <td>
                        <div className="ev-exp-label">{EXPENSE_LABEL[k]}</div>
                        {finAuto ? <span className="ev-exp-mode auto">自动</span> : (
                          <div className="ev-exp-modes">
                            {(["amount", "pct"] as const).map((md) => (
                              <button key={md} type="button" className={"ev-exp-mbtn" + (row.mode === md ? " on" : "")} onClick={() => setExpense(k, { ...row, mode: md })}>{md === "amount" ? "万元" : "%营收"}</button>
                            ))}
                            {row.mode === "pct" && <input className="key-input mini" type="number" value={row.pct} onChange={(e) => setExpense(k, { ...row, pct: toNum(e.target.value) })} />}
                          </div>
                        )}
                      </td>
                      {ec.years.map((_, i) => {
                        const val = econRows[i].expenseBreak[k];
                        if (finAuto) return <td key={i} className="ev-cell-auto">{n1(financeCost(ec, i) ?? 0)}</td>;
                        if (row.mode === "pct") return <td key={i} className="ev-cell-auto">{n1(val)}</td>;
                        return <td key={i}><input className="key-input mini" type="number" value={row.amounts[i]} onChange={(e) => setExpense(k, { ...row, amounts: setArr(row.amounts, i, toNum(e.target.value)) })} /></td>;
                      })}
                    </tr>
                  );
                })}
                <tr className="ev-econ-sum"><td>费用合计</td>{econRows.map((r, i) => (<td key={i}>{n1(r.expenseTotal)}</td>))}</tr>
                <tr className="ev-econ-sum"><td>业务净利润</td>{econRows.map((r, i) => (<td key={i}>{n1(r.netProfit)}</td>))}</tr>
                <tr><td>平均四项资金</td>{ec.avgFund.map((v, i) => (<td key={i}><input className="key-input mini" type="number" value={v} onChange={(e) => setEcon({ avgFund: setArr(ec.avgFund, i, toNum(e.target.value)) })} /></td>))}</tr>
                <tr className="ev-econ-ratio"><td>销售毛利率</td>{econRows.map((r, i) => (<td key={i}>{n1(r.grossMargin)}%</td>))}</tr>
                <tr className="ev-econ-ratio"><td>业务净利润率</td>{econRows.map((r, i) => (<td key={i}>{n1(r.netMargin)}%</td>))}</tr>
                <tr className="ev-econ-ratio"><td>资产报酬率</td>{econRows.map((r, i) => (<td key={i}>{n1(r.roa)}%</td>))}</tr>
                <tr className="ev-econ-ratio"><td>四项资金周转天数</td>{econRows.map((r, i) => (<td key={i}>{n1(r.turnoverDays)}天</td>))}</tr>
              </tbody>
            </table>
          </div>
          <div className="set-hint">评分取第 1+2 年平均业务净利润率对目标净利率换算（达标≈6，约 1.67× 达标封顶 10）；数字仅供参考，读者综合评估。</div>
        </div>
      )}

      {/* ⑥ 风险可控性 */}
      {tab === "risk" && (
        <div className="ev-pane">
          <div className="sec-head">风险可控性 · {riskScore(ev.risk)}/10</div>
          <div className="set-hint" style={{ marginBottom: 10 }}>逐类评「可控性」（越高越可控）+ 控制措施；勾「翻单项」＝错了就能推翻这单，未受控（可控性&lt;6）会把总分封顶 ≤4。</div>
          {ev.risk.items.map((it, i) => (
            <div key={i} className="ev-risk">
              <div className="ev-risk-top">
                <span className="ev-risk-kind">{it.kind || RISK_KINDS[i] || "风险"}</span>
                <Slider value={it.control} onChange={(v) => update({ risk: { items: ev.risk.items.map((x, k) => (k === i ? { ...x, control: v } : x)) } })} />
                <label className="ev-risk-db"><input type="checkbox" checked={it.dealBreaker} onChange={(e) => update({ risk: { items: ev.risk.items.map((x, k) => (k === i ? { ...x, dealBreaker: e.target.checked } : x)) } })} /> 翻单项</label>
              </div>
              <input className="key-input wide" value={it.measure} placeholder="控制措施 / 缓释手段（如：预付比例、担保 / 抵押、分批放货、保险…）" onChange={(e) => update({ risk: { items: ev.risk.items.map((x, k) => (k === i ? { ...x, measure: e.target.value } : x)) } })} />
            </div>
          ))}
        </div>
      )}

      {houseView && <ReportView title={houseView.title} doc={houseView.doc} onClose={() => setHouseView(null)} />}
    </div>
  );
}
