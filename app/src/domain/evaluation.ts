// 洽谈后·六维评价：类型 + 纯计算/评分（可单测）。所有维度分值统一 0–10。
// 五维雷达轴：战略契合度 / 商业可行性 / 主要客商资信 / 经济效益 / 风险可控性。
import { RadarAxis } from "../export/radar";

export type EvalVerdict = "继续推进" | "暂缓";

// —— 一、战略契合度：MD 档位直接给分 ——
export type FitType = "" | "中长期战略导向" | "主业范围内" | "边缘可关联" | "非主业且无授权";
export const FIT_SCORE: Record<Exclude<FitType, "">, number> = { 中长期战略导向: 10, 主业范围内: 8, 边缘可关联: 4, 非主业且无授权: 0 };
export const FIT_TYPES: Exclude<FitType, "">[] = ["中长期战略导向", "主业范围内", "边缘可关联", "非主业且无授权"];
export interface StrategyEval { fitType: FitType; note: string; }

// —— 二、商业可行性：市场前景 / 商务条件 / 模式可执行 三项均值，每项各带依据说明 + 交易结构 ——
export interface CommercialEval { market: number; marketNote: string; terms: number; termsNote: string; model: number; modelNote: string; txStructure: string; }

// —— 三、客商资信：多客商，每家 5 类 0–10；红线家封顶 ≤2 并重点提示 ——
export const MERCHANT_TYPES = ["客户", "供应商", "物流服务商", "代运营服务商", "联营方", "其他"];
export const CREDIT_DIMS = ["主体资格与存续稳定性", "股东与控制结构", "偿债能力与履约信用", "法律风险与商业诚信", "经营合规与资质"] as const;
export type CreditDim = typeof CREDIT_DIMS[number];
export const CREDIT_HINT: Record<CreditDim, string> = {
  主体资格与存续稳定性: "登记状态·成立日期·注册资本/实缴·规模·营业期限·参保人数·变更记录",
  股东与控制结构: "股东及持股·实控人·最终受益人·对外投资·控制企业·疑似关系",
  偿债能力与履约信用: "被执行·失信·终本·限高·股权冻结/出质·动产抵押·欠税",
  法律风险与商业诚信: "诉讼（原告/被告·案由）·开庭·行政处罚·严重违法失信",
  经营合规与资质: "资质证书·行政许可·纳税/海关信用·抽查检查·经营异常",
};
export interface Merchant { name: string; type: string; scores: number[]; redLine: boolean; redLineNote: string; note: string; }  // scores.length = 5
export interface CreditEval { merchants: Merchant[]; }
// 企查查报告智能解析结果
export interface CreditParseResult { scores: number[]; evidence: string[]; redLine: boolean; redLineNote: string; }

// —— 四、经济效益：万元口径逐年测算表 ——
export type ExpenseMode = "amount" | "pct";
export interface ExpenseRow { mode: ExpenseMode; amounts: number[]; pct: number; }   // amount：三年各值(万元)；pct：一个比例(%营收)三年通用
export const EXPENSE_KEYS = ["logistics", "marketing", "finance", "salary", "other"] as const;
export type ExpenseKey = typeof EXPENSE_KEYS[number];
export const EXPENSE_LABEL: Record<ExpenseKey, string> = { logistics: "仓储物流费用", marketing: "运营推广费用", finance: "财务费用", salary: "薪酬费用", other: "其他费用及税金" };
export interface EconomicsEval {
  years: string[];            // 长度 3
  revenue: number[];          // 营业收入（万元）
  grossProfit: number[];      // 销售毛利（万元）
  expenses: Record<ExpenseKey, ExpenseRow>;
  avgFund: number[];          // 平均四项资金（万元）
  fundCostRate: number;       // 年化资金成本率（%）——财务费用默认据此自动
  targetNetMargin: number;    // 目标净利率（%）——本轴评分锚点
  financeAuto: boolean;       // 财务费用 = 平均四项资金 × 年化资金成本率
}

// —— 五、风险可控性：有就写、没有就删（增删列表）；每条＝风险描述 + 风险控制，可控性用于打分；未受控翻单项封顶 ≤4 ——
export const RISK_KINDS = ["政策性风险", "客商信用风险（含回款）", "交易标的物风险", "市场风险", "汇率 / 授权 / 资质风险"];   // 「+ 添加」时的备选建议
export interface RiskItem { desc: string; control: number; measure: string; dealBreaker: boolean; }   // desc=风险描述，measure=风险控制
export interface RiskEval { items: RiskItem[]; }

export interface Evaluation {
  verdict: EvalVerdict; verdictReason: string; brief: string;   // brief=项目简介（一段话：业务模式/关键客户/盈利模式/核心壁垒或价值）
  strategy: StrategyEval; commercial: CommercialEval; credit: CreditEval; economics: EconomicsEval; risk: RiskEval;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const clamp = (x: number, lo = 0, hi = 10) => Math.max(lo, Math.min(hi, x));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function emptyMerchant(): Merchant { return { name: "", type: "", scores: [0, 0, 0, 0, 0], redLine: false, redLineNote: "", note: "" }; }
export function emptyRiskItem(desc = ""): RiskItem { return { desc, control: 5, measure: "", dealBreaker: false }; }
export function emptyEvaluation(): Evaluation {
  const y = new Date().getFullYear();
  const row = (): ExpenseRow => ({ mode: "pct", amounts: [0, 0, 0], pct: 0 });
  return {
    verdict: "继续推进",
    verdictReason: "前期了解已达成，建议推进公司内部决策、深入探讨要不要做。",
    brief: "",
    strategy: { fitType: "", note: "" },
    commercial: { market: 0, marketNote: "", terms: 0, termsNote: "", model: 0, modelNote: "", txStructure: "" },
    credit: { merchants: [emptyMerchant()] },
    economics: {
      years: [String(y), String(y + 1), String(y + 2)],
      revenue: [0, 0, 0], grossProfit: [0, 0, 0],
      expenses: { logistics: row(), marketing: row(), finance: row(), salary: row(), other: row() },
      avgFund: [0, 0, 0], fundCostRate: 4.5, targetNetMargin: 8, financeAuto: true,
    },
    risk: { items: [] },   // 有就写、没有就删；默认空，按需添加
  };
}

// —— 评分 ——
export function strategyScore(s: StrategyEval): number { return s.fitType ? FIT_SCORE[s.fitType] : 0; }
export function commercialScore(c: CommercialEval): number { return round1((c.market + c.terms + c.model) / 3); }

export function merchantScore(m: Merchant): number {
  const base = avg(m.scores);
  return m.redLine ? Math.min(round1(base), 2) : round1(base);
}
export function activeMerchants(c: CreditEval): Merchant[] {
  return c.merchants.filter((m) => m.name.trim() || m.scores.some((s) => s > 0) || m.redLine);
}
export function creditScore(c: CreditEval): number {
  const ms = activeMerchants(c);
  return ms.length ? round1(avg(ms.map(merchantScore))) : 0;
}
export function creditRedLines(c: CreditEval): Merchant[] { return activeMerchants(c).filter((m) => m.redLine); }

// 经济效益逐年测算
export interface EconRow {
  revenue: number; gross: number; expenseBreak: Record<ExpenseKey, number>; expenseTotal: number;
  netProfit: number; grossMargin: number; netMargin: number; roa: number; turnover: number; turnoverDays: number;
}
export function financeCost(e: EconomicsEval, yi: number): number | undefined {
  return e.financeAuto ? (e.avgFund[yi] ?? 0) * (e.fundCostRate / 100) : undefined;
}
export function expenseAmount(row: ExpenseRow, revenue: number, yi: number, autoVal?: number): number {
  if (autoVal !== undefined) return autoVal;
  return row.mode === "pct" ? (revenue * row.pct) / 100 : (row.amounts[yi] ?? 0);
}
export function computeEconomics(e: EconomicsEval): EconRow[] {
  return e.years.map((_, yi) => {
    const revenue = e.revenue[yi] ?? 0, gross = e.grossProfit[yi] ?? 0, fund = e.avgFund[yi] ?? 0;
    const expenseBreak = {} as Record<ExpenseKey, number>;
    for (const k of EXPENSE_KEYS) expenseBreak[k] = expenseAmount(e.expenses[k], revenue, yi, k === "finance" ? financeCost(e, yi) : undefined);
    const expenseTotal = EXPENSE_KEYS.reduce((s, k) => s + expenseBreak[k], 0);
    const netProfit = gross - expenseTotal;
    return {
      revenue, gross, expenseBreak, expenseTotal, netProfit,
      grossMargin: revenue ? (gross / revenue) * 100 : 0,
      netMargin: revenue ? (netProfit / revenue) * 100 : 0,
      roa: fund ? (netProfit / fund) * 100 : 0,
      turnover: fund ? revenue / fund : 0,
      turnoverDays: fund && revenue ? (fund * 365) / revenue : 0,
    };
  });
}
export function economicsScore(e: EconomicsEval): number {
  const rows = computeEconomics(e).slice(0, 2);            // 第1+2年平均
  const avgNet = avg(rows.map((r) => r.netMargin));
  const target = e.targetNetMargin || 8;
  return clamp(Math.round((avgNet / target) * 6));         // 达标≈6，约1.67×达标封顶10
}

export function riskScore(r: RiskEval): number {
  const items = r.items.filter((i) => i.desc.trim());
  if (!items.length) return 0;
  const base = avg(items.map((i) => i.control));
  const uncontrolledBreaker = items.some((i) => i.dealBreaker && i.control < 6);
  return round1(uncontrolledBreaker ? Math.min(base, 4) : base);
}

// 落盘回灌兼容：把旧版（risk.kind / 无 type / 无分项说明 / 无 brief）规整成当前结构，避免升级后崩。
/* eslint-disable @typescript-eslint/no-explicit-any */
export function normalizeEvaluation(raw: any): Evaluation {
  const d = emptyEvaluation();
  if (!raw || typeof raw !== "object") return d;
  const rc = raw.commercial ?? {}, re = raw.economics ?? {};
  return {
    verdict: raw.verdict === "暂缓" ? "暂缓" : "继续推进",
    verdictReason: typeof raw.verdictReason === "string" ? raw.verdictReason : d.verdictReason,
    brief: typeof raw.brief === "string" ? raw.brief : "",
    strategy: { fitType: raw.strategy?.fitType ?? "", note: raw.strategy?.note ?? "" },
    commercial: {
      market: +rc.market || 0, marketNote: rc.marketNote ?? "",
      terms: +rc.terms || 0, termsNote: rc.termsNote ?? "",
      model: +rc.model || 0, modelNote: rc.modelNote ?? rc.note ?? "",
      txStructure: rc.txStructure ?? "",
    },
    credit: {
      merchants: Array.isArray(raw.credit?.merchants) && raw.credit.merchants.length
        ? raw.credit.merchants.map((m: any) => ({
            name: m?.name ?? "", type: m?.type ?? "",
            scores: Array.isArray(m?.scores) && m.scores.length === 5 ? m.scores.map((n: any) => +n || 0) : [0, 0, 0, 0, 0],
            redLine: !!m?.redLine, redLineNote: m?.redLineNote ?? "", note: m?.note ?? "",
          }))
        : [emptyMerchant()],
    },
    economics: {
      years: Array.isArray(re.years) && re.years.length === 3 ? re.years.map(String) : d.economics.years,
      revenue: Array.isArray(re.revenue) ? re.revenue : d.economics.revenue,
      grossProfit: Array.isArray(re.grossProfit) ? re.grossProfit : d.economics.grossProfit,
      expenses: re.expenses ?? d.economics.expenses,
      avgFund: Array.isArray(re.avgFund) ? re.avgFund : d.economics.avgFund,
      fundCostRate: typeof re.fundCostRate === "number" ? re.fundCostRate : 4.5,
      targetNetMargin: typeof re.targetNetMargin === "number" ? re.targetNetMargin : 8,
      financeAuto: re.financeAuto !== false,
    },
    risk: {
      items: Array.isArray(raw.risk?.items)
        ? raw.risk.items.map((it: any) => ({ desc: it?.desc ?? it?.kind ?? "", control: typeof it?.control === "number" ? it.control : 5, measure: it?.measure ?? "", dealBreaker: !!it?.dealBreaker })).filter((it: RiskItem) => it.desc.trim() || it.measure.trim())
        : [],
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function radarAxes(ev: Evaluation): RadarAxis[] {
  return [
    { label: "战略契合度", value: strategyScore(ev.strategy) },
    { label: "商业可行性", value: commercialScore(ev.commercial) },
    { label: "主要客商资信", value: creditScore(ev.credit) },
    { label: "经济效益", value: economicsScore(ev.economics) },
    { label: "风险可控性", value: riskScore(ev.risk) },
  ];
}
export function compositeScore(ev: Evaluation): number { return round1(avg(radarAxes(ev).map((a) => a.value))); }
