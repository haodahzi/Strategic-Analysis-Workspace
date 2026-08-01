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
    // 博查：Bearer 鉴权，count 控制条数，summary 取长摘要，freshness 控时间范围
    headers.authorization = `Bearer ${s.apiKey ?? ""}`;
    body = JSON.stringify({ query, count: s.maxResults, summary: true, freshness: s.freshness || "noLimit" });
  } else {
    // tavily：api_key 放 body
    body = JSON.stringify({ api_key: s.apiKey, query, max_results: s.maxResults, search_depth: "basic" });
  }
  const res = await fetchImpl(s.baseUrl, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`搜索 ${res.status}`);
  return parseHits(s.provider, await res.json());
}

// 跑多条查询、按 URL + 标题双重去重（干掉重复标题）、上限约 20 条；单条失败不阻断整体。
export async function gatherSources(cfg: AppConfig, input: PipelineInput): Promise<SearchHit[]> {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: SearchHit[] = [];
  const cap = 20;
  for (const q of queriesFor(input)) {
    try {
      for (const h of await webSearch(cfg, q)) {
        const t = h.title.replace(/\s+/g, "").toLowerCase();
        if (seenUrl.has(h.url) || (t && seenTitle.has(t))) continue;   // 同 URL 或同标题只留一条
        seenUrl.add(h.url); if (t) seenTitle.add(t);
        out.push(h);
      }
    } catch { /* 跳过失败的查询 */ }
    if (out.length >= cap) break;
  }
  return out.slice(0, cap);
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
