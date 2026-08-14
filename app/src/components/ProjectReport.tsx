import { useCallback, useState, useSyncExternalStore } from "react";
import { Analysis, QItem } from "../types";
import {
  Evaluation, EvalVerdict, ExpenseKey, ExpenseRow, Merchant, CreditCheck,
  MERCHANT_TYPES, RISK_KINDS, FIT_TYPES, FIT_SCORE, CREDIT_DIMS, CREDIT_RUBRIC, EXPENSE_KEYS, EXPENSE_LABEL,
  emptyMerchant, emptyRiskItem, merchantChecks, strategyScore, commercialScore, merchantScore, creditScore, creditRedLines,
  computeEconomics, economicsScore, riskScore, radarAxes, compositeScore, financeCost,
} from "../domain/evaluation";
import Radar from "./Radar";
import { openExternal } from "../sources/browser";
import { extractPdfText } from "../lib/pdf";
import { loadConfig, providerById } from "../config/store";
import { makeClient } from "../llm/adapters";
import { getLlmFetch } from "../llm/runtime";
import { getRun, sendComplete, setEvaluation, subscribe } from "../llm/pipelineStore";
import { ProjectReportCtx, ProjectReportInput, buildProjectReportRequest, buildCreditParseRequest, mockProjectReport, parseCreditReport } from "../llm/pipeline";
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

// 洽谈后·六维评价工作区：项目情况(项目简介+定调+五维雷达) / 战略契合度 / 商业可行性 / 客商资信 / 经济效益 / 风险可控性。
export default function ProjectReport({ analysis }: { analysis: Analysis }) {
  const run = useSyncExternalStore(
    useCallback((cb: () => void) => subscribe(analysis.id, cb), [analysis.id]),
    useCallback(() => getRun(analysis.id), [analysis.id]),
  );
  const ev = run.evaluation;
  const [tab, setTab] = useState("overview");
  const [gen, setGen] = useState<{ status: "idle" | "running" | "err"; msg?: string }>({ status: "idle" });
  const [houseView, setHouseView] = useState<{ title: string; doc: string } | null>(null);
  const [mi, setMi] = useState(0);                                       // 当前选中的客商（左右切换）
  const [openDim, setOpenDim] = useState<number | null>(null);          // 展开的评分标准/校验面板（accordion）
  const [parse, setParse] = useState<{ status: "idle" | "running" | "err"; msg?: string }>({ status: "idle" });

  const cfg = loadConfig();
  const agent = cfg.agents["定稿"];
  const prov = providerById(cfg, agent.provider);
  const realMode = prov.id !== "mock";
  const parseAgent = cfg.agents["资料"];
  const parseProv = providerById(cfg, parseAgent.provider);

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
        md = md.replace(/^\s*#\s+.*\r?\n+/, "");
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

  // —— 客商（左右切换 master-detail）——
  const merchants = ev.credit.merchants;
  const si = Math.max(0, Math.min(mi, merchants.length - 1));
  const m = merchants[si];
  const setMerchant = (i: number, mm: Merchant) => update({ credit: { merchants: merchants.map((x, k) => (k === i ? mm : x)) } });
  // 逐项校验编辑（已校验 done / 依据 basis）
  const setCheck = (di: number, ii: number, patch: Partial<CreditCheck>) => {
    const cur = merchantChecks(m).map((cat, ci) => (ci === di ? cat.map((x, xi) => (xi === ii ? { ...x, ...patch } : x)) : cat));
    setMerchant(si, { ...m, checks: cur });
  };
  const bandOf = (s: number) => (s >= 9 ? "9–10" : s >= 6 ? "6–8" : s >= 3 ? "3–5" : "0–2");
  const addMerchant = () => { update({ credit: { merchants: [...merchants, emptyMerchant()] } }); setMi(merchants.length); setOpenDim(null); };
  const delMerchant = (i: number) => { if (merchants.length <= 1) return; update({ credit: { merchants: merchants.filter((_, k) => k !== i) } }); setMi(Math.max(0, i - 1)); };
  const redlines = creditRedLines(ev.credit);

  // 企查查报告智能解析（PDF/TXT → 提取正文 → 模型按 5 类抽分与依据 → 回填该客商）
  const importCredit = async (i: number, file: File) => {
    setParse({ status: "running", msg: "提取报告正文…" });
    try {
      const text = /\.pdf$/i.test(file.name) ? await extractPdfText(file) : await file.text();
      if (!text.trim()) throw new Error("没提取到文字（可能是扫描件 / 图片版 PDF，换文本版或手动填分）");
      if (parseProv.id === "mock") throw new Error("无 Key，无法智能解析——到「设置」为「资料」配置模型后再试；也可手动填分");
      setParse({ status: "running", msg: "模型解析中…（按 5 类维度抽分与依据）" });
      const fetchImpl = await getLlmFetch();
      const res = await makeClient(parseProv, fetchImpl).send(buildCreditParseRequest(merchants[i].name, text, parseAgent.model));
      const p = parseCreditReport(res.text);
      const note = CREDIT_DIMS.map((d, k) => (p.notes[k] ? `【${d.slice(0, 4)}】${p.notes[k]}` : "")).filter(Boolean).join("\n");
      const cur = getRun(analysis.id).evaluation.credit.merchants[i];
      setMerchant(i, { ...cur, scores: p.scores, checks: p.checks, note: note || cur.note, redLine: p.redLine || cur.redLine, redLineNote: p.redLineNote || cur.redLineNote });
      setParse({ status: "idle", msg: "" });
    } catch (e) { setParse({ status: "err", msg: (e as Error).message.slice(0, 180) }); }
  };

  // —— 风险（增删列表）——
  const addRisk = (desc = "") => update({ risk: { items: [...ev.risk.items, emptyRiskItem(desc)] } });
  const setRisk = (i: number, patch: Partial<Evaluation["risk"]["items"][number]>) => update({ risk: { items: ev.risk.items.map((x, k) => (k === i ? { ...x, ...patch } : x)) } });
  const delRisk = (i: number) => update({ risk: { items: ev.risk.items.filter((_, k) => k !== i) } });

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
        <div className="ev-pane">
          <div className="sec-head">项目情况 · 定调</div>
          <div className="ev-verdict-pick">
            {(["继续推进", "暂缓"] as EvalVerdict[]).map((v) => (
              <button key={v} type="button" className={"pr-vbtn wide v-" + v + (ev.verdict === v ? " on" : "")} onClick={() => pickVerdict(v)}>{v}</button>
            ))}
          </div>
          <div className="ev-overview">
            <div className="ev-ov-left">
              <div className={"pr-verdict-banner v-" + ev.verdict}>
                <div className="pr-vb-tag">定调 · {ev.verdict === "继续推进" ? "推向公司内部决策 · 深入探讨要不要做" : "暂缓 · 各种原因不再推进"}</div>
                <textarea className="pr-vb-reason" value={ev.verdictReason} onChange={(e) => update({ verdictReason: e.target.value })} />
              </div>
              <label className="fld"><span>项目简介（一段话：业务模式 · 关键客户 · 盈利模式 · 核心壁垒或关键价值）</span>
                <textarea className="nd-extra" rows={5} value={ev.brief} placeholder="一段话讲清这单是什么：怎么做的业务、卖给谁 / 从谁进货、靠什么赚钱、护城河或关键价值在哪…" onChange={(e) => update({ brief: e.target.value })} />
              </label>
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
          {([["market", "marketNote", "市场前景（需求 / 成长性）"], ["terms", "termsNote", "商务条件合理性（价格 / 账期 / 权责）"], ["model", "modelNote", "模式可执行性（可复制 / 壁垒 / 落地）"]] as [keyof typeof ev.commercial, keyof typeof ev.commercial, string][]).map(([k, nk, label]) => (
            <div key={k as string} className="ev-comm-item">
              <div className="ev-line"><span className="ev-line-l">{label}</span>
                <Slider value={ev.commercial[k] as number} onChange={(v) => update({ commercial: { ...ev.commercial, [k]: v } })} />
              </div>
              <textarea className="nd-extra ev-comm-note" value={ev.commercial[nk] as string} placeholder="该项依据 / 判断…" onChange={(e) => update({ commercial: { ...ev.commercial, [nk]: e.target.value } })} />
            </div>
          ))}
          <label className="fld" style={{ marginTop: 12 }}><span>交易结构（货 / 单 / 资金怎么走，导出报告据此画链路图）</span>
            <textarea className="nd-extra" value={ev.commercial.txStructure} placeholder="各方出什么 / 拿什么、资金 / 货物 / 合同 / 发票流向与结算方式（预付 / 赊销 / 带款提货）…" onChange={(e) => update({ commercial: { ...ev.commercial, txStructure: e.target.value } })} />
          </label>
        </div>
      )}

      {/* ④ 客商资信（左右切换 + 企查查智能解析） */}
      {tab === "credit" && (
        <div className="ev-pane">
          <div className="sec-head">客商资信 · {creditScore(ev.credit)}/10</div>
          {redlines.length > 0 && (
            <div className="ev-redline-banner">⚠ 触红线客商：{redlines.map((x) => (x.name || "未命名客商") + (x.redLineNote ? `（${x.redLineNote}）` : "")).join("；")} —— 该家资信封顶 ≤2 并计入平均，请重点核。</div>
          )}
          <div className="ev-mcht-chips">
            {merchants.map((x, i) => (
              <button key={i} type="button" className={"ev-mcht-chip" + (i === si ? " on" : "") + (x.redLine ? " redline" : "")} onClick={() => { setMi(i); setOpenDim(null); }}>
                {x.name || `客商${i + 1}`}{x.type ? ` · ${x.type}` : ""}<span className="ev-mcht-chip-s">{merchantScore(x)}</span>
              </button>
            ))}
            <button type="button" className="ev-mcht-chip add" onClick={addMerchant}>+ 加客商</button>
          </div>

          {m && (
            <div className={"ev-merchant" + (m.redLine ? " redline" : "")}>
              <div className="ev-merchant-top">
                <input className="key-input" value={m.name} placeholder="核心客商名称" onChange={(e) => setMerchant(si, { ...m, name: e.target.value })} />
                <select className="set-select" value={m.type} onChange={(e) => setMerchant(si, { ...m, type: e.target.value })}>
                  <option value="">客商类型…</option>
                  {MERCHANT_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
                <span className="ev-merchant-score">{merchantScore(m)}/10</span>
                {merchants.length > 1 && <button type="button" className="ql-del" onClick={() => delMerchant(si)}>删</button>}
              </div>

              <div className="ev-qcc-bar">
                <button type="button" className="app-btn ghost" disabled={!m.name.trim()} onClick={() => void openExternal(`https://www.qcc.com/web/search?key=${encodeURIComponent(m.name.trim())}`, m.name.trim() || "企查查")}>企查查查询 ↗</button>
                <label className={"app-btn" + (parse.status === "running" ? " disabled" : "")}>
                  {parse.status === "running" ? "解析中…" : "导入企查查报告 · 智能解析"}
                  <input type="file" accept=".pdf,.txt" style={{ display: "none" }} disabled={parse.status === "running"} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCredit(si, f); e.currentTarget.value = ""; }} />
                </label>
                <span className="set-hint">在企查查下载该客商报告(PDF)，导入后自动抽取 5 类评分与依据、命中失信/终本等自动勾红线。</span>
              </div>
              {parse.status !== "idle" && <div className="set-hint" style={{ margin: "2px 0 6px" }}>{parse.status === "err" ? <span className="pr-export-err">解析失败：{parse.msg}</span> : parse.msg}</div>}

              <div className="ev-merchant-radar top"><Radar axes={CREDIT_DIMS.map((d, di) => ({ label: d.slice(0, 4), value: m.scores[di] }))} size={230} /></div>
              <div className="ev-merchant-dims">
                {CREDIT_DIMS.map((d, di) => {
                  const r = CREDIT_RUBRIC[d];
                  const chks = merchantChecks(m)[di];
                  const doneN = chks.filter((x) => x.done).length;
                  return (
                    <div key={d} className="ev-dim">
                      <div className="ev-line">
                        <span className="ev-line-l">{d}</span>
                        <Slider value={m.scores[di]} onChange={(v) => setMerchant(si, { ...m, scores: m.scores.map((x, k) => (k === di ? v : x)) })} />
                        <button type="button" className={"ev-std-btn" + (openDim === di ? " on" : "")} onClick={() => setOpenDim(openDim === di ? null : di)}>标准·校验 {openDim === di ? "▲" : "▼"}</button>
                      </div>
                      <div className="ev-band-cur">当前 {m.scores[di]} → 「{bandOf(m.scores[di])}」档 · 本轮已校验 {doneN}/{r.checkItems.length}</div>
                      {openDim === di && (
                        <div className="ev-std-panel">
                          <div className="ev-std-sec"><b>看什么：</b>{r.field}</div>
                          <div className="ev-std-cues">{r.cues.map((cue) => (<div key={cue.concept} className="ev-cue"><b>{cue.concept}</b>：{cue.clue}</div>))}</div>
                          <div className="ev-std-sec"><b>分档：</b>{r.bands}</div>
                          <div className="ev-std-red"><b>红线：</b>{r.redline}</div>
                          <div className="ev-std-sec"><b>本轮校验清单</b>（勾选＝已校验并填依据；不勾＝未校验）</div>
                          <div className="ev-checks">
                            {r.checkItems.map((it, ii) => {
                              const ck = chks[ii];
                              return (
                                <div key={it} className="ev-check-row">
                                  <label className="ev-check-lbl"><input type="checkbox" checked={ck.done} onChange={(e) => setCheck(di, ii, { done: e.target.checked })} /> {it}</label>
                                  {ck.done
                                    ? <input className="key-input ev-check-basis" value={ck.basis} placeholder="依据 / 具体信息…" onChange={(e) => setCheck(di, ii, { basis: e.target.value })} />
                                    : <span className="ev-unchecked">未校验</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <label className="ev-redline-toggle"><input type="checkbox" checked={m.redLine} onChange={(e) => setMerchant(si, { ...m, redLine: e.target.checked })} /> 触红线（失信 / 终本 / 破产 / 控制人股权冻结 / 经营异常吊销）</label>
              {m.redLine && <input className="key-input wide" value={m.redLineNote} placeholder="红线具体信息：如「列入失信被执行人，标的 800 万」——务必写清是哪条触发" onChange={(e) => setMerchant(si, { ...m, redLineNote: e.target.value })} />}
              <textarea className="nd-extra" value={m.note} placeholder="评分依据汇总 / 备注（智能解析会把各类已核项依据填这里）" onChange={(e) => setMerchant(si, { ...m, note: e.target.value })} />
            </div>
          )}
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
                  const finAuto = k === "finance" && ec.financeAuto;
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
                        if (finAuto) return <td key={i} className="ev-cell-auto">{n1(financeCost(ec, i) ?? 0)}</td>;
                        if (row.mode === "pct") return <td key={i} className="ev-cell-auto">{n1(econRows[i].expenseBreak[k])}</td>;
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
          <div className="set-hint" style={{ marginBottom: 10 }}>有就写、没有就删——不用为了写而写。每条＝风险描述 + 风险控制；可控性用于打分，未受控（&lt;6）的翻单项会把总分封顶 ≤4。</div>
          <div className="ev-risk-add">
            <span className="set-hint">快速添加：</span>
            {RISK_KINDS.map((k) => (<button key={k} type="button" className="ev-chip" onClick={() => addRisk(k)}>+ {k}</button>))}
            <button type="button" className="ev-chip" onClick={() => addRisk("")}>+ 自定义</button>
          </div>
          {ev.risk.items.length === 0 && <div className="set-hint" style={{ marginTop: 12 }}>暂无风险条目——点上面按需添加。</div>}
          {ev.risk.items.map((it, i) => (
            <div className="ev-risk" key={i}>
              <div className="ev-risk-top">
                <input className="key-input" value={it.desc} placeholder="风险描述：具体是什么风险…" onChange={(e) => setRisk(i, { desc: e.target.value })} />
                <Slider value={it.control} onChange={(v) => setRisk(i, { control: v })} />
                <label className="ev-risk-db"><input type="checkbox" checked={it.dealBreaker} onChange={(e) => setRisk(i, { dealBreaker: e.target.checked })} /> 翻单项</label>
                <button type="button" className="ql-del" onClick={() => delRisk(i)}>删</button>
              </div>
              <textarea className="nd-extra" value={it.measure} placeholder="风险控制：缓释手段（预付比例 / 担保 / 抵押 / 分批放货 / 保险 / 条款…）" onChange={(e) => setRisk(i, { measure: e.target.value })} />
            </div>
          ))}
        </div>
      )}

      {houseView && <ReportView title={houseView.title} doc={houseView.doc} onClose={() => setHouseView(null)} />}
    </div>
  );
}
