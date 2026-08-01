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

/** 清洁版排版（#4c）：给深度分析成稿（markdown 渲染出的 .md 结构）套一份自带、印刷级的干净样式，
 *  独立成文、可直接分享 / 打印存 PDF；不依赖工作台 report.css 的类名。 */
export function buildCleanDoc(innerHtml: string, title: string, subtitle?: string): string {
  const sub = subtitle ? `<div class="c-sub">${escapeHtml(subtitle)}</div>` : "";
  const date = new Date().toISOString().slice(0, 10);
  const css = `
*{box-sizing:border-box}
html,body{margin:0;background:#f5f5f4;color:#1c1917}
body{font:16px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif}
.clean{max-width:820px;margin:0 auto;padding:56px 60px;background:#fff}
.c-head{border-bottom:2px solid #1c1917;padding-bottom:16px;margin-bottom:32px}
.c-title{font-size:26px;font-weight:700;letter-spacing:.5px;line-height:1.35;margin:0}
.c-sub{margin-top:8px;color:#57534e;font-size:14px}
.c-date{margin-top:6px;color:#a8a29e;font-size:12px}
.md-h1,.md-h2,.md-h3,.md-h4{font-weight:700;line-height:1.4;margin:1.6em 0 .5em}
.md-h1{font-size:22px;border-bottom:1px solid #e7e5e4;padding-bottom:.3em}
.md-h2{font-size:19px;border-left:4px solid #1c1917;padding-left:12px}
.md-h3{font-size:17px;color:#292524}
.md-h4{font-size:15px;color:#44403c}
.md p{margin:.7em 0}
.md ul,.md ol{margin:.6em 0;padding-left:1.4em}
.md li{margin:.32em 0}
.md strong{font-weight:700}
.md code{background:#f5f5f4;border:1px solid #e7e5e4;border-radius:4px;padding:1px 5px;font-size:.88em;font-family:"SF Mono",Consolas,monospace}
.md table{border-collapse:collapse;width:100%;margin:1em 0;font-size:14px}
.md th,.md td{border:1px solid #e7e5e4;padding:8px 10px;text-align:left}
.md th{background:#fafaf9;font-weight:600}
.c-foot{margin-top:40px;padding-top:14px;border-top:1px solid #e7e5e4;color:#a8a29e;font-size:12px}
@media print{html,body{background:#fff}.clean{padding:0;max-width:none}@page{size:A4;margin:2cm}}`;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${css}</style></head>
<body><article class="clean">
<header class="c-head"><h1 class="c-title">${escapeHtml(title)}</h1>${sub}<div class="c-date">${date}</div></header>
${innerHtml}
<footer class="c-foot">本文由战略发展分析工作台生成，请结合尽调与现场核实后定调。</footer>
</article></body></html>`;
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
