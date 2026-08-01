import { describe, it, expect } from "vitest";
import { queriesFor, referencesMd, searchEnabled, sourcesBlock } from "./search";
import { defaultConfig } from "../config/store";

describe("联网检索辅助（纯函数）", () => {
  it("queriesFor 按类型生成检索词，含分析主体", () => {
    expect(queriesFor({ industry: "灵巧手", ourRole: "", focus: "行业深度分析" }).join(" ")).toContain("灵巧手");
    expect(queriesFor({ industry: "机器人", ourRole: "", focus: "企业画像", company: "松延动力" }).join(" ")).toContain("松延动力");
    expect(queriesFor({ industry: "冷链", ourRole: "", focus: "项目可行性", counterparty: "某方" }).some((q) => q.includes("某方"))).toBe(true);
  });

  it("searchEnabled 需 provider=tavily 且有 key", () => {
    const c = defaultConfig();
    expect(searchEnabled(c)).toBe(false);
    expect(searchEnabled({ ...c, search: { ...c.search, provider: "tavily", apiKey: "k" } })).toBe(true);
    expect(searchEnabled({ ...c, search: { ...c.search, provider: "tavily", apiKey: "" } })).toBe(false);
  });

  it("sourcesBlock 带编号与链接；referencesMd 生成参考文献列表", () => {
    const hits = [{ title: "甲", url: "https://a.com", content: "内容A" }, { title: "乙", url: "https://b.com", content: "内容B" }];
    const b = sourcesBlock(hits);
    expect(b).toContain("[1] 甲");
    expect(b).toContain("https://a.com");
    const r = referencesMd(hits);
    expect(r).toContain("## 参考文献");
    expect(r).toContain("1. [甲](https://a.com)");
    expect(r).toContain("2. [乙](https://b.com)");
  });
});
