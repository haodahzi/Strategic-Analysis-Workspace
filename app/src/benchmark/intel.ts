// [对标情报] 按需刷新流水线：复用 search.ts 检索（博查+源分级+相关性门槛）+ 单家一次结构化 LLM 抽取。
import { loadConfig, providerById } from "../config/store";
import { ChatRequest } from "../llm/types";
import { SearchHit, gatherSources, searchEnabled } from "../llm/search";
import { makeClient } from "../llm/adapters";
import { getLlmFetch } from "../llm/runtime";
import { EVENT_TYPES, EventType, Importance, IntelEvent, Unit, Company, Confidence } from "./types";
import { logRefresh, mergeEvents, newEventId } from "./data";

// 每家企业的检索式：5 条覆盖 8 类事件角度（gatherSources 会按检索预算收口）。
// 收敛到 5 条是刻意的：条数×企业数=总检索次数，太多会让单次刷新明显变慢。
function queriesFor(c: Company): string[] {
  const n = c.name;
  return [
    `${n} 最新 动态 公告 战略`,
    `${n} 中标 合作 大客户 融资 并购`,
    `${n} 高管 人事 招聘 组织架构`,
    `${n} 新产品 新业务 技术 专利`,
    `${n} 处罚 诉讼 风险 舆情 扩张`,
  ];
}

// 单步超时护栏：任一步卡住（检索/模型无响应）不至于让整次刷新永远停在「进行中」。
function withTimeout<T>(p: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const done = (v: T) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => done(fallback()), ms);
    p.then(done, () => done(fallback()));
  });
}

const SYS = "你是严谨的竞争情报分析师。只依据给定的公开检索资料提炼事实，事实与分析（潜在影响/建议行动）严格分开、绝不混写；证据不足或无法确认主体的事件一律不输出，不杜撰。";

export function buildIntelRequest(company: string, unitName: string, hits: SearchHit[], windowDesc: string): ChatRequest {
  const src = hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.url}\n${(h.content || "").slice(0, 700)}`).join("\n\n");
  // 业务单元名多为内部代称（「业务单元1」这类占位），不应写进分析正文——一律以「我方」自称。
  // 若是有意义的真实名称（如「集采事业部」），仅作背景帮助模型把握影响角度，同样不逐字出现在 impact/action。
  const isPlaceholder = /^业务单元\s*\d*$/.test(unitName.trim());
  const selfNote = isPlaceholder
    ? "分析中一律以「我方」指代自身。"
    : `我方相关业务背景为「${unitName}」（仅供你把握相关性与影响角度）；impact/action 中一律用「我方」指代，不要逐字写出该名称。`;
  const user =
    `下面是关于对标企业「${company}」的公开检索资料（编号 [n]）。${selfNote}请提炼该企业在【${windowDesc}】内、值得关注的独立事件，只输出一个 JSON（不要解释、不要 markdown 代码块）。\n` +
    `要求：① 同一事件的多篇转载合并为一条、聚合来源编号；② 事件类型限定 8 类之一：${EVENT_TYPES.join(" / ")}；③ 重要性三级 重大/重要/一般（综合影响范围、变化强度、来源可信度、与我方业务相关性、新颖性）；④ facts 只写来源支持的事实、不含推测；⑤ impact/action 是你对我方的分析，一律用「我方」自称，绝不出现内部业务单元的代称或编号；⑥ confidence 高/中/低（官方 / 监管披露最高、多源交叉更高、日期不确定降低）；⑦ 不在窗口内 / 证据不足 / 无法确认是该企业的，不要输出。\n` +
    `JSON 结构：{"events":[{"title":"一句话事件","type":"8类之一","importance":"重大/重要/一般","occurTime":"YYYY-MM或YYYY-MM-DD(发生时间,不确定留空)","publishTime":"YYYY-MM-DD","facts":"公开事实","impact":"对我方潜在影响","action":"建议行动","confidence":"高/中/低","confidenceBasis":"依据一句","sourceIdx":[来源编号]}]}\n无值得关注的事件则输出 {"events":[]}。\n\n检索资料：\n${src.slice(0, 60000)}`;
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
// 兜底清洗：即便模型没听话，把正文里漏出的「（我方）业务单元N」占位代称收敛成「我方」
const cleanSelf = (s: string): string => s.replace(/我方业务单元\s*\d+/g, "我方").replace(/业务单元\s*\d+/g, "我方");
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
      facts: String(e?.facts ?? "").trim(), impact: cleanSelf(String(e?.impact ?? "").trim()), action: cleanSelf(String(e?.action ?? "").trim()),
      confidence: asConf(String(e?.confidence ?? "")), confidenceBasis: String(e?.confidenceBasis ?? "").trim(),
      // 一律归入「本次刷新的月份」而非事件发生月：月初「近7天回填」会带回上月末的事件，
      // 若按发生月归档会落到上月、当前月视图里看不到（正是「刷新有进度却没结果」的根因）。
      // 发生时间仍完整保留在 occurTime/publishTime，卡片照常显示与排序。
      sources, month, createdAt: new Date().toISOString(),
    });
  }
  return out;
}

// 刷新一个业务单元（backfill=true 时按近一个月首次回填，否则本月）。
// onlyCompanyId 传入时只刷这一家（配合上方「全部企业」下拉：选了某家就只跑那家，别再全跑）。
// 返回带诊断的 summary，让「没结果」也能说清是哪一环：检索无命中 / 模型空返回 / 确无窗口内事件。
export async function refreshUnit(
  unit: Unit, month: string, backfill: boolean,
  onProgress?: (msg: string) => void, onlyCompanyId?: string,
): Promise<{ count: number; summary: string }> {
  const cfg = loadConfig();
  if (!searchEnabled(cfg)) throw new Error("未配置联网检索（博查）——到「设置 → 数据源」填检索 API 后再刷新。");
  const agent = cfg.agents["资料"]; const prov = providerById(cfg, agent.provider);
  if (prov.id === "mock") throw new Error("「资料」未配置真实模型——到「设置」为「资料」配置一款模型后再刷新。");
  const fetchImpl = await getLlmFetch();
  const windowDesc = backfill ? "近一个月" : `本月（${month}）`;
  // 明确点选某家就刷那家（无论是否勾启用）；否则刷该单元全部启用中的企业。
  const active = unit.companies.filter((c) => (onlyCompanyId ? c.id === onlyCompanyId : c.active));
  if (!active.length) throw new Error(onlyCompanyId ? "所选企业不存在。" : "该单元没有启用中的对标企业——到「企业名单维护」勾选启用。");

  const all: IntelEvent[] = [];
  let hitTotal = 0, noHits = 0, emptyModel = 0, ok = 0;
  for (let i = 0; i < active.length; i++) {
    const c = active[i];
    onProgress?.(`检索 ${c.name}（${i + 1}/${active.length}）…`);
    const hits: SearchHit[] = await withTimeout(
      gatherSources(cfg, { industry: "", ourRole: "", focus: "对标情报", company: c.name }, queriesFor(c), [c.name, ...c.aliases]).catch(() => [] as SearchHit[]),
      75000, () => [] as SearchHit[],
    );
    hitTotal += hits.length;
    if (!hits.length) { noHits++; continue; }
    onProgress?.(`解析 ${c.name}（命中 ${hits.length} 源 · ${i + 1}/${active.length}）…`);
    const text = await withTimeout(
      makeClient(prov, fetchImpl).send({ ...buildIntelRequest(c.name, unit.name, hits, windowDesc), model: agent.model }).then((r) => r.text || "").catch(() => ""),
      150000, () => "",
    );
    if (!text.trim()) { emptyModel++; continue; }
    all.push(...parseIntel(text, hits, unit.id, c.id, c.name, month));
    ok++;
  }
  const count = mergeEvents(unit.id, month, all, active.map((c) => c.id));
  logRefresh({ unitId: unit.id, month, at: new Date().toISOString(), count });

  const parts = [`检索 ${active.length} 家`, `命中 ${hitTotal} 源`, `本轮 ${count} 条`];
  if (noHits) parts.push(`${noHits} 家无检索命中`);
  if (emptyModel) parts.push(`${emptyModel} 家模型空返回`);
  if (ok && count === 0) parts.push("已抓到资料但未提炼出窗口内值得关注的事件");
  return { count, summary: parts.join(" · ") };
}
