// 统一持久化：桌面(Tauri)落盘到 app_data_dir/kv/*.json（不受 localStorage 5MB 限制，重启不丢）；
// 网页预览回落 localStorage。写入同时镜像 localStorage 便于快速回读；读取在桌面优先取落盘、缺失再回落。
import { isTauri } from "../llm/runtime";

async function invoker() {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
}

export async function kvGet(key: string): Promise<string | null> {
  if (isTauri()) {
    try {
      const invoke = await invoker();
      const v = await invoke<string | null>("kv_get", { key });
      if (v != null) return v;   // 落盘有值即用；null 表示尚未落盘 → 回落 localStorage（旧版本迁移）
    } catch { /* 落盘不可用 → 回落 */ }
  }
  try { return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null; } catch { return null; }
}

export async function kvSet(key: string, value: string): Promise<void> {
  // 先写 localStorage（体积小则成功；配额溢出忽略，落盘为准）
  try { if (typeof localStorage !== "undefined") localStorage.setItem(key, value); } catch { /* 配额溢出：以落盘为准 */ }
  if (isTauri()) {
    try { const invoke = await invoker(); await invoke("kv_set", { key, value }); } catch { /* 落盘失败：localStorage 兜底 */ }
  }
}
