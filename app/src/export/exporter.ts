// 浏览器侧导出胶水（Tauri webview 内运行）。第二段可换成 Tauri fs/dialog 保存到本地。
import reportCss from "../styles/report.css?raw";
import houseCss from "../styles/report-house.css?raw";
import { buildCleanDoc, buildStandaloneHtml, buildWordHtml } from "./build";
import { HouseMeta, buildHouseDoc, mdToHouseHtml } from "./house";

export type ExportKind = "html" | "word" | "pdf";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob(["﻿" + content], { type: mime }); // BOM 保证 Word/浏览器按 UTF-8 解析
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** 把某个 .report 元素导出为 HTML / Word / PDF。 */
export function exportReport(el: HTMLElement | null, title: string, kind: ExportKind) {
  if (kind === "pdf") {
    window.print(); // report.css 已内置 A4 @media print；打印时隐藏工作台 chrome
    return;
  }
  const inner = el ? el.outerHTML : "";
  if (kind === "html") {
    download(`${title}.html`, buildStandaloneHtml(inner, reportCss, title), "text/html;charset=utf-8");
  } else {
    download(`${title}.doc`, buildWordHtml(inner, reportCss, title), "application/msword");
  }
}

/** 一键排版·清洁版 HTML（#4c）：把深度分析成稿（.md 结构）导成印刷级独立文档。 */
export function exportClean(el: HTMLElement | null, title: string, subtitle?: string) {
  download(`${title}.html`, buildCleanDoc(el ? el.innerHTML : "", title, subtitle), "text/html;charset=utf-8");
}

/** 把 markdown 定稿排成「房子样式」独立文档（用于工作台内 iframe 查看 + 导出，同一份 HTML）。#7 #15 */
export function houseDocFromMarkdown(markdown: string, meta: HouseMeta): string {
  return buildHouseDoc(mdToHouseHtml(markdown), houseCss, meta);
}

/** 下载一份已经构建好的 HTML 文档。 */
export function downloadHtmlDoc(title: string, doc: string) {
  download(`${title}.html`, doc, "text/html;charset=utf-8");
}

/** 导出 HTML：优先弹「另存为」窗口让用户自选保存位置（WebView2 / Chromium 支持），不支持则退化为直接下载。 */
export async function saveHtmlDoc(title: string, doc: string): Promise<void> {
  const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }> };
  if (typeof w.showSaveFilePicker === "function") {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName: `${title}.html`, types: [{ description: "HTML 文件", accept: { "text/html": [".html"] } }] });
      const ws = await handle.createWritable();
      await ws.write(new Blob(["﻿" + doc], { type: "text/html;charset=utf-8" }));
      await ws.close();
      return;
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;   // 用户取消
      // 其他错误退化为直接下载
    }
  }
  download(`${title}.html`, doc, "text/html;charset=utf-8");
}
