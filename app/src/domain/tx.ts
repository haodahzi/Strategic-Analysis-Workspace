// 交易结构四流 + 确定性合规规则 R1–R7。
// 详见 docs/详细设计-交易结构图与合规规则.md。
// 关键：红灯判定不靠 AI，靠可复核的确定性规则；AI 只负责从会议记录抽四流、以及就红灯给判断卡片。

export type PartyRole =
  | "签约主体" | "收款主体" | "付款主体"
  | "发货/服务提供" | "收货/服务接收" | "开票方" | "受票方" | "非交易第三方";
export type FlowType = "资金流" | "货物服务流" | "票流" | "合同流";

export interface Party { id: string; name: string; roles?: PartyRole[]; }
export interface Flow { id: string; type: FlowType; from: string; to: string; instrument?: string; amount?: number; note?: string; }
export interface Timing { lockPeriod?: string; lockPrice?: string; marketCycle?: string; }
export interface TxStructure { parties: Party[]; flows: Flow[]; timing?: Timing; }

export type RuleId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7";
export interface RiskFinding {
  rule: RuleId;
  title: string;
  level: "红" | "黄";
  parties: string[];
  reason: string;
}

export const RULE_TITLE: Record<RuleId, string> = {
  R1: "四流闭合",
  R2: "签约=收款",
  R3: "签约=发货开票",
  R4: "进销匹配",
  R5: "资金路径洁净",
  R6: "三流 vs 四流（合同流露馅）",
  R7: "时点 / 周期",
};

const ofType = (tx: TxStructure, t: FlowType) => tx.flows.filter((f) => f.type === t);
const nameOf = (tx: TxStructure, id: string) => tx.parties.find((p) => p.id === id)?.name ?? id;
const namesOf = (tx: TxStructure, ids: string[]) => [...new Set(ids)].map((id) => nameOf(tx, id));

/** 确定性合规规则引擎：输入四流结构，输出红/黄灯清单（红在前）。 */
export function runComplianceRules(tx: TxStructure): RiskFinding[] {
  const money = ofType(tx, "资金流");
  const goods = ofType(tx, "货物服务流");
  const invoice = ofType(tx, "票流");
  const contract = ofType(tx, "合同流");

  const payees = new Set(money.map((f) => f.to));
  const payers = new Set(money.map((f) => f.from));
  const shippers = new Set(goods.map((f) => f.from));
  const invoicers = new Set(invoice.map((f) => f.from));
  const contractParties = new Set<string>([
    ...contract.flatMap((f) => [f.from, f.to]),
    ...tx.parties.filter((p) => p.roles?.includes("签约主体")).map((p) => p.id),
  ]);

  const findings: RiskFinding[] = [];
  const add = (rule: RuleId, level: "红" | "黄", ids: string[], reason: string) =>
    findings.push({ rule, title: RULE_TITLE[rule], level, parties: namesOf(tx, ids), reason });

  // R2 收款主体 ⊆ 签约主体
  const r2 = [...payees].filter((id) => !contractParties.has(id));
  if (r2.length) add("R2", "红", r2, "收款主体不在签约主体中——代收代付 / 名实分离，虚开与资金流向风险。");

  // R3 发货、开票主体 ⊆ 签约主体
  const r3 = [...new Set([...shippers, ...invoicers])].filter((id) => !contractParties.has(id));
  if (r3.length) add("R3", "红", r3, "发货/开票主体不在签约主体中——走单 / 名义与实际主体分离。");

  // R4 进销匹配：货物/服务流 与 票流 的有向配对
  const dir = (f: Flow) => `${f.from}→${f.to}`;
  const gSet = new Set(goods.map(dir));
  const iSet = new Set(invoice.map(dir));
  const invoiceNoGoods = invoice.filter((f) => !gSet.has(dir(f)));
  const goodsNoInvoice = goods.filter((f) => !iSet.has(dir(f)));
  if (invoiceNoGoods.length)
    add("R4", "红", invoiceNoGoods.flatMap((f) => [f.from, f.to]), "有票无货：票流无对应货物/服务流——进销不匹配 / 虚开。");
  if (goodsNoInvoice.length)
    add("R4", "黄", goodsNoInvoice.flatMap((f) => [f.from, f.to]), "有货无票：货物/服务流无对应票流——进销不匹配，需补票据核实。");

  // R5 资金路径洁净：非交易第三方 / 只在资金流中过桥的中转方
  const onlyMoney = tx.parties.filter((p) => {
    const inMoney = money.some((f) => f.from === p.id || f.to === p.id);
    const inOther = [...goods, ...invoice, ...contract].some((f) => f.from === p.id || f.to === p.id);
    return inMoney && !inOther;
  }).map((p) => p.id);
  const passThrough = onlyMoney.filter((id) => payers.has(id) && payees.has(id));
  const declaredThird = tx.parties.filter((p) => p.roles?.includes("非交易第三方")).map((p) => p.id);
  const r5 = [...new Set([...passThrough, ...declaredThird])];
  if (r5.length) add("R5", "红", r5, "资金流经非交易第三方 / 过桥归集——资金池 / 变相融资 / 支付牌照缺失。");

  // R1 四流闭合：收到资金但既非签约方、也不供货
  const r1 = [...payees].filter((id) => !contractParties.has(id) && !shippers.has(id));
  if (r1.length) add("R1", "红", r1, "收到资金但既非签约方、也不提供货物/服务——资金空转 / 走单。");

  // R6 三流 vs 四流：合同流存在且已检出名实分离 → 合同流露馅
  if (contract.length && (r2.length || r3.length))
    add("R6", "红", [...new Set([...r2, ...r3])], "仅看资金/货物/票三流貌似闭合，叠加合同流后签约主体与收款/发货/开票主体错位——名实分离露馅。");

  // R7 时点 / 周期
  if (tx.timing && timingConflict(tx.timing))
    add("R7", "黄", [], "锁价时点与市场周期背离（高位锁价 / 买方市场下行）——时点风险，需按价格回落做压力测试。");

  return findings.sort((a, b) => (a.level === b.level ? 0 : a.level === "红" ? -1 : 1));
}

function timingConflict(t: Timing): boolean {
  const high = /高|涨|峰位?/.test(t.lockPrice ?? "");
  const down = /买方|下行|回落|过剩|腰斩/.test(t.marketCycle ?? "");
  return high && down;
}
