// 联网检索（用户自配的搜索 API，默认 Tavily）：为报告接地、给真实引用来源。
// 走 getLlmFetch（Tauri 下用 http 插件绕过 CORS）。未配 Key 时全部降级为「不联网」。
import { AppConfig, ChatRequest, HttpSpec, SearchConfig } from "./types";
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

// —— B1 检索词生成：模型主路径（buildQueryGenRequest + parseQueries）+ 硬化模板兜底（queriesFor）——
// 定位：主路径由模型按主体产出「互不重复、覆盖不同角度」的检索式；模型不可用 / mock / 失败 / 产出异常时，
// 回退到「焊入行业限定词」的硬化模板（降低同名实体串台）。二者是同一功能的两条路径，不当两件事做。

// 企业类的主体措辞：把行业词焊进去消歧（松延动力 机器人 …），避免同名公司串台。
function companySubject(input: PipelineInput): string {
  const co = input.company || input.industry;
  const ind = input.industry && input.industry !== co ? input.industry : "";
  return ind ? `${co} ${ind}` : co;
}

// 兜底基线（硬化模板）：按类型给 ~8 个不同角度、行业限定已焊入；调用方再按 maxQueries 收口。
export function queriesFor(input: PipelineInput): string[] {
  const f = input.focus || "";
  if (f.includes("企业")) {
    const s = companySubject(input);
    return [`${s} 公司简介 主营业务`, `${s} 营收 利润 财务数据`, `${s} 实控人 股东 股权`, `${s} 主要客户 订单 集中度`,
      `${s} 竞争对手 行业地位`, `${s} 诉讼 处罚 合规`, `${s} 技术 研发 产品`, `${s} 年报 公告 官网`];
  }
  if (f.includes("项目")) {
    const ind = input.industry, who = input.counterparty || ind;
    return [`${ind} 行业准入 政策 门槛`, `${ind} 资质 牌照 合规红线`, `${who} 背景 资质 实力`, `${ind} 投资 成本 回收周期`,
      `${ind} 风险 违约 案例`, `${ind} 交易结构 合作模式`, `${ind} 市场规模 现状`, `${ind} 龙头 竞争格局`];
  }
  const ind = input.industry;
  return [`${ind} 市场规模 增速`, `${ind} 产业链 上中下游`, `${ind} 竞争格局 集中度`, `${ind} 政策 监管 规划`,
    `${ind} 技术 路线 趋势`, `${ind} 需求 应用 下游`, `${ind} 龙头企业`, `${ind} 统计公报 协会 白皮书`];
}

// 主路径：让模型为本主体设计最多 max 条互不重复、覆盖不同角度的检索式（纯函数，返回请求）。
export function buildQueryGenRequest(input: PipelineInput, model: string, max: number): ChatRequest {
  const f = input.focus || "";
  const isCo = f.includes("企业"), isDeal = f.includes("项目");
  const subj = isCo ? (input.company || input.industry) : input.industry;
  const kind = isCo ? "公司" : isDeal ? "项目 / 交易" : "行业";
  const angles = isCo
    ? "公司简介与主营、营收与财务、实控人与股东、主要客户与订单集中度、竞争对手与行业地位、诉讼与处罚与合规、技术与研发与产品、产能与在建、融资、一手源（年报 / 公告 / 官网）"
    : isDeal
      ? "行业准入与政策门槛、资质牌照与合规红线、对方背景与资质、投资成本与回收、风险与违约案例、交易结构与合作模式、市场规模与现状、一手源（部委规定 / 公告）"
      : "市场规模与增速、产业链上中下游、竞争格局与集中度、政策与监管、技术与路线、需求与下游应用、商业模式、龙头企业、一手源（统计公报 / 协会 / 白皮书）";
  const dedup = isCo && input.industry && input.industry !== subj
    ? `每条都带上行业词「${input.industry}」以消歧同名公司。` : "";
  const user =
    `研究主体：「${subj}」（${kind}${isCo && input.industry ? "，行业：" + input.industry : ""}）。\n` +
    `第一行先用「别名：」列出该主体的常见别名 / 简称 / 中英文名 / 曾用名${isCo ? " / 股票代码 / 母公司或核心产品名" : ""}（逗号分隔；确无别名写「别名：无」）——用于判定检索结果是否确实在讲本主体。\n` +
    `然后设计最多 ${max} 条中文检索式，供搜索引擎为这份研究取真实资料。要求：\n` +
    `1) 每条覆盖一个不同角度、互不重复、不要近义改写；可参考这些角度：${angles}。\n` +
    `2) 每条 2–6 个关键词、空格分隔，不加标点 / 编号 / 解释；可混用主体名与其别名（如中英文名）以覆盖不同来源。\n` +
    `3) ${dedup}优先能取到一手 / 权威来源的措辞。\n` +
    `4) 若真正不同的角度不足 ${max} 个，就少给几条——不要为凑数写重复或注水的检索式。\n` +
    `第一行是别名，其后每行一条检索式、只输出检索式本身。`;
  return {
    model,
    system: "你是检索策略师：先给出研究主体的别名，再设计互不重复、覆盖不同角度的中文检索式，每行一条、不加编号或解释。",
    messages: [{ role: "user", content: user }],
    maxTokens: 500,
  };
}

// 从模型产出里解析「别名：…」行（供相关性判定；用户往往说不出别名，交给模型补）。
export function parseAliases(text: string): string[] {
  for (const raw of (text || "").replace(/\r/g, "").split("\n")) {
    const m = /^\s*(?:别名|别称|简称|alias(?:es)?)\s*[:：]\s*(.+)$/i.exec(raw.trim());
    if (m) {
      const body = m[1].trim();
      if (/^(无|没有|none|n\/?a|-|—)$/i.test(body)) return [];
      return body.split(/[，,、;；/|]+/).map((x) => x.trim()).filter((x) => x.length >= 2).slice(0, 8);
    }
  }
  return [];
}

// 相关性判定用的主体词表：主体名 + 模型补的别名（项目再加对方名）。用于砍「通用词命中别家」的噪音。
export function subjectTerms(input: PipelineInput, aliases: string[] = []): string[] {
  const f = input.focus || "";
  const primary = f.includes("企业") ? (input.company || input.industry) : input.industry;
  const extra = f.includes("项目") && input.counterparty ? [input.counterparty] : [];
  const seen = new Set<string>();
  return [primary, ...extra, ...aliases]
    .map((s) => (s || "").trim())
    .filter((s) => s.length >= 2 && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
}

// 一条命中是否确实讲的是本主体（标题/正文含任一主体词，去空格大小写归一）。
export function matchesSubject(hit: SearchHit, terms: string[]): boolean {
  if (!terms.length) return true;
  const x = `${hit.title} ${hit.content}`.replace(/\s+/g, "").toLowerCase();
  return terms.some((t) => { const n = t.replace(/\s+/g, "").toLowerCase(); return n.length >= 2 && x.includes(n); });
}

// 解析模型产出：去编号 / 项目符号 / 引号、丢空行与整句解释、规范化去重、上限 max（不足不补）。
export function parseQueries(text: string, max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of (text || "").replace(/\r/g, "").split("\n")) {
    const line = raw.trim()
      .replace(/^[-*·•]\s*/, "")
      .replace(/^\d+[.、)]\s*/, "")
      .replace(/^检索(式|词)\s*\d*\s*[:：]?\s*/, "")
      .replace(/^[「『"'`]+/, "").replace(/[」』"'`]+$/, "")
      .replace(/[。！？!?，,、;；]+$/, "")
      .trim();
    if (!line || line.length > 40 || /[。！？，；、：]/.test(line)) continue;   // 空 / 整句解释（含中文标点）→ 丢
    const norm = line.replace(/\s+/g, "").toLowerCase();
    if (norm.length < 2 || seen.has(norm)) continue;                    // 去重（去空格后比对）
    seen.add(norm);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

// 组装一条查询的 HTTP 请求（纯函数、可单测）。
// 关键（B4）：不再向 API 传时间范围硬筛——一律 noLimit 把候选全取回，时效收紧交给下面的打分，
// 免得 API「一刀切」误杀年报（年初发、覆盖上一年）与常青内容（行业本质 / 产业链 / 商业模式）。
export function searchRequest(cfg: AppConfig, query: string): HttpSpec {
  const s = cfg.search;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (s.provider === "bocha") {
    // 博查：Bearer 鉴权，summary 取长摘要（利于识别归因）。按「查询次数」计费而非结果数，
    // count 调大（单次最多 50）→ 更大候选池 + 狠排序换质量，费用不变。
    headers.authorization = `Bearer ${s.apiKey ?? ""}`;
    const pool = Math.min(50, Math.max(s.maxResults || 10, 20));
    return { url: s.baseUrl, headers, body: { query, count: pool, summary: true, freshness: "noLimit" } };
  }
  // tavily：api_key 放 body；也过取一个候选池，交给重排。
  const pool = Math.min(20, Math.max(s.maxResults || 10, 10));
  return { url: s.baseUrl, headers, body: { api_key: s.apiKey, query, max_results: pool, search_depth: "basic" } };
}

export async function webSearch(cfg: AppConfig, query: string): Promise<SearchHit[]> {
  const { url, headers, body } = searchRequest(cfg, query);
  const fetchImpl = await getLlmFetch();
  const res = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`搜索 ${res.status}`);
  return parseHits(cfg.search.provider, await res.json());
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
const T1_FREE_DOMAINS = [".edu.cn", ".ac.cn", "yicai.com", "stcn.com", "cs.com.cn", "cnstock.com", "zqrb.cn", "21jingji.com", "eeo.com.cn", "financialnews.com.cn", "nbd.com.cn", "xinhuanet.com", "people.com.cn", "chinadaily.com.cn", "reuters.com", "cass.cn", "cciee.org.cn", "csia.net.cn", "caam.org.cn", "cpcif.org.cn", "isc.org.cn", "csia.org.cn", "ic-ceca.org.cn", "ccsa.org.cn", "semi.org"];
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
const HAS_FIG = /\d[\d,.]*\s*(亿|万|%|％|元|美元|倍|个百分点)/;

// —— B4 新鲜度：分档打分，根治「有年份就 +1、2021 与 2026 同分」的老数据混入。——
// 取正文里最新的年份估算「年龄」：近1年 +2 / 2–3年 +1 / 4–5年 -1 / 更老·无日期 -2。
// 设置档（时间范围）再做一层「软收紧」：超出所选窗口再 -1（不硬删，年报/常青仍可凭其它信号浮上来）。
export function latestYear(text: string): number | null {
  const ys = (text.match(/20\d{2}/g) ?? []).map(Number).filter((y) => y >= 2000 && y <= 2099);
  return ys.length ? Math.max(...ys) : null;
}
export function freshnessScore(text: string, now: Date, timeRange: string): number {
  const year = latestYear(text);
  if (year == null) return -2;                                            // 无日期
  const age = now.getFullYear() - year;
  let s = age <= 1 ? 2 : age <= 3 ? 1 : age <= 5 ? -1 : -2;               // 近1年 / 2–3年 / 4–5年 / 更老
  const limit = timeRange === "oneYear" ? 1 : timeRange === "threeYears" ? 3 : Infinity;
  if (age > limit) s -= 1;                                                // 设置档软收紧
  return s;
}

export interface ScoreOpts { now?: Date; timeRange?: string; }

// 一条命中的质量分：域名先验 + 归因/权威机构/数据信号 + 新鲜度分档 + 查询词覆盖。分越高越靠前。
export function scoreHit(hit: SearchHit, query: string, opts: ScoreOpts = {}): number {
  const now = opts.now ?? new Date();
  const timeRange = opts.timeRange ?? "noLimit";
  const text = `${hit.title} ${hit.content}`;
  const cls = classifyDomain(hit.url);
  let s = cls === "t0" ? 4 : cls === "t1" ? 3 : cls === "t1paid" ? 1 : cls === "low" ? -2 : cls === "junk" ? -6 : 0;
  if (ATTRIB.test(text)) s += 2;                // 明确归因 → 低档域名也能提档（责任主体 > 域名）
  if (AUTH_ORG.test(text)) s += 1;              // 命中权威原始机构
  if (HAS_FIG.test(text)) s += 1;               // 带单位的数字
  s += freshnessScore(text, now, timeRange);    // 新鲜度分档（含「无日期 -2」）
  const terms = query.split(/\s+/).filter((w) => w.length >= 2);
  s += Math.min(terms.filter((w) => text.includes(w)).length, 3) * 0.5;   // 轻量相关性
  return s;
}

// B2b 质量线：重排后低于此分的直接丢——冷门题材宁少勿滥，不硬填满 maxSources。
export const SCORE_FLOOR = 0;
const CONCURRENCY = 4;   // 有界并发：N 可达 15，顺序跑会明显拖慢「资料」步
const REL_MIN = 6;       // 命中主体的够这么多，就丢掉跑题的；不够则回退补足，避免冷门 / 别名主体空手

export function queryBudget(cfg: AppConfig): number { return Math.min(15, Math.max(1, Math.round(cfg.search.maxQueries || 10))); }
export function sourceCap(cfg: AppConfig): number { return Math.min(50, Math.max(10, Math.round(cfg.search.maxSources || 50))); }

// 有界并发 map：保持输入顺序，单项失败由 fn 内部兜底（返回空），不 reject 整体。
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// 参考资料去重用「核心标题」：剥掉站点归属尾巴（_栏目_站点 / - 站点）、统一全半角与空格，
// 让「同一篇报告被不同站点二次转载」（标题只差尾巴）判为重复。纯函数、可单测。
export function coreTitle(title: string): string {
  return (title || "")
    .split(/[_|｜]/)[0]                          // 站点 / 栏目通常在第一个 _ 或 ｜ 之后
    .replace(/\s*[-–—]\s*[^-–—]{1,20}$/, "")     // 结尾「 - 站点名」也剥掉
    .replace(/（/g, "(").replace(/）/g, ")")      // 全角括号 → 半角
    .replace(/\s+/g, "")
    .toLowerCase();
}

// 跑多条查询（并发）→ 去重（URL + 核心标题）→ 按质量分重排 → 丢弃低于质量线者 → 上限 maxSources。
// queries：B1 由调用方（模型主路径）传入；缺省则回退硬化模板。均按 maxQueries 收口。
export async function gatherSources(cfg: AppConfig, input: PipelineInput, queries?: string[], terms?: string[]): Promise<SearchHit[]> {
  const budget = queryBudget(cfg);
  const qs = (queries?.length ? queries : queriesFor(input)).slice(0, budget);
  const now = new Date();
  const timeRange = cfg.search.freshness || "noLimit";

  // 每条查询并发跑；单条失败返回空、不阻断整体（结果按查询顺序对齐，便于稳定去重与相关性打分）
  const perQuery = await mapLimit(qs, CONCURRENCY, async (q) => {
    try { return await webSearch(cfg, q); } catch { return [] as SearchHit[]; }
  });

  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const scored: { hit: SearchHit; score: number }[] = [];
  for (let qi = 0; qi < qs.length; qi++) {
    for (const h of perQuery[qi]) {
      const t = coreTitle(h.title);
      if (!h.url || seenUrl.has(h.url) || (t && seenTitle.has(t))) continue;   // 同 URL 或同核心标题只留一条
      seenUrl.add(h.url); if (t) seenTitle.add(t);
      scored.push({ hit: h, score: scoreHit(h, qs[qi], { now, timeRange }) });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  // 达标线以上者优先；若砍完为空（冷门题材），回退到「非文库」保底，仍不收文库垃圾源
  const kept = scored.filter((s) => s.score >= SCORE_FLOOR);
  const nonJunk = scored.filter((s) => classifyDomain(s.hit.url) !== "junk");
  const base = kept.length ? kept : (nonJunk.length ? nonJunk : scored);
  // 相关性门槛：命中主体名 / 别名者优先；够数（≥REL_MIN）就把跑题的丢掉——治理「通用词命中别家公司」的噪音；
  // 不够则回退把跑题的补回来，避免冷门 / 别名主体空手。
  const ts = terms ?? [];
  let use = base;
  if (ts.length) {
    const rel = base.filter((s) => matchesSubject(s.hit, ts));
    use = rel.length >= REL_MIN ? rel : rel.concat(base.filter((s) => !matchesSubject(s.hit, ts)));
  }
  return use.slice(0, sourceCap(cfg)).map((s) => s.hit);   // 上限是天花板、不是保底
}

// 检索资料喂给「资料」步的块（带编号，供正文 [n] 引用）
export function sourcesBlock(hits: SearchHit[]): string {
  return "【联网检索到的资料（写作时据此，引用其结论时在句末标注对应 [编号]）】\n" +
    hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.url}\n${h.content}`).join("\n\n");
}

// 文末参考资料
export function referencesMd(hits: SearchHit[]): string {
  return "## 参考资料\n\n" + hits.map((h, i) => `${i + 1}. [${h.title || h.url}](${h.url})`).join("\n");
}
