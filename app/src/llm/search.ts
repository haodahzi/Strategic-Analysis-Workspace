// 联网检索（用户自配的搜索 API，默认 Tavily）：为报告接地、给真实引用来源。
// 走 getLlmFetch（Tauri 下用 http 插件绕过 CORS）。未配 Key 时全部降级为「不联网」。
import { AppConfig } from "./types";
import { PipelineInput } from "./pipeline";
import { getLlmFetch } from "./runtime";

export interface SearchHit { title: string; url: string; content: string; }

export function searchEnabled(cfg: AppConfig): boolean {
  return cfg.search.provider === "tavily" && !!cfg.search.apiKey;
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
  const res = await fetchImpl(s.baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: s.apiKey, query, max_results: s.maxResults, search_depth: "basic" }),
  });
  if (!res.ok) throw new Error(`搜索 ${res.status}`);
  const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  return (data.results ?? [])
    .map((r) => ({ title: r.title ?? r.url ?? "", url: r.url ?? "", content: r.content ?? "" }))
    .filter((h) => h.url);
}

// 跑多条查询、按 URL 去重、上限约 10 条；单条失败不阻断整体。
export async function gatherSources(cfg: AppConfig, input: PipelineInput): Promise<SearchHit[]> {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const q of queriesFor(input)) {
    try {
      for (const h of await webSearch(cfg, q)) {
        if (!seen.has(h.url)) { seen.add(h.url); out.push(h); }
      }
    } catch { /* 跳过失败的查询 */ }
    if (out.length >= 10) break;
  }
  return out.slice(0, 10);
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
