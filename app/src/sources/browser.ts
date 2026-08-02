// 内置浏览器桥：打开信息源站点（原生窗口、登录态留在本机）、接收「抓取此页」回传的正文。
// 仅在桌面(Tauri)可用；普通浏览器下 openSource 返回提示、listenGrab 空转。
import { isTauri } from "../llm/runtime";

export interface GrabItem { name: string; url: string; text: string; }

// 打开某数据源的内置浏览器窗口。label 用 source-<id>，Rust 侧据此判重与注入工具条。
export async function openSource(id: string, url: string, name: string): Promise<string> {
  if (!url.trim()) return `「${name}」未配置网址，请到「设置 → 数据源」填写`;
  if (!isTauri()) return "内置浏览器仅在桌面版可用（网页预览版请直接在系统浏览器打开该站点）";
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_source_browser", { url, label: `source-${id}`, title: `${name} · 从信息源获取` });
    return "";
  } catch (e) {
    return `打开失败：${(e as Error).message.slice(0, 120)}`;
  }
}

// 订阅「抓取此页正文」回传（试验路径）。返回取消订阅函数；非桌面环境返回空函数。
export async function listenGrab(cb: (item: GrabItem) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const un = await listen<GrabItem>("source-grab", (e) => {
      const p = e.payload;
      if (p && typeof p.text === "string" && p.text.trim()) cb(p);
    });
    return un;
  } catch {
    return () => {};
  }
}
