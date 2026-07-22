// 导出构建器（纯函数，无浏览器依赖，可 Node/vitest 单测）。
// 规范交付格式 = 富样式 HTML；Word 走 Word 可打开的 HTML 文档(.doc)，最大限度保留 CSS 设计。

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      default: return "&quot;";
    }
  });
}

/** 自包含 HTML：内联 report.css，独立可读、可再导出。 */
export function buildStandaloneHtml(innerHtml: string, css: string, title: string): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${css}
html,body{background:#fff}</style></head>
<body>${innerHtml}</body></html>`;
}

/** Word 可打开的 HTML 文档（.doc）：加 mso 命名空间 + WordSection + A4 @page，保留设计系统样式。 */
export function buildWordHtml(innerHtml: string, css: string, title: string): string {
  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="zh-CN">
<head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>${css}
@page WordSection1{size:A4;margin:2cm}
div.WordSection1{page:WordSection1}
html,body{background:#fff}</style></head>
<body><div class="WordSection1">${innerHtml}</div></body></html>`;
}
