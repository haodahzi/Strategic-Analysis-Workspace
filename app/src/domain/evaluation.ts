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
// —— 五类评分标准（评审参考展示 + 驱动智能解析）——
export interface RubricCue { concept: string; clue: string; }
export interface CreditRubricItem { field: string; checkItems: string[]; cues: RubricCue[]; bands: string; redline: string; }
export const CREDIT_RUBRIC: Record<CreditDim, CreditRubricItem> = {
  主体资格与存续稳定性: {
    field: "工商信息（登记状态、成立日期、注册资本 / 实缴、企业类型、营业期限、参保人数）、变更记录",
    checkItems: ["登记状态", "成立日期", "注册资本 / 实缴", "参保人数", "变更记录"],
    cues: [
      { concept: "存续稳定", clue: "登记状态＝存续 / 在营；成立年限长；实缴充足（接近认缴或与规模匹配）；参保人数与体量相符" },
      { concept: "实缴存疑", clue: "实缴为 0 或实缴率 <30%、认缴虚高；参保极少（如 <5 人）" },
      { concept: "频繁变更", clue: "近 1–2 年法定代表人 / 注册资本 / 股东 / 经营范围频繁变动（尤其注册资本骤减、法人频换）" },
      { concept: "红线", clue: "登记状态＝吊销 / 注销 / 停业 / 清算" },
    ],
    bands: "9–10 在营·成立≥8年·实缴充足·无重大变更｜6–8 3–8年·实缴一般｜3–5 <3年 / 实缴率<30% / 资本骤减｜0–2 且红线 吊销 / 注销",
    redline: "登记状态＝吊销 / 注销 / 停业 / 清算",
  },
  股东与控制结构: {
    field: "股东信息（名称+持股+认缴 / 实缴）、实际控制人、最终受益人(UBO)、股权穿透图、对外投资、疑似关系、历史股东",
    checkItems: ["股东及持股", "实际控制人", "最终受益人(UBO)", "对外投资 / 关联", "疑似关系 / 历史股东"],
    cues: [
      { concept: "背景强", clue: "股东或实控人含：国资 / 上市公司或其子公司 / 知名产业集团 / 政府引导基金 / 头部机构；实控人历史良好" },
      { concept: "股权清晰", clue: "穿透 ≤2–3 层到自然人或明确国资 / 上市主体；实控人唯一；UBO 可识别、比例明确" },
      { concept: "无异常", clue: "无疑似关系预警；关联 / 对外投资无成片失信 / 被执行 / 经营异常；实控人名下非批量空壳" },
      { concept: "多层嵌套", clue: ">3–4 层才穿透；顶层多个 LP/GP 或境外主体（BVI / 开曼），真实控制人看不清" },
      { concept: "代持迹象", clue: "名义股东与经营无关；职业代持人（一人任大量无关联企业股东 / 高管）；地址电话与壳公司雷同；历史股东频繁进出" },
      { concept: "查不到受益人", clue: "UBO 为空 / 无法穿透；顶层境外或多层合伙无明确实控人；或股权高度分散无单一实控人" },
    ],
    bands: "9–10 清晰+背景强+无异常｜6–8 结构一般·背景中性｜3–5 多层嵌套 / 代持迹象 / 实控人涉多家风险企业｜0–2 查不到受益人 / 疑似空壳",
    redline: "关联穿透喂给风险可控性；本类不单设红线，控制人股权冻结在偿债类计红线",
  },
  偿债能力与履约信用: {
    field: "司法风险板块 + 税务：被执行、失信、终本、限高、欠税、股权冻结 / 出质",
    checkItems: ["被执行人", "失信被执行人", "终本案件", "限制高消费", "欠税公告", "股权冻结 / 出质"],
    cues: [
      { concept: "被执行人", clue: "生效判决强制执行、未清偿；看案号 / 法院 / 标的金额 / 立案日期，金额大·多起·近期＝重" },
      { concept: "失信被执行人", clue: "有履行能力拒不履行等 6 种情形；看失信案号 / 情形 / 发布日期。→ 在列即红线" },
      { concept: "终本案件", clue: "穷尽措施查无财产而终本；看终本金额 / 日期。→ 偿债极差，视同红线" },
      { concept: "限制高消费", clue: "未履行被限高（单位则限法定代表人 / 实控人）；现金紧张信号，常与被执行并存" },
      { concept: "欠税公告", clue: "税务机关公告欠缴；看税种 / 余额 / 机关。→ 现金+合规双红灯" },
      { concept: "股权冻结 / 出质", clue: "冻结看标的 / 数额 / 期限 / 法院（冻在实控人层最危）；出质看质权人 / 数额（大额=高杠杆）" },
    ],
    bands: "9–10 全无｜6–8 仅历史已结小额、当前无在执行｜3–5 被执行未结 / 欠税 / 限高 / 大额出质｜0–2 且红线 失信 / 终本 / 破产",
    redline: "失信被执行 · 终本(无财产) · 破产 · 控制人股权冻结",
  },
  法律风险与商业诚信: {
    field: "裁判文书、开庭公告、立案信息、法院公告、行政处罚、严重违法失信",
    checkItems: ["诉讼(裁判文书)", "开庭 / 立案", "行政处罚", "严重违法失信"],
    cues: [
      { concept: "无 / 轻", clue: "无诉讼，或仅作为原告维权、零星劳动争议" },
      { concept: "中", clue: "作为被告的若干纠纷但已结、金额小" },
      { concept: "重", clue: "被告且多起买卖 / 借款合同纠纷、近期频发（看案由、原被告角色、涉案金额、时间分布）" },
      { concept: "红线", clue: "列入严重违法失信企业名单；合同诈骗类刑事案件" },
    ],
    bands: "9–10 无 / 轻｜6–8 被告已结小额｜3–5 被告多起合同纠纷·近期频发｜0–2 严重违法失信 / 合同诈骗刑事",
    redline: "严重违法失信企业名单 · 合同诈骗类刑事",
  },
  经营合规与资质: {
    field: "资质证书、行政许可、纳税信用、进出口 / 海关信用、抽查检查、经营异常、行政处罚",
    checkItems: ["资质 / 许可", "纳税信用", "海关信用", "经营异常", "抽查检查"],
    cues: [
      { concept: "齐全", clue: "按业务类型的法定前置许可有且在有效期（食品SC / 危化品 / 道路运输 / ICP / 广电 / 进出口备案 / 生产许可·3C 等）" },
      { concept: "纳税信用", clue: "A 90分以上 / B 70–90 / M 新设或无经营 / C 40–70 / D <40 或直接判D（重大税收违法），D 视红线" },
      { concept: "经营异常", clue: "4 情形：未年报 / 未公示即时信息 / 隐瞒弄虚 / 失联；在列（尤其失联·未年报）＝经营差" },
      { concept: "红线", clue: "关键前置许可缺失致业务违法 / 纳税D / 列入经营异常 / 严重违法失信名单" },
    ],
    bands: "9–10 关键资质齐全在有效期+纳税A+无异常｜6–8 基本齐+纳税B｜3–5 缺非关键资质 / 纳税C / 抽查有问题｜0–2 且红线 关键许可缺失致违法 / 纳税D / 经营异常",
    redline: "关键前置许可缺失致业务违法 · 纳税D · 经营异常吊销 / 注销 · 严重违法失信名单",
  },
};

export interface CreditCheck { done: boolean; basis: string; }   // 本轮校验：已校验(done)+依据(basis)；未校验 done=false
export interface Merchant { name: string; type: string; scores: number[]; redLine: boolean; redLineNote: string; note: string; checks?: CreditCheck[][]; }  // scores.length=5；checks[5][各类校验项]
export interface CreditEval { merchants: Merchant[]; }
export function buildChecks(): CreditCheck[][] { return CREDIT_DIMS.map((d) => CREDIT_RUBRIC[d].checkItems.map(() => ({ done: false, basis: "" }))); }
export function merchantChecks(m: Merchant): CreditCheck[][] {
  const def = buildChecks();
  if (!Array.isArray(m.checks) || m.checks.length !== 5) return def;
  return def.map((cat, ci) => cat.map((_, ii) => m.checks![ci]?.[ii] ?? { done: false, basis: "" }));
}
// 企查查报告智能解析结果：逐类分值 + 逐项校验(已核/未核+依据) + 逐类小结 + 红线判定与具体信息
export interface CreditParseResult { scores: number[]; checks: CreditCheck[][]; notes: string[]; redLine: boolean; redLineNote: string; }

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

export function emptyMerchant(): Merchant { return { name: "", type: "", scores: [0, 0, 0, 0, 0], redLine: false, redLineNote: "", note: "", checks: buildChecks() }; }
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
            checks: Array.isArray(m?.checks) && m.checks.length === 5 ? m.checks : buildChecks(),
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
