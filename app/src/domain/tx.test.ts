import { describe, it, expect } from "vitest";
import { runComplianceRules, TxStructure, RuleId } from "./tx";

const rules = (tx: TxStructure): RuleId[] => runComplianceRules(tx).map((f) => f.rule);

describe("合规规则引擎 R1–R7", () => {
  it("闭合、主体一致的干净结构：无红灯", () => {
    const tx: TxStructure = {
      parties: [
        { id: "a", name: "甲", roles: ["签约主体"] },
        { id: "b", name: "乙", roles: ["签约主体"] },
      ],
      flows: [
        { id: "c", type: "合同流", from: "a", to: "b" },
        { id: "m", type: "资金流", from: "a", to: "b" },
        { id: "g", type: "货物服务流", from: "b", to: "a" },
        { id: "i", type: "票流", from: "b", to: "a" },
      ],
    };
    expect(runComplianceRules(tx)).toHaveLength(0);
  });

  it("R2 收款主体≠签约主体（代收代付）→ 触发 R2、R1、R6", () => {
    const tx: TxStructure = {
      parties: [
        { id: "a", name: "甲" }, { id: "b", name: "乙" }, { id: "c", name: "丙(关联收款)" },
      ],
      flows: [
        { id: "k", type: "合同流", from: "a", to: "b" },
        { id: "m", type: "资金流", from: "a", to: "c" }, // 钱付给合同外的丙
        { id: "g", type: "货物服务流", from: "b", to: "a" },
        { id: "i", type: "票流", from: "b", to: "a" },
      ],
    };
    const r = rules(tx);
    expect(r).toContain("R2");
    expect(r).toContain("R1");
    expect(r).toContain("R6"); // 合同流叠加后露馅
  });

  it("R3 发货/开票主体不在签约主体中（走单）", () => {
    const tx: TxStructure = {
      parties: [{ id: "a", name: "甲" }, { id: "b", name: "乙" }, { id: "d", name: "丁(实际发货)" }],
      flows: [
        { id: "k", type: "合同流", from: "a", to: "b" },
        { id: "m", type: "资金流", from: "a", to: "b" },
        { id: "g", type: "货物服务流", from: "d", to: "a" }, // 丁发货但不在合同里
        { id: "i", type: "票流", from: "d", to: "a" },
      ],
    };
    expect(rules(tx)).toContain("R3");
  });

  it("R4 有票无货 → 红灯", () => {
    const tx: TxStructure = {
      parties: [{ id: "a", name: "甲", roles: ["签约主体"] }, { id: "b", name: "乙", roles: ["签约主体"] }],
      flows: [
        { id: "k", type: "合同流", from: "a", to: "b" },
        { id: "m", type: "资金流", from: "a", to: "b" },
        { id: "i", type: "票流", from: "b", to: "a" }, // 有票，但无对应货物流
      ],
    };
    const findings = runComplianceRules(tx);
    expect(findings.some((f) => f.rule === "R4" && f.level === "红")).toBe(true);
  });

  it("R5 资金过桥的非交易第三方 → 红灯", () => {
    const tx: TxStructure = {
      parties: [
        { id: "a", name: "甲", roles: ["签约主体"] },
        { id: "b", name: "乙", roles: ["签约主体"] },
        { id: "x", name: "过桥壳公司" },
      ],
      flows: [
        { id: "k", type: "合同流", from: "a", to: "b" },
        { id: "m1", type: "资金流", from: "a", to: "x" },
        { id: "m2", type: "资金流", from: "x", to: "b" }, // x 只在资金流里既收又付=过桥
        { id: "g", type: "货物服务流", from: "b", to: "a" },
        { id: "i", type: "票流", from: "b", to: "a" },
      ],
    };
    expect(rules(tx)).toContain("R5");
  });

  it("R7 高位锁价 + 买方市场下行 → 时点黄灯", () => {
    const tx: TxStructure = {
      parties: [{ id: "a", name: "甲", roles: ["签约主体"] }, { id: "b", name: "乙", roles: ["签约主体"] }],
      flows: [
        { id: "k", type: "合同流", from: "a", to: "b" },
        { id: "m", type: "资金流", from: "a", to: "b" },
        { id: "g", type: "货物服务流", from: "b", to: "a" },
        { id: "i", type: "票流", from: "b", to: "a" },
      ],
      timing: { lockPeriod: "3年闭口", lockPrice: "高位锁价", marketCycle: "买方市场价格下行" },
    };
    const findings = runComplianceRules(tx);
    expect(findings.some((f) => f.rule === "R7" && f.level === "黄")).toBe(true);
  });

  it("红灯排在黄灯前", () => {
    const tx: TxStructure = {
      parties: [{ id: "a", name: "甲" }, { id: "b", name: "乙" }, { id: "c", name: "丙" }],
      flows: [
        { id: "k", type: "合同流", from: "a", to: "b" },
        { id: "m", type: "资金流", from: "a", to: "c" },
        { id: "g", type: "货物服务流", from: "b", to: "a" },
        { id: "i", type: "票流", from: "b", to: "a" },
      ],
      timing: { lockPrice: "高位", marketCycle: "买方下行" },
    };
    const levels = runComplianceRules(tx).map((f) => f.level);
    const firstYellow = levels.indexOf("黄");
    const lastRed = levels.lastIndexOf("红");
    if (firstYellow !== -1 && lastRed !== -1) expect(lastRed).toBeLessThan(firstYellow);
  });
});
