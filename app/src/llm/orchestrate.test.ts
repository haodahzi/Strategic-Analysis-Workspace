import { describe, it, expect } from "vitest";
import { buildStep0Request, mockStep0Markdown } from "./orchestrate";

describe("Step 0 · 行业定框", () => {
  it("buildStep0Request 面向决策、内化方法（不贴框架名）、不强依赖严格 JSON", () => {
    const r = buildStep0Request({ industry: "算力租赁", ourRole: "资金方", lightScan: "" }, "deepseek-v4-pro");
    expect(r.model).toBe("deepseek-v4-pro");
    expect(r.system).toContain("资深分析师");
    const c = r.messages[0].content;
    expect(c).toContain("算力租赁");
    expect(c).toContain("利润池");
    expect(c).toContain("护城河");
    expect(c).toContain("命门");
    expect(c).toContain("资金方");
    expect(r.jsonSchema).toBeUndefined();     // 稳健：非 Claude 模型也不会因 JSON 解析失败退回默认
  });

  it("mockStep0Markdown 决策式板块、不含教科书框架名、引用行业与角色", () => {
    const md = mockStep0Markdown({ industry: "冷链物流", ourRole: "场地资源方", lightScan: "" });
    expect(md).toContain("## 这门生意的本质");
    expect(md).toContain("## 价值链与利润池");
    expect(md).toContain("## 对我方的含义");
    expect(md).toContain("冷链物流");
    expect(md).toContain("场地资源方");
    expect(md).not.toContain("PEST");
    expect(md).not.toContain("波特五力");
  });
});
