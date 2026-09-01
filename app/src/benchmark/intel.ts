// [对标情报] 按需刷新流水线：复用 search.ts 检索（博查+源分级+相关性门槛）+ 单家一次结构化 LLM 抽取。
import { loadConfig, providerById } from "../config/store";
import { ChatRequest } from "../llm/types";
import { SearchHit, gatherSources, searchEnabled } from "../llm/search";
import { makeClient } from "../llm/adapters";
import { getLlmFetch } from "../llm/runtime";
import { EVENT_TYPES, EventType, Importance, IntelEvent, Unit, Company, Confidence } from "./types";
import { logRefresh, mergeEvents, newEventId } from "./data";

// 每家企业的检索式：覆盖 8 类事件角度（gatherSources 会按检索预算收口）
function queriesFor(c: Company): string[] {
  const n = c.name;
  return [
    `${n} 最新 动态 公告`,
    `${n} 中标 项目 合作 大客户`,
    `${n} 融资 并购 投资 增资 战略`,
    `${n} 高管 任命 人事 组织架构 招聘`,
    `${n} 新产品 新业务 技术 专利`,
    `${n} 处罚 诉讼 风险 舆情`,
    `${n} 渠道 市场 门店 区域 扩张`,
  ];
}

const SYS = "你是严谨的竞争情报分析师。只依据给定的公开检索资料提炼事实，事实与分析（潜在影响/建议行动）严格分开、绝不混写；证据不足或无法确认主体的事件一律不输出，不杜撰。";

export function buildIntelRequest(company: string, unitName: string, hits: SearchHit[], windowDesc: string): ChatRequest {
  const src = hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.url}\n${(h.content || "").slice(0, 700)}`).join("\n\n");
  const user =
    `下面是关于对标企业「${company}」（对应我方业务单元：${unitName}）的公开检索资料（编号 [n]）。请提炼该企业在【${windowDesc}】内、值得关注的独立事件，只输出一个 JSON（不要解释、不要 markdown 代码块）。\n` +
    `要求：① 同一事件的多篇转载合并为一条、聚合来源编号；② 事件类型限定 8 类之一：${EVENT_TYPES.join(" / ")}；③ 重要性三级 重大/重要/一般（综合影响范围、变化强度、来源可信度、与我方业务相关性、新颖性）；④ facts 只写来源支持的事实、不含推测；⑤ impact/action 是你对我方业务单元的分析；⑥ confidence 高/中/低（官方 / 监管披露最高、多源交叉更高、日期不确定降低）；⑦ 不在窗口内 / 证据不足 / 无法确认是该企业的，不要输出。\n` +
    `JSON 结构：{"events":[{"title":"一句话事件","type":"8类之一","importance":"重大/重要/一般","occurTime":"YYYY-MM或YYYY-MM-DD(发生时间,不确定留空)","publishTime":"YYYY-MM-DD","facts":"公开事实","impact":"对本单元潜在影响","action":"建议行动","confidence":"高/中/低","confidenceBasis":"依据一句","sourceIdx":[来源编号]}]}\n无值得关注的事件则输出 {"events":[]}。\n\n检索资料：\n${src.slice(0, 60000)}`;
  return { model: "", system: SYS, messages: [{ role: "user", content: user }], maxTokens: 8000, disableThinking: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tryJson(text: string): any {
  try { return JSON.parse(text); } catch { /* 截取 */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* ignore */ } }
  return null;
}
function hostName(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url.slice(0, 30); } }
const asType = (s: string): EventType => (EVENT_TYPES.includes(s as EventType) ? (s as EventType) : "战略与经营");
const asImp = (s: string): Importance => (s === "重大" || s === "重要" ? s : "一般");
const asConf = (s: string): Confidence => (s === "高" || s === "低" ? s : "中");

export function parseIntel(text: string, hits: SearchHit[], unitId: string, companyId: string, company: string, month: string): IntelEvent[] {
  const j = tryJson(text);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr: any[] = j && Array.isArray(j.events) ? j.events : [];
  const out: IntelEvent[] = [];
  for (const e of arr) {
    const title = String(e?.title ?? "").trim();
    if (!title) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idxs: number[] = Array.isArray(e?.sourceIdx) ? e.sourceIdx.map((x: any) => parseInt(String(x).replace(/[^\d]/g, ""), 10)).filter((n: number) => n >= 1 && n <= hits.length) : [];
    const sources = (idxs.length ? idxs : [1]).map((n) => hits[n - 1]).filter(Boolean).map((h) => ({ url: h.url, name: hostName(h.url) }));
    const occur = String(e?.occurTime ?? "").trim();
    const publish = String(e?.publishTime ?? "").trim();
    out.push({
      id: newEventId(), unitId, companyId, company, title,
      type: asType(String(e?.type ?? "")), importance: asImp(String(e?.importance ?? "")),
      occurTime: occur, publishTime: publish,
      facts: String(e?.facts ?? "").trim(), impact: String(e?.impact ?? "").trim(), action: String(e?.action ?? "").trim(),
      confidence: asConf(String(e?.confidence ?? "")), confidenceBasis: String(e?.confidenceBasis ?? "").trim(),
      sources, month: (occur || publish || month).slice(0, 7) || month, createdAt: new Date().toISOString(),
    });
  }
  return out;
}

// 刷新一个业务单元（backfill=true 时按近 7 天首次回填，否则本月）
export async function refreshUnit(unit: Unit, month: string, backfill: boolean, onProgress?: (msg: string) => void): Promise<{ count: number }> {
  const cfg = loadConfig();
  if (!searchEnabled(cfg)) throw new Error("未配置联网检索（博查）——到「设置 → 数据源」填检索 API 后再刷新。");
  const agent = cfg.agents["资料"]; const prov = providerById(cfg, agent.provider);
  if (prov.id === "mock") throw new Error("「资料」未配置真实模型——到「设置」为「资料」配置一款模型后再刷新。");
  const fetchImpl = await getLlmFetch();
  const windowDesc = backfill ? "近 7 天" : `本月（${month}）`;
  const active = unit.companies.filter((c) => c.active);
  const all: IntelEvent[] = [];
  for (let i = 0; i < active.length; i++) {
    const c = active[i];
    onProgress?.(`检索 ${c.name}（${i + 1}/${active.length}）…`);
    let hits: SearchHit[] = [];
    try { hits = await gatherSources(cfg, { industry: "", ourRole: "", focus: "对标情报", company: c.name }, queriesFor(c), [c.name, ...c.aliases]); } catch { hits = []; }
    if (!hits.length) continue;
    onProgress?.(`解析 ${c.name}（${i + 1}/${active.length}）…`);
    try {
      const res = await makeClient(prov, fetchImpl).send({ ...buildIntelRequest(c.name, unit.name, hits, windowDesc), model: agent.model });
      if (res.text.trim()) all.push(...parseIntel(res.text, hits, unit.id, c.id, c.name, month));
    } catch { /* 单家失败不阻断整体 */ }
  }
  const count = mergeEvents(unit.id, month, all);
  logRefresh({ unitId: unit.id, month, at: new Date().toISOString(), count });
  return { count };
}
