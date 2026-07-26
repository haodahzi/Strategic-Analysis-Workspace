import { describe, it, expect } from "vitest";
import { buildStep0Request, mockStep0Markdown } from "./orchestrate";

describe("Step 0 · 行业定框", () => {
  it("buildStep0Request 带 model/system/行业，覆盖竞争格局/盈利公式等板块，且不强依赖严格 JSON", () => {
    const r = buildStep0Request({ industry: "算力租赁", ourRole: "资金方", lightScan: "" }, "deepseek-v4-pro");
    expect(r.model).toBe("deepseek-v4-pro");
    expect(r.system).toContain("行业研究");
    expect(r.messages[0].content).toContain("算力租赁");
    expect(r.messages[0].content).toContain("竞争格局");
    expect(r.messages[0].content).toContain("盈利公式");
    expect(r.messages[0].content).toContain("商业模式");
    expect(r.jsonSchema).toBeUndefined();     // 稳健：非 Claude 模型也不会因 JSON 解析失败退回默认
  });

  it("mockStep0Markdown 产出含各板块 ## 小标题的 markdown、引用行业名", () => {
    const md = mockStep0Markdown({ industry: "冷链物流", ourRole: "场地资源方", lightScan: "" });
    expect(md).toContain("## 竞争格局");
    expect(md).toContain("## 盈利公式");
    expect(md).toContain("## 关键企业");
    expect(md).toContain("冷链物流");
  });
});
