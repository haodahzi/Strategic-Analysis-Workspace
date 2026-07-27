import { describe, it, expect } from "vitest";
import {
  REPORT_PIPELINE, mockStageOutput, mockReport, buildStageRequest,
  buildChecklistRequest, parseChecklist, mockChecklist,
} from "./pipeline";

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

describe("洽谈清单一键生成（#5）", () => {
  it("buildChecklistRequest：有成稿时接地，带主体与标签格式说明", () => {
    const input = { industry: "算力租赁", ourRole: "资金方", focus: "项目可行性", counterparty: "某智算" };
    const req = buildChecklistRequest(input, "报告正文：命门是四流一致…", "m1");
    expect(req.model).toBe("m1");
    expect(req.messages[0].content).toContain("某智算");
    expect(req.messages[0].content).toContain("命门是四流一致");
    expect(req.messages[0].content).toContain("[要问对方]");
  });

  it("parseChecklist：认标签、吃编号/项目符号、◆ 判 deal-breaker，纯分隔行丢弃", () => {
    const items = parseChecklist(
      "1. [要查] 四流是否一致 ◆\n- [要问对方] 对方真实诉求是什么\n【待搞清】周期位置\n\n---",
    );
    expect(items.length).toBe(3);
    expect(items[0]).toMatchObject({ intent: "要查", dealBreaker: true });
    expect(items[0].text).toBe("四流是否一致");
    expect(items[1].intent).toBe("要问对方");
    expect(items[2].intent).toBe("待搞清");
  });

  it("parseChecklist：无标签行按关键词兜底归类，纯分隔符行丢弃", () => {
    const items = parseChecklist("核实对方资质\n向对方问清底线\n————");
    expect(items.map((i) => i.intent)).toEqual(["要查", "要问对方"]);
  });

  it("mockChecklist：三种类型都产出、意图取值合法、至少一条 deal-breaker", () => {
    for (const focus of ["行业深度分析", "企业画像", "项目可行性"]) {
      const items = mockChecklist({ industry: "算力租赁", ourRole: "资金方", focus, company: "甲", counterparty: "乙" });
      expect(items.length).toBeGreaterThan(3);
      expect(items.every((i) => ["要查", "要问对方", "待搞清"].includes(i.intent))).toBe(true);
      expect(items.some((i) => i.dealBreaker)).toBe(true);
    }
  });
});
