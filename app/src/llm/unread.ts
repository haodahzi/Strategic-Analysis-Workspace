// 「已完成 · 未读」标记（#7）：某单的深度分析生成完成后打绿点，点开阅读即消。持久化到本机。
const KEY = "dw.unread.v1";

function load(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

let ids = new Set<string>(load());
const listeners = new Set<() => void>();

function persist() { try { localStorage.setItem(KEY, JSON.stringify([...ids])); } catch { /* 忽略 */ } }
function emit() { listeners.forEach((f) => f()); }

export function subscribeUnread(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function getUnread(): Set<string> { return ids; }   // 稳定引用：变更时换新 Set，未变时同一引用（配合 useSyncExternalStore）

export function markUnread(id: string) { if (!ids.has(id)) { ids = new Set(ids); ids.add(id); persist(); emit(); } }
export function clearUnread(id: string) { if (ids.has(id)) { ids = new Set(ids); ids.delete(id); persist(); emit(); } }
