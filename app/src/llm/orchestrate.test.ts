import { describe, it, expect } from "vitest";
import { buildStep0Request, parseStep0, mockStep0Json } from "./orchestrate";

describe("Step 0 编排", () => {
  it("buildStep0Request 带 jsonSchema / system / model / 行业", () => {
    const r = buildStep0Request({ industry: "算力租赁", ourRole: "资金方", lightScan: "" }, "claude-opus-4-8");
    expect(r.model).toBe("claude-opus-4-8");
    expect(r.jsonSchema).toBeTruthy();
    expect(r.system).toContain("决策副驾");
    expect(r.messages[0].content).toContain("算力租赁");
    expect(r.messages[0].content).toContain("资金方");
  });

  it("parseStep0 解析 ```json 围栏", () => {
    const t = "```json\n{\"coreDimensions\":[{\"key\":\"行业理解\",\"weight\":70,\"weightReason\":\"x\"}],\"industryOverlay\":[],\"reflexive\":[\"a\"]}\n```";
    const f = parseStep0(t);
    expect(f.coreDimensions[0].key).toBe("行业理解");
    expect(f.reflexive).toContain("a");
  });

  it("parseStep0 垃圾输入 → 回退 6 维", () => {
    const f = parseStep0("这不是 JSON");
    expect(f.coreDimensions.length).toBe(6);
  });

  it("mockStep0Json 产出合法 JSON、6 维、叠加层与反问齐全", () => {
    const f = parseStep0(mockStep0Json({ industry: "冷链物流", ourRole: "场地资源方", lightScan: "" }));
    expect(f.coreDimensions.length).toBe(6);
    expect(f.industryOverlay.length).toBeGreaterThan(0);
    expect(f.reflexive.length).toBeGreaterThan(0);
  });

  it("mockStep0Json 角色不同→我方角色维权重带角色名", () => {
    const f = parseStep0(mockStep0Json({ industry: "光伏", ourRole: "牵头整合", lightScan: "" }));
    const role = f.coreDimensions.find((d) => d.key === "我方角色");
    expect(role?.weightReason).toContain("牵头整合");
  });
});
