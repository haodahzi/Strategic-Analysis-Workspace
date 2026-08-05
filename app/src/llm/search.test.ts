import { describe, it, expect } from "vitest";
import { classifyDomain, parseHits, queriesFor, referencesMd, scoreHit, searchEnabled, sourcesBlock } from "./search";
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

  it("classifyDomain：文库=junk，官方/交易所=t0，免费权威媒体=t1，付费权威=t1paid，自媒体号=low，其余=mid", () => {
    expect(classifyDomain("https://www.docin.com/p-123.html")).toBe("junk");
    expect(classifyDomain("https://max.book118.com/html/x.shtm")).toBe("junk");
    expect(classifyDomain("http://www.cninfo.com.cn/new/x")).toBe("t0");
    expect(classifyDomain("https://www.gov.cn/zhengce/x")).toBe("t0");
    expect(classifyDomain("https://www.yicai.com/news/x.html")).toBe("t1");
    expect(classifyDomain("https://www.caixin.com/2026/x.html")).toBe("t1paid");
    expect(classifyDomain("https://caifuhao.eastmoney.com/news/1")).toBe("low");
    expect(classifyDomain("https://finance.eastmoney.com/a/1.html")).toBe("mid");
  });

  it("scoreHit：有明确原始机构归因的低档域名，反超无归因无日期的高档域名（责任主体 > 域名）", () => {
    const attributedLow = { title: "存储芯片国内市场规模", url: "https://caifuhao.eastmoney.com/news/1", content: "据智研咨询发布的2025年报告，国内市场规模超过6500亿元。" };
    const bareHigh = { title: "某栏目页", url: "https://www.gov.cn/x", content: "一句没有数据、没有日期、没有归因的话。" };
    expect(scoreHit(attributedLow, "存储 规模")).toBeGreaterThan(scoreHit(bareHigh, "存储 规模"));
  });

  it("scoreHit：文库垃圾源分数为负、明显垫底", () => {
    const junk = { title: "存储行业分析报告.pdf", url: "https://www.docin.com/p-1.html", content: "存储 规模 6500亿" };
    const high = { title: "存储行业年报", url: "http://www.cninfo.com.cn/x", content: "据公告显示2025年营收618亿元" };
    expect(scoreHit(junk, "存储 规模")).toBeLessThan(0);
    expect(scoreHit(high, "存储 规模")).toBeGreaterThan(scoreHit(junk, "存储 规模"));
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
