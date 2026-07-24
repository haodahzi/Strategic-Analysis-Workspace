import { describe, it, expect } from "vitest";
import { REPORT_PIPELINE, mockStageOutput, mockReport, buildStageRequest } from "./pipeline";

describe("多智能体报告流水线", () => {
  it("流水线为 规划→资料→起草→红队→定稿→验收 六步", () => {
    expect(REPORT_PIPELINE.map((s) => s.role)).toEqual(["规划", "资料", "起草", "红队", "定稿", "验收"]);
  });

  it("每步 mock 产出非空，规划步引用行业", () => {
    const input = { industry: "算力租赁", ourRole: "资金方", focus: "行业深度分析" };
    for (const s of REPORT_PIPELINE) expect(mockStageOutput(s, input).summary.length).toBeGreaterThan(5);
    expect(mockStageOutput(REPORT_PIPELINE[0], input).summary).toContain("算力租赁");
  });

  it("buildStageRequest：资料步把材料喂进 prompt，带 system 与 model", () => {
    const ctx = {
      input: { industry: "冷链物流", ourRole: "场地资源方", focus: "行业深度分析" },
      materials: "电价 0.6 元/度；库容 2 万吨",
      outputs: { plan: "骨架…" },
    };
    const stage = REPORT_PIPELINE.find((s) => s.id === "research")!;
    const req = buildStageRequest(stage, ctx, "deepseek-v4-pro");
    expect(req.model).toBe("deepseek-v4-pro");
    expect(req.system).toContain("尽调");
    expect(req.messages[0].content).toContain("电价 0.6 元/度");
    expect(req.messages[0].content).toContain("冷链物流");
  });

  it("buildStageRequest：定稿步吃到初稿与红队意见", () => {
    const ctx = {
      input: { industry: "光伏", ourRole: "牵头整合", focus: "项目可行性" },
      materials: "",
      outputs: { draft: "初稿内容X", red: "红队意见Y" },
    };
    const req = buildStageRequest(REPORT_PIPELINE.find((s) => s.id === "final")!, ctx, "m1");
    expect(req.messages[0].content).toContain("初稿内容X");
    expect(req.messages[0].content).toContain("红队意见Y");
  });

  it("mockReport：6 条验收线、含 deal-breaker 风险与 falsifiers、判断卡四段齐全", () => {
    const rep = mockReport({ industry: "算力租赁", ourRole: "资金方", focus: "行业深度分析" });
    expect(rep.acceptance.length).toBe(6);
    expect(rep.risks.some((r) => r.dealBreaker)).toBe(true);
    expect(rep.judgment.falsifiers.length).toBeGreaterThan(0);
    expect(rep.judgment.stance && rep.judgment.confidence && rep.judgment.grounds.length).toBeTruthy();
  });
});
