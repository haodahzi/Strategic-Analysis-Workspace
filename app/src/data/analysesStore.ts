// 在办分析持久化（#9）：新建的分析存本机 localStorage，重启 / 刷新不丢。
import { Analysis } from "../types";
import { analyses as seed } from "./seed";

const KEY = "dw.analyses.v1";

export function loadAnalyses(): Analysis[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const v = JSON.parse(raw); if (Array.isArray(v)) return v; }
  } catch { /* 存储不可用时回落示例 */ }
  return seed;   // 首次使用：给一组示例，创建后即以本机数据为准
}

export function saveAnalyses(items: Analysis[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* 忽略 */ }
}
