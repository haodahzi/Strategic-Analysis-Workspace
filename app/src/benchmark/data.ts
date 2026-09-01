// [对标情报] 本地数据层：复用现有 kv/JSON 持久化（独立命名空间 dw.benchmark.v1），不碰其它数据、不引 SQLite。
import { kvGet, kvSet } from "../data/persist";
import { BenchmarkData, Company, IntelEvent, RefreshLog, Unit, dedupKey } from "./types";

const KEY = "dw.benchmark.v1";
let seq = 0;
const uid = (p: string) => p + "-" + Date.now().toString(36) + "-" + (seq++).toString(36);

const co = (name: string, aliases: string[] = []): Company => ({ id: uid("c"), name, aliases, active: true });
function seed(): BenchmarkData {
  const units: Unit[] = [
    { id: "u1", name: "业务单元1", companies: [co("天下秀", ["天下秀数字科技", "WEIQ", "红人"]), co("蓝色光标", ["BlueFocus", "蓝标"]), co("省广集团", ["省广股份", "广东省广告"]), co("引力传媒", [])] },
    { id: "u2", name: "业务单元2", companies: [co("深圳市一达通企业服务有限公司", ["一达通"])] },
    { id: "u3", name: "业务单元3", companies: [co("齐心集团", ["齐心办公", "齐心股份", "Comix"]), co("领先未来", ["领先未来科技集团"]), co("欧菲斯", ["欧菲斯办公伙伴"]), co("史泰博", ["Staples"]), co("怡亚通", ["深圳市怡亚通供应链"])] },
    { id: "u4", name: "业务单元4", companies: [co("水羊国际", ["水羊股份", "御泥坊", "水羊"])] },
    { id: "u5", name: "业务单元5", companies: [co("河南海一云商实业集团有限公司", ["海一云商"])] },
    { id: "u6", name: "业务单元6", companies: [co("浙商糖酒集团有限公司", ["浙商糖酒"]), co("北京糖业烟酒集团有限公司", ["北京糖业烟酒", "京糖"])] },
    { id: "u7", name: "业务单元7", companies: [co("欣可丽美学（上海）医疗科技有限公司", ["欣可丽美学"])] },
    { id: "u8", name: "业务单元8", companies: [co("中发管理有限公司", ["中发管理"])] },
    { id: "u9", name: "业务单元9", companies: [co("窝里快购（浙江物联电子商务有限公司）", ["窝里快购", "浙江物联电子商务"])] },
  ];
  return { units, events: [], refreshes: [] };
}

let data: BenchmarkData = { units: [], events: [], refreshes: [] };
let ready = false;
const listeners = new Set<() => void>();
function notify() { listeners.forEach((f) => f()); }
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persistSoon() { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(() => { void kvSet(KEY, JSON.stringify(data)); }, 400); }

export function subscribe(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
export function getData(): BenchmarkData { return data; }
export function isReady(): boolean { return ready; }

let hydrating: Promise<void> | null = null;
export function hydrate(): Promise<void> {
  if (hydrating) return hydrating;
  hydrating = (async () => {
    const raw = await kvGet(KEY);
    if (raw) { try { const d = JSON.parse(raw); if (d && Array.isArray(d.units)) data = { units: d.units, events: d.events ?? [], refreshes: d.refreshes ?? [] }; } catch { data = seed(); } }
    else { data = seed(); void kvSet(KEY, JSON.stringify(data)); }
    ready = true; notify();
  })();
  return hydrating;
}

function commit(next: BenchmarkData) { data = next; persistSoon(); notify(); }

// 刷新：合并某单元某月的事件，按去重键保留用户的已读/收藏/反馈
export function mergeEvents(unitId: string, month: string, incoming: IntelEvent[]): number {
  const prev = data.events.filter((e) => e.unitId === unitId && e.month === month);
  const prevByKey = new Map(prev.map((e) => [dedupKey(e.companyId, e.type, e.title), e]));
  const merged: IntelEvent[] = incoming.map((e) => {
    const old = prevByKey.get(dedupKey(e.companyId, e.type, e.title));
    return old ? { ...e, id: old.id, read: old.read, starred: old.starred, feedback: old.feedback } : e;
  });
  const others = data.events.filter((e) => !(e.unitId === unitId && e.month === month));
  commit({ ...data, events: [...others, ...merged] });
  return merged.length;
}
export function newEventId(): string { return uid("e"); }

export function patchEvent(id: string, patch: Partial<IntelEvent>) {
  commit({ ...data, events: data.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
}
export function logRefresh(l: RefreshLog) {
  commit({ ...data, refreshes: [l, ...data.refreshes.filter((r) => !(r.unitId === l.unitId && r.month === l.month))].slice(0, 200) });
}
export function lastRefresh(unitId: string, month: string): RefreshLog | undefined {
  return data.refreshes.find((r) => r.unitId === unitId && r.month === month);
}

// —— 后台维护：单元名 / 企业名·别名·启用 ——
export function setUnitName(unitId: string, name: string) {
  commit({ ...data, units: data.units.map((u) => (u.id === unitId ? { ...u, name } : u)) });
}
export function setCompany(unitId: string, companyId: string, patch: Partial<Company>) {
  commit({ ...data, units: data.units.map((u) => (u.id === unitId ? { ...u, companies: u.companies.map((c) => (c.id === companyId ? { ...c, ...patch } : c)) } : u)) });
}
export function addCompany(unitId: string, name: string) {
  commit({ ...data, units: data.units.map((u) => (u.id === unitId ? { ...u, companies: [...u.companies, co(name || "新企业")] } : u)) });
}
export function removeCompany(unitId: string, companyId: string) {
  commit({ ...data, units: data.units.map((u) => (u.id === unitId ? { ...u, companies: u.companies.filter((c) => c.id !== companyId) } : u)) });
}
