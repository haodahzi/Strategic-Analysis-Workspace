// 内置浏览器桥：打开信息源站点（原生窗口、登录态留在本机）、接收「抓取此页正文 / 研报清单」回传。
// 仅在桌面(Tauri)可用；普通浏览器下 openSource 返回提示、listen* 空转。
import { isTauri } from "../llm/runtime";
import { RawCand } from "./scrape";

export interface GrabItem { name: string; url: string; text: string; }
export interface ReportsPayload { source: string; pageUrl: string; items: RawCand[]; }

// 打开某数据源的内置浏览器窗口。label 用 source-<id>，Rust 侧据此判重与注入工具条。
export async function openSource(id: string, url: string, name: string): Promise<string> {
  if (!url.trim()) return `「${name}」未配置网址，请到「设置 → 数据源」填写`;
  if (!isTauri()) return "内置浏览器仅在桌面版可用（网页预览版请直接在系统浏览器打开该站点）";
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_source_browser", { url, label: `source-${id}`, title: `${name} · 从信息源获取`, name });
    return "";
  } catch (e) {
    return `打开失败：${(e as Error).message.slice(0, 120)}`;
  }
}

// 兜底：用系统默认浏览器打开（内置窗口异常时的可靠退路）。网页环境用 window.open。
export async function openExternal(url: string, name = "该信息源"): Promise<string> {
  if (!url.trim()) return `「${name}」未配置网址，请到「设置 → 数据源」填写`;
  if (!isTauri()) { try { window.open(url, "_blank", "noopener"); return ""; } catch { return "无法打开"; } }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_external", { url });
    return "";
  } catch (e) {
    return `打开失败：${(e as Error).message.slice(0, 120)}`;
  }
}

// 订阅「抓取此页正文」回传。返回取消订阅函数；非桌面环境返回空函数。
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

// 订阅「抓取本页研报清单」回传（站内自动抓取）。原始候选交回，由调用方用 scrape.ts 打分成清单。
export async function listenReports(cb: (p: ReportsPayload) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const un = await listen<ReportsPayload>("source-reports", (e) => {
      const p = e.payload;
      if (p && Array.isArray(p.items)) cb(p);
    });
    return un;
  } catch {
    return () => {};
  }
}

// 订阅「内置浏览器下载完成」（用户在站内点『下载』研报）。回传落盘路径 + 文件名，供前端抽取自动入库。
export interface DownloadItem { path: string; name: string; }
export async function listenDownload(cb: (d: DownloadItem) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const un = await listen<DownloadItem>("source-download", (e) => {
      const p = e.payload;
      if (p && typeof p.path === "string" && p.path.trim()) cb(p);
    });
    return un;
  } catch {
    return () => {};
  }
}

// 回读下载文件的字节（受控目录，Rust 侧校验）。返回 ArrayBuffer，交 pdfjs 抽取。
export async function readDownload(path: string): Promise<ArrayBuffer> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ArrayBuffer>("read_download", { path });
}
