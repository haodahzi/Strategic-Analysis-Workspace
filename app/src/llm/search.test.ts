import { describe, it, expect } from "vitest";
import {
  buildQueryGenRequest, classifyDomain, coreTitle, freshnessScore, latestYear, matchesSubject, parseAliases,
  parseHits, parseQueries, queriesFor, referencesMd, scoreHit, searchEnabled, searchRequest, sourcesBlock, subjectTerms,
} from "./search";
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

  it("sourcesBlock 带编号与链接；referencesMd 生成参考资料列表", () => {
    const hits = [{ title: "甲", url: "https://a.com", content: "内容A" }, { title: "乙", url: "https://b.com", content: "内容B" }];
    const b = sourcesBlock(hits);
    expect(b).toContain("[1] 甲");
    expect(b).toContain("https://a.com");
    const r = referencesMd(hits);
    expect(r).toContain("## 参考资料");
    expect(r).toContain("1. [甲](https://a.com)");
    expect(r).toContain("2. [乙](https://b.com)");
  });
});

describe("B1 检索词生成（模型主路径 + 硬化模板兜底）", () => {
  it("queriesFor：企业类每条焊入行业词消歧同名公司，多角度", () => {
    const co = queriesFor({ industry: "机器人", ourRole: "", focus: "企业画像", company: "松延动力" });
    expect(co.length).toBeGreaterThanOrEqual(6);
    expect(co.every((q) => q.includes("松延动力") && q.includes("机器人"))).toBe(true);
  });

  it("buildQueryGenRequest：带主体、上限 N、企业类要求带行业词消歧，system 为检索策略", () => {
    const req = buildQueryGenRequest({ industry: "机器人", ourRole: "", focus: "企业画像", company: "松延动力" }, "m1", 12);
    expect(req.model).toBe("m1");
    expect(req.messages[0].content).toContain("松延动力");
    expect(req.messages[0].content).toContain("最多 12 条");
    expect(req.messages[0].content).toContain("机器人");   // 消歧提示
    expect(req.system).toContain("检索");
  });

  it("parseQueries：去编号/项目符号/引号/标签、丢整句解释、去重", () => {
    const raw = [
      "1. 松延动力 机器人 简介",
      "- 松延动力 机器人 营收 利润",
      "「松延动力 机器人 简介」",                         // 去重后与第 1 条重复
      "检索式：松延动力 机器人 股东",
      "这是一句解释性的话，不应作为检索式出现在结果里。",   // 整句 → 丢
      "松延动力 机器人 客户",
    ].join("\n");
    const qs = parseQueries(raw, 10);
    expect(qs).toContain("松延动力 机器人 简介");
    expect(qs).toContain("松延动力 机器人 股东");         // 标签「检索式：」被剥掉
    expect(qs.filter((q) => q === "松延动力 机器人 简介").length).toBe(1);   // 去重
    expect(qs.some((q) => q.includes("解释性"))).toBe(false);                // 整句被丢
  });

  it("parseQueries：上限截断——超过 N 条只取前 N（不足不补由调用方保证）", () => {
    const raw = Array.from({ length: 12 }, (_, i) => `词${i} 角度`).join("\n");
    expect(parseQueries(raw, 8).length).toBe(8);
  });
});

describe("B4 新鲜度分档（根治 2021 老数据与 2026 同分）", () => {
  const now = new Date("2026-08-06");

  it("latestYear：取正文最新年份，无则 null", () => {
    expect(latestYear("2021年发布，2025年更新")).toBe(2025);
    expect(latestYear("没有年份")).toBe(null);
  });

  it("freshnessScore：近1年+2 / 2–3年+1 / 4–5年-1 / 更老·无日期-2", () => {
    expect(freshnessScore("2025年数据", now, "noLimit")).toBe(2);
    expect(freshnessScore("2023年数据", now, "noLimit")).toBe(1);
    expect(freshnessScore("2021年数据", now, "noLimit")).toBe(-1);
    expect(freshnessScore("2016年数据", now, "noLimit")).toBe(-2);
    expect(freshnessScore("无日期文本", now, "noLimit")).toBe(-2);
  });

  it("freshnessScore：时间范围档软收紧——超窗内容再压 1 分（不硬删）", () => {
    expect(freshnessScore("2021年数据", now, "threeYears")).toBe(-2);   // -1 再 -1
    expect(freshnessScore("2025年数据", now, "threeYears")).toBe(2);    // 窗内不压
    expect(freshnessScore("2024年数据", now, "oneYear")).toBeLessThan(freshnessScore("2024年数据", now, "noLimit"));
  });

  it("scoreHit：同源同归因，新料排在旧料前", () => {
    const fresh = { title: "市场规模", url: "https://www.yicai.com/a", content: "据某研究院2025年报告 规模超6500亿元" };
    const stale = { title: "市场规模", url: "https://www.yicai.com/b", content: "据某研究院2020年报告 规模超6500亿元" };
    expect(scoreHit(fresh, "市场 规模", { now, timeRange: "threeYears" }))
      .toBeGreaterThan(scoreHit(stale, "市场 规模", { now, timeRange: "threeYears" }));
  });
});

describe("P0 相关性门槛（主体名 + 模型补的别名）", () => {
  it("parseAliases：解析「别名：…」行，逗号 / 顿号分隔；无 / 缺行则空", () => {
    expect(parseAliases("别名：DeepSeek、深度求索、幻方DeepSeek\n深度求索 简介")).toEqual(["DeepSeek", "深度求索", "幻方DeepSeek"]);
    expect(parseAliases("别名：无\n算力租赁 规模")).toEqual([]);
    expect(parseAliases("算力租赁 规模\n算力租赁 政策")).toEqual([]);   // 没有别名行
  });

  it("subjectTerms：企业=公司名+别名，行业=行业名+别名，去重", () => {
    expect(subjectTerms({ industry: "AI", ourRole: "", focus: "企业画像", company: "深度求索" }, ["DeepSeek"]))
      .toEqual(["深度求索", "DeepSeek"]);
    expect(subjectTerms({ industry: "算力租赁", ourRole: "", focus: "行业深度分析" }, []))
      .toEqual(["算力租赁"]);
  });

  it("matchesSubject：命中主体名 / 别名（去空格大小写归一）才算相关，治理「别家公司」噪音", () => {
    const terms = ["深度求索", "DeepSeek"];
    expect(matchesSubject({ title: "DeepSeek 紧急声明", url: "u", content: "…" }, terms)).toBe(true);
    expect(matchesSubject({ title: "深度求索 人才库", url: "u", content: "…" }, terms)).toBe(true);
    expect(matchesSubject({ title: "浩瀚深度(688292)三季报", url: "u", content: "净利润下降" }, terms)).toBe(false);
    expect(matchesSubject({ title: "任意", url: "u", content: "x" }, [])).toBe(true);   // 无词表 → 不过滤
  });

  it("buildQueryGenRequest：要求先给别名行（用户往往说不出别名，交给模型补）", () => {
    const req = buildQueryGenRequest({ industry: "AI", ourRole: "", focus: "企业画像", company: "深度求索" }, "m1", 10);
    expect(req.messages[0].content).toContain("别名");
    expect(req.system).toContain("别名");
  });
});

describe("参考资料去重（coreTitle 剥站点尾巴）", () => {
  it("同一标题被不同站点转载（只差 _栏目 / - 站点）→ 归一为同一核心标题", () => {
    const a = "【存储芯片】行业市场规模:2024年市场规模将达1671亿美元 DRAM占比56.8%_行业研究报告 - 前瞻网";
    const b = "【存储芯片】行业市场规模:2024年市场规模将达1671亿美元 DRAM占比56.8%_经济学人 - 手机前瞻网";
    const c = "【存储芯片】行业市场规模:2024年市场规模将达1671亿美元 DRAM占比56.8%_股票频道_证券之星";
    expect(coreTitle(a)).toBe(coreTitle(b));
    expect(coreTitle(b)).toBe(coreTitle(c));
  });
  it("全 / 半角括号与结尾「- 站点名」归一", () => {
    expect(coreTitle("2024年全球存储芯片市场规模及结构预测分析（图）"))
      .toBe(coreTitle("2024年全球存储芯片市场规模及结构预测分析(图)-中商情报网"));
  });
  it("数字 / 内容不同的标题不被误判为重复", () => {
    expect(coreTitle("2024年存储芯片市场规模约903.7亿美元_报告大厅"))
      .not.toBe(coreTitle("2024年存储芯片市场规模约5170亿元_报告大厅"));
  });
});

describe("检索请求组装（searchRequest）", () => {
  it("博查：Bearer 头 + 大候选池 count + summary；不向 API 传时间硬筛（一律 noLimit）", () => {
    const c = defaultConfig();
    const cfg = { ...c, search: { ...c.search, provider: "bocha" as const, apiKey: "k", baseUrl: "https://api.bocha.cn/v1/web-search", freshness: "oneYear" } };
    const req = searchRequest(cfg, "存储 规模");
    expect(req.headers.authorization).toBe("Bearer k");
    const body = req.body as Record<string, unknown>;
    expect(body.summary).toBe(true);
    expect(Number(body.count)).toBeGreaterThanOrEqual(20);
    expect(body.freshness).toBe("noLimit");   // 设置里选了近1年也不下发给 API（交给打分）
  });

  it("Tavily：api_key 放 body，带 max_results 与 search_depth", () => {
    const c = defaultConfig();
    const cfg = { ...c, search: { ...c.search, provider: "tavily" as const, apiKey: "tvly", baseUrl: "https://api.tavily.com/search" } };
    const req = searchRequest(cfg, "存储 规模");
    const body = req.body as Record<string, unknown>;
    expect(body.api_key).toBe("tvly");
    expect(Number(body.max_results)).toBeGreaterThanOrEqual(10);
    expect(body.search_depth).toBe("basic");
  });
});
