// 浏览器侧导出胶水（Tauri webview 内运行）。第二段可换成 Tauri fs/dialog 保存到本地。
import reportCss from "../styles/report.css?raw";
import { buildCleanDoc, buildStandaloneHtml, buildWordHtml } from "./build";

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
