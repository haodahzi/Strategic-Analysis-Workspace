import { describe, it, expect } from "vitest";
import { REPORT_PIPELINE, mockStageOutput, mockReport } from "./pipeline";

describe("多智能体报告流水线", () => {
  it("流水线为 规划→起草→红队→定稿→验收 五步", () => {
    expect(REPORT_PIPELINE.map((s) => s.role)).toEqual(["规划", "起草", "红队", "定稿", "验收"]);
  });

  it("每步 mock 产出非空，规划步引用行业", () => {
    const input = { industry: "算力租赁", ourRole: "资金方", focus: "行业深度分析" };
    for (const s of REPORT_PIPELINE) expect(mockStageOutput(s, input).summary.length).toBeGreaterThan(5);
    expect(mockStageOutput(REPORT_PIPELINE[0], input).summary).toContain("算力租赁");
  });

  it("mockReport：6 条验收线、含 deal-breaker 风险与 falsifiers、判断卡四段齐全", () => {
    const rep = mockReport({ industry: "算力租赁", ourRole: "资金方", focus: "行业深度分析" });
    expect(rep.acceptance.length).toBe(6);
    expect(rep.risks.some((r) => r.dealBreaker)).toBe(true);
    expect(rep.judgment.falsifiers.length).toBeGreaterThan(0);
    expect(rep.judgment.stance && rep.judgment.confidence && rep.judgment.grounds.length).toBeTruthy();
  });
});
