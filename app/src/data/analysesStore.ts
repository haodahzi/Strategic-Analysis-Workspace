// 在办分析持久化（#9）：新建的分析落盘（桌面 app_data_dir，网页 localStorage），重启 / 刷新不丢。
import { Analysis } from "../types";
import { analyses as seed } from "./seed";
import { kvGet, kvSet } from "./persist";

const KEY = "dw.analyses.v1";

function parse(raw: string | null): Analysis[] | null {
  if (!raw) return null;
  try { const v = JSON.parse(raw); if (Array.isArray(v)) return v as Analysis[]; } catch { /* 损坏 → 视为无 */ }
  return null;
}

// 异步加载（桌面落盘优先）：首次无数据才回落示例；有数据（含空数组）以本机为准，绝不用示例覆盖。
export async function loadAnalysesAsync(): Promise<Analysis[]> {
  const v = parse(await kvGet(KEY));
  return v ?? seed;
}

export async function saveAnalysesAsync(items: Analysis[]): Promise<void> {
  await kvSet(KEY, JSON.stringify(items));
}

// 同步版仅供不便 await 的旧路径（网页快速回读）；桌面完整持久化以 async 版为准。
export function loadAnalyses(): Analysis[] {
  try { return parse(localStorage.getItem(KEY)) ?? seed; } catch { return seed; }
}
export function saveAnalyses(items: Analysis[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* 忽略 */ }
}
