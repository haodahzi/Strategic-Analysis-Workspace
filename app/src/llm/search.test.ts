import { describe, it, expect } from "vitest";
import { parseHits, queriesFor, referencesMd, searchEnabled, sourcesBlock } from "./search";
import { defaultConfig } from "../config/store";

describe("联网检索辅助（纯函数）", () => {
  it("queriesFor 按类型生成检索词，含分析主体", () => {
    expect(queriesFor({ industry: "灵巧手", ourRole: "", focus: "行业深度分析" }).join(" ")).toContain("灵巧手");
    expect(queriesFor({ industry: "机器人", ourRole: "", focus: "企业画像", company: "松延动力" }).join(" ")).toContain("松延动力");
    expect(queriesFor({ industry: "冷链", ourRole: "", focus: "项目可行性", counterparty: "某方" }).some((q) => q.includes("某方"))).toBe(true);
  });

  it("searchEnabled 需选了提供商且有 key", () => {
    const c = defaultConfig();
    expect(searchEnabled(c)).toBe(false);
    expect(searchEnabled({ ...c, search: { ...c.search, provider: "tavily", apiKey: "k" } })).toBe(true);
    expect(searchEnabled({ ...c, search: { ...c.search, provider: "bocha", apiKey: "k" } })).toBe(true);
    expect(searchEnabled({ ...c, search: { ...c.search, provider: "bocha", apiKey: "" } })).toBe(false);
  });

  it("parseHits 适配博查（data.webPages.value）与 Tavily（results）两种返回", () => {
    const bocha = { code: 200, data: { webPages: { value: [{ name: "标题甲", url: "https://a.com", summary: "长摘要", snippet: "短" }] } } };
    const hb = parseHits("bocha", bocha);
    expect(hb).toEqual([{ title: "标题甲", url: "https://a.com", content: "长摘要" }]);
    const tav = { results: [{ title: "T", url: "https://b.com", content: "C" }] };
    expect(parseHits("tavily", tav)).toEqual([{ title: "T", url: "https://b.com", content: "C" }]);
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
