// 联网检索（用户自配的搜索 API，默认 Tavily）：为报告接地、给真实引用来源。
// 走 getLlmFetch（Tauri 下用 http 插件绕过 CORS）。未配 Key 时全部降级为「不联网」。
import { AppConfig, SearchConfig } from "./types";
import { PipelineInput } from "./pipeline";
import { getLlmFetch } from "./runtime";

export interface SearchHit { title: string; url: string; content: string; }

export function searchEnabled(cfg: AppConfig): boolean {
  return cfg.search.provider !== "none" && !!cfg.search.apiKey;
}

// 各家搜索 API 的默认 EndPoint（在设置里切换提供商时自动带出）
export const SEARCH_ENDPOINTS: Record<SearchConfig["provider"], string> = {
  none: "",
  tavily: "https://api.tavily.com/search",
  bocha: "https://api.bocha.cn/v1/web-search",
};

// 纯解析：各家响应 JSON → 命中列表（可单测）。
export function parseHits(provider: SearchConfig["provider"], json: unknown): SearchHit[] {
  const j = json as Record<string, unknown>;
  if (provider === "bocha") {
    // 博查（Bing 风格）：data.webPages.value[] { name, url, snippet, summary }
    const data = (j?.data ?? j) as Record<string, unknown> | undefined;
    const webPages = data?.webPages as { value?: Array<Record<string, unknown>> } | undefined;
    const val = webPages?.value ?? [];
    return val.map((r) => ({ title: String(r.name ?? r.title ?? r.url ?? ""), url: String(r.url ?? ""), content: String(r.summary ?? r.snippet ?? "") })).filter((h) => h.url);
  }
  // tavily：results[] { title, url, content }
  const results = (j?.results as Array<Record<string, unknown>>) ?? [];
  return results.map((r) => ({ title: String(r.title ?? r.url ?? ""), url: String(r.url ?? ""), content: String(r.content ?? "") })).filter((h) => h.url);
}

// 按分析类型生成几条检索词（纯函数、可测）
export function queriesFor(input: PipelineInput): string[] {
  const subj = input.company || input.industry;
  const f = input.focus || "";
  if (f.includes("企业")) return [`${subj} 公司简介 主营业务`, `${subj} 营收 财务 数据`, `${subj} 融资 股东 团队`, `${subj} 行业地位 竞争对手`];
  if (f.includes("项目")) return [`${input.industry} 行业现状 规模`, `${input.industry} 政策 监管 准入`, `${input.counterparty || subj} 背景 资质`, `${input.industry} 风险 案例`];
  return [`${subj} 行业现状 市场规模`, `${subj} 竞争格局 主要企业`, `${subj} 产业链 上中下游`, `${subj} 政策 趋势 前景`];
}

export async function webSearch(cfg: AppConfig, query: string): Promise<SearchHit[]> {
  const s = cfg.search;
  const fetchImpl = await getLlmFetch();
  const headers: Record<string, string> = { "content-type": "application/json" };
  let body: string;
  if (s.provider === "bocha") {
    // 博查：Bearer 鉴权，summary 取长摘要（利于识别归因），freshness 控时间范围。
    // 博查按「查询次数」计费而非结果数：count 调大（单次最多 50）→ 更大候选池 + 狠排序换质量，费用不变。
    headers.authorization = `Bearer ${s.apiKey ?? ""}`;
    const pool = Math.min(50, Math.max(s.maxResults || 10, 20));
    body = JSON.stringify({ query, count: pool, summary: true, freshness: s.freshness || "noLimit" });
  } else {
    // tavily：api_key 放 body
    body = JSON.stringify({ api_key: s.apiKey, query, max_results: s.maxResults, search_depth: "basic" });
  }
  const res = await fetchImpl(s.baseUrl, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`搜索 ${res.status}`);
  return parseHits(s.provider, await res.json());
}

// —— 源质量打分（第一层：域名先验 + 摘要级归因信号，不打开页面）——
// 理念：域名只是第一道筛子，最终看「内容责任主体」。低档域名若正文明确归因到原始机构
// （如「据智研咨询…」），可反超无归因、无日期的高档域名。以下清单可按需增删。

// 分级理念：权威≠够得着。博查只能返回「免费+网页可达」的源；付费墙（券商研报/Wind/彭博/
// 财新付费）正文取不到，给域名加权是白费——它们的价值靠下面 AUTH_ORG「责任主体归因」从免费页捞。
// 数据终端（Wind/同花顺/Choice）网页搜不到，不进清单。清单集中于此，可按需增删。

// 文库转存 / 内容农场 / 纯 UGC：研报被二次上传、常付费墙，几乎无法引用 → 枪毙（保底：砍完为空则回退）。
const JUNK_DOMAINS = ["docin.com", "doc88.com", "book118.com", "renrendoc.com", "taodocs.com", "wenku.baidu.com", "doc.mbalib.com", "360doc.com", "xzbu.com", "wenmi.com", "yjbys.com"];
// 门户 / 自媒体号 / 泛 UGC：质量参差，作兜底但降权（含东财「财富号」——"域名不决定质量"的典型）。
const LOW_DOMAINS = ["sohu.com", "baijiahao.baidu.com", "toutiao.com", "zaker.com", "k.sina", "blog.", "bbs.", "tieba.baidu.com", "zhihu.com", "csdn.net", "jianshu.com", "163.com/dy", "caifuhao.eastmoney.com"];
// T0 官方监管统计 / 交易所与信披 / 企业一手源（全免费、网页可达）——.gov.cn 覆盖绝大多数官方源。
const T0_DOMAINS = [".gov.cn", "sse.com.cn", "szse.cn", "bse.cn", "neeq.com.cn", "cninfo.com.cn", "hkexnews.hk", "sec.gov"];
// T1 免费：财经媒体 / 行业协会 / 智库 / 国际免费快讯（免费、网页可达）。
const T1_FREE_DOMAINS = [".edu.cn", "yicai.com", "stcn.com", "cs.com.cn", "cnstock.com", "zqrb.cn", "21jingji.com", "eeo.com.cn", "financialnews.com.cn", "nbd.com.cn", "xinhuanet.com", "people.com.cn", "chinadaily.com.cn", "reuters.com", "cass.cn", "cciee.org.cn", "csia.net.cn", "caam.org.cn", "cpcif.org.cn", "isc.org.cn", "csia.org.cn", "ic-ceca.org.cn", "ccsa.org.cn", "semi.org"];
// T1 付费：权威但正文付费——摘要还能用，轻加权、不顶格。
const T1_PAID_DOMAINS = ["caixin.com", "bloomberg.com", "wsj.com", "ft.com"];

export function classifyDomain(url: string): "t0" | "t1" | "t1paid" | "mid" | "low" | "junk" {
  const u = (url || "").toLowerCase();
  if (JUNK_DOMAINS.some((d) => u.includes(d))) return "junk";
  if (T0_DOMAINS.some((d) => u.includes(d))) return "t0";
  if (T1_FREE_DOMAINS.some((d) => u.includes(d))) return "t1";
  if (T1_PAID_DOMAINS.some((d) => u.includes(d))) return "t1paid";
  if (LOW_DOMAINS.some((d) => u.includes(d))) return "low";
  return "mid";
}

// 归因线索：正文/标题里出现「据 / 引自 / 来源: / 援引 / 公告显示…」；原始机构名；日期；带单位的数字。
// 收紧：真正的归因短语才算，避免「数据」里的"据"误判为有归因。
const ATTRIB = /引自|援引|来源[:：]|数据来自|公告(显示|称)|(据|根据)[^。！？\n]{0,12}(报告|数据|研究院|咨询|证券|统计|机构|公告|指数|白皮书)|发布的?[^。！？\n]{0,8}(报告|指数|白皮书|数据)/;
// 权威原始机构：具名的券商/研究机构（付费源靠这里从免费页"捞"结论）+ 通用后缀兜底。
const AUTH_ORG = /中信证券|中金公司|中金|华泰证券|广发证券|申万宏源|招商证券|国泰海通|银河证券|中信建投|IDC|Mysteel|钢联|卓创|艾瑞|头豹|灼识|沙利文|Gartner|Canalys|Counterpoint|TrendForce|集邦|Omdia|彭博|Bloomberg|财新|[一-龥A-Za-z]{2,12}(研究院|咨询|证券|数据中心|统计局|交易所|工信部|发改委|信通院|人民银行|大学|研究所)/;
const HAS_DATE = /20\d{2}\s*[-/年.]/;
const HAS_FIG = /\d[\d,.]*\s*(亿|万|%|％|元|美元|倍|个百分点)/;

// 一条命中的质量分：域名先验 + 归因/数据信号 + 查询词覆盖。分越高越靠前。
export function scoreHit(hit: SearchHit, query: string): number {
  const text = `${hit.title} ${hit.content}`;
  const cls = classifyDomain(hit.url);
  let s = cls === "t0" ? 4 : cls === "t1" ? 3 : cls === "t1paid" ? 1 : cls === "low" ? -2 : cls === "junk" ? -6 : 0;
  const attributed = ATTRIB.test(text);
  const dated = HAS_DATE.test(text);
  const fig = HAS_FIG.test(text);
  if (attributed) s += 2;                       // 明确归因 → 低档域名也能提档（责任主体 > 域名）
  if (AUTH_ORG.test(text)) s += 1;              // 命中权威原始机构
  if (dated) s += 1;
  if (fig) s += 1;
  if (!attributed && !dated && !fig) s -= 2;    // 无归因、无日期、无数据 → 降档（哪怕高档域名）
  const terms = query.split(/\s+/).filter((w) => w.length >= 2);
  s += Math.min(terms.filter((w) => text.includes(w)).length, 3) * 0.5;   // 轻量相关性
  return s;
}

// 跑多条查询 → 去重（URL + 标题）→ 按质量分重排 → 砍文库/UGC 垃圾源 → 上限 20 条。单条失败不阻断整体。
export async function gatherSources(cfg: AppConfig, input: PipelineInput): Promise<SearchHit[]> {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const scored: { hit: SearchHit; score: number }[] = [];
  for (const q of queriesFor(input)) {
    try {
      for (const h of await webSearch(cfg, q)) {
        const t = h.title.replace(/\s+/g, "").toLowerCase();
        if (seenUrl.has(h.url) || (t && seenTitle.has(t))) continue;   // 同 URL 或同标题只留一条
        seenUrl.add(h.url); if (t) seenTitle.add(t);
        scored.push({ hit: h, score: scoreHit(h, q) });
      }
    } catch { /* 跳过失败的查询 */ }
  }
  // 砍垃圾源；若砍完为空（冷门题材只有文库）则回退不砍，避免零结果
  const kept = scored.filter((s) => classifyDomain(s.hit.url) !== "junk");
  const use = kept.length ? kept : scored;
  use.sort((a, b) => b.score - a.score);
  return use.slice(0, 20).map((s) => s.hit);
}

// 检索资料喂给「资料」步的块（带编号，供正文 [n] 引用）
export function sourcesBlock(hits: SearchHit[]): string {
  return "【联网检索到的资料（写作时据此，引用其结论时在句末标注对应 [编号]）】\n" +
    hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.url}\n${h.content}`).join("\n\n");
}

// 文末参考文献
export function referencesMd(hits: SearchHit[]): string {
  return "## 参考文献\n\n" + hits.map((h, i) => `${i + 1}. [${h.title || h.url}](${h.url})`).join("\n");
}
