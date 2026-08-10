import { describe, it, expect } from "vitest";
import {
  emptyEvaluation, strategyScore, commercialScore, merchantScore, creditScore, creditRedLines,
  computeEconomics, economicsScore, riskScore, radarAxes, compositeScore, EconomicsEval,
} from "./evaluation";

describe("战略契合度评分", () => {
  it("按 MD 档位直接给分，未选为 0", () => {
    expect(strategyScore({ fitType: "中长期战略导向", note: "" })).toBe(10);
    expect(strategyScore({ fitType: "主业范围内", note: "" })).toBe(8);
    expect(strategyScore({ fitType: "边缘可关联", note: "" })).toBe(4);
    expect(strategyScore({ fitType: "非主业且无授权", note: "" })).toBe(0);
    expect(strategyScore({ fitType: "", note: "" })).toBe(0);
  });
});

describe("商业可行性 = 三项均值", () => {
  it("市场/条件/模式平均", () => {
    expect(commercialScore({ market: 8, marketNote: "", terms: 6, termsNote: "", model: 7, modelNote: "", txStructure: "" })).toBe(7);
  });
});

describe("客商资信", () => {
  it("单家 = 五类均值；红线家封顶 ≤2", () => {
    const clean = { name: "甲", type: "客户", scores: [8, 8, 8, 8, 8], redLine: false, redLineNote: "", note: "" };
    expect(merchantScore(clean)).toBe(8);
    const bad = { name: "乙", type: "供应商", scores: [9, 9, 9, 9, 9], redLine: true, redLineNote: "失信", note: "" };
    expect(merchantScore(bad)).toBe(2);
  });
  it("多家无红线取平均；有红线家拉低并可枚举", () => {
    const credit = { merchants: [
      { name: "甲", type: "客户", scores: [8, 8, 8, 8, 8], redLine: false, redLineNote: "", note: "" },
      { name: "乙", type: "供应商", scores: [6, 6, 6, 6, 6], redLine: false, redLineNote: "", note: "" },
    ] };
    expect(creditScore(credit)).toBe(7);
    credit.merchants[1].redLine = true;                       // 乙触红线 → 封顶2
    expect(creditScore(credit)).toBe(5);                      // (8 + 2)/2
    expect(creditRedLines(credit).map((m) => m.name)).toEqual(["乙"]);
  });
  it("空评价的客商不计入", () => {
    expect(creditScore(emptyEvaluation().credit)).toBe(0);
  });
});

describe("经济效益测算", () => {
  const econ = (): EconomicsEval => ({
    years: ["2025", "2026", "2027"],
    revenue: [1000, 2000, 3000], grossProfit: [300, 600, 900],
    expenses: {
      logistics: { mode: "pct", amounts: [0, 0, 0], pct: 3 },     // 3% 营收
      marketing: { mode: "pct", amounts: [0, 0, 0], pct: 4 },
      finance: { mode: "amount", amounts: [0, 0, 0], pct: 0 },    // 自动（financeAuto）
      salary: { mode: "amount", amounts: [50, 60, 70], pct: 0 },  // 定额万元
      other: { mode: "amount", amounts: [10, 10, 10], pct: 0 },
    },
    avgFund: [250, 300, 300], fundCostRate: 4, targetNetMargin: 8, financeAuto: true,
  });

  it("费用双模：%营收 vs 定额万元；财务费用自动=四项资金×率", () => {
    const rows = computeEconomics(econ());
    // 首年：物流 30 + 推广 40 + 财务 250*4%=10 + 薪酬 50 + 其他 10 = 140
    expect(rows[0].expenseTotal).toBe(140);
    expect(rows[0].expenseBreak.finance).toBe(10);
    expect(rows[0].netProfit).toBe(300 - 140);                 // 毛利 - 费用
    expect(Math.round(rows[0].netMargin)).toBe(16);            // 160/1000
  });
  it("资产报酬率 / 四项资金周转天数", () => {
    const r0 = computeEconomics(econ())[0];
    expect(Math.round(r0.roa)).toBe(64);                       // 160/250
    expect(Math.round(r0.turnoverDays)).toBe(91);             // 250*365/1000
  });
  it("评分取第1+2年平均净利率对目标净利率，达标≈6、可超10", () => {
    const e = econ();
    expect(economicsScore(e)).toBe(10);                        // 净利率远超8% → 封顶
    const weak = { ...e, grossProfit: [90, 180, 270] };        // 毛利很薄 → 净利率≈-5%
    expect(economicsScore(weak)).toBe(0);
  });
});

describe("风险可控性", () => {
  it("可控性均值；未受控翻单项封顶 ≤4；空列表为 0", () => {
    expect(riskScore({ items: [] })).toBe(0);
    const items = [
      { desc: "政策变动", control: 8, measure: "", dealBreaker: false },
      { desc: "回款风险", control: 8, measure: "", dealBreaker: false },
    ];
    expect(riskScore({ items })).toBe(8);
    items[1].dealBreaker = true; items[1].control = 3;         // 翻单项且未受控(<6)
    expect(riskScore({ items })).toBe(4);                      // 均值5.5 → 封顶4
  });
});

describe("五维雷达 + 综合分", () => {
  it("五轴齐全、等权综合", () => {
    const ev = emptyEvaluation();
    ev.strategy.fitType = "主业范围内";                         // 8
    ev.commercial = { market: 6, marketNote: "", terms: 6, termsNote: "", model: 6, modelNote: "", txStructure: "" };  // 6
    const axes = radarAxes(ev);
    expect(axes.map((a) => a.label)).toEqual(["战略契合度", "商业可行性", "主要客商资信", "经济效益", "风险可控性"]);
    expect(axes[0].value).toBe(8);
    expect(axes[1].value).toBe(6);
    expect(compositeScore(ev)).toBe(round1Avg(axes.map((a) => a.value)));
  });
});

function round1Avg(xs: number[]): number { return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10; }
