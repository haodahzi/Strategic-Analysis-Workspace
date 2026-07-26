import { describe, it, expect } from "vitest";
import { buildStep0Request, mockStep0Markdown } from "./orchestrate";

describe("Step 0 · 行业定框", () => {
  it("buildStep0Request 覆盖投研通用方法论（五力/TAM/生命周期/价值链）且不强依赖严格 JSON", () => {
    const r = buildStep0Request({ industry: "算力租赁", ourRole: "资金方", lightScan: "" }, "deepseek-v4-pro");
    expect(r.model).toBe("deepseek-v4-pro");
    expect(r.system).toContain("行业研究");
    const c = r.messages[0].content;
    expect(c).toContain("算力租赁");
    expect(c).toContain("波特五力");
    expect(c).toContain("TAM");
    expect(c).toContain("生命周期");
    expect(c).toContain("价值链");
    expect(r.jsonSchema).toBeUndefined();     // 稳健：非 Claude 模型也不会因 JSON 解析失败退回默认
  });

  it("mockStep0Markdown 产出含标准板块 ## 小标题的 markdown、引用行业名", () => {
    const md = mockStep0Markdown({ industry: "冷链物流", ourRole: "场地资源方", lightScan: "" });
    expect(md).toContain("## 竞争格局（波特五力）");
    expect(md).toContain("## 市场规模与增长");
    expect(md).toContain("## 商业模式与盈利公式");
    expect(md).toContain("冷链物流");
  });
});
