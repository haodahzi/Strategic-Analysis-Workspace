// 运行时 fetch 选择：桌面(Tauri)下走 tauri-plugin-http（经 Rust 发请求，绕过 WebView 的 CORS）；
// 普通浏览器下用全局 fetch。动态 import 保证浏览器环境永不加载 Tauri 模块。
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let cached: typeof fetch | null = null;

export async function getLlmFetch(): Promise<typeof fetch> {
  if (cached) return cached;
  if (isTauri()) {
    const mod = await import("@tauri-apps/plugin-http");
    cached = mod.fetch as unknown as typeof fetch;
  } else {
    cached = fetch;
  }
  return cached;
}
