// 把模型产出的 markdown 定稿渲染成「房子样式」HTML（纯函数、可单测、全程转义防注入）。
// 映射：# / ## → 章（编号）；### → 小节标题；#### → 副标签；> 引用 → 语义批注框（结论/风险/洞察）；
// 表格 → 房子表格；- / 1. → 列表；--- → 分隔线。再由 buildHouseDoc 套封面/页脚成独立文档。
import { escapeHtml } from "./build";

export interface HouseMeta { title: string; subtitle?: string; badges?: string[]; foot?: string; }

function inline(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, txt, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${txt}</a>`);
  t = t.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/`([^`]+?)`/g, "<code>$1</code>");
  return t;
}

const pad2 = (n: number) => (n < 10 ? "0" + n : "" + n);

// 引用块按首词判语义 → 对应彩色批注 / 结论框
function renderQuote(text: string): string {
  const t = text.trim();
  const m = /^(风险|警示|警告|结论|判断|定调|洞察|要点|提示|说明|注)[：:、]\s*(.*)$/.exec(t);
  const kw = m ? m[1] : "";
  const body = m ? m[2] : t;
  if (/结论|判断|定调/.test(kw)) return `<div class="insight dark"><div class="insight-tag">${kw}</div><p>${inline(body)}</p></div>`;
  if (/风险|警示|警告/.test(kw)) return `<div class="anno red"><div class="anno-tag">${kw}</div><p>${inline(body)}</p></div>`;
  if (/洞察|要点/.test(kw)) return `<div class="insight gold"><div class="insight-tag">${kw}</div><p>${inline(body)}</p></div>`;
  return `<div class="anno gold">${kw ? `<div class="anno-tag">${kw}</div>` : ""}<p>${inline(body)}</p></div>`;
}

function splitRow(line: string): string[] {
  return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
}

export function mdToHouseHtml(md: string): string {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  let quote: string[] | null = null;
  let chapter = 0;

  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<ul class="md-list">${list.join("")}</ul>`); list = null; } };
  const flushQuote = () => { if (quote) { out.push(renderQuote(quote.join(" "))); quote = null; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // 表格：本行含 | 且下一行是分隔行
    if (/^\|?.*\|.*/.test(line) && line.includes("|") && i + 1 < lines.length && /^\|?[\s:|-]*-[\s:|-]*$/.test(lines[i + 1].trim())) {
      flushAll();
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) { rows.push(splitRow(lines[i].trim())); i++; }
      i--; // 回退一行给 for
      const thead = `<thead><tr>${header.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${rows.map((r) => `<tr>${header.map((_, k) => `<td>${inline(r[k] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>`;
      out.push(`<div class="tw"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    if (line === "") { flushAll(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flushAll(); out.push("<hr>"); continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushAll();
      const lvl = h[1].length, title = inline(h[2]);
      if (lvl <= 2) { chapter++; out.push(`<div class="chapter"><div class="ch-hd"><div class="ch-n">${pad2(chapter)}</div><div class="ch-meta"><div class="ch-title">${title}</div></div></div></div>`); }
      else if (lvl === 3) out.push(`<div class="sec-t">${title}</div>`);
      else out.push(`<div class="sub-tag">${title}</div>`);
      continue;
    }

    const bq = /^>\s?(.*)$/.exec(line);
    if (bq) { flushPara(); flushList(); (quote ??= []).push(bq[1]); continue; }

    const li = /^[-*]\s+(.*)$/.exec(line) ?? /^\d+[.、)]\s+(.*)$/.exec(line);
    if (li) { flushPara(); flushQuote(); (list ??= []).push(`<li>${inline(li[1])}</li>`); continue; }

    flushList(); flushQuote(); para.push(line);
  }
  flushAll();
  return out.join("\n");
}

export function buildHouseDoc(bodyHtml: string, css: string, meta: HouseMeta): string {
  const date = new Date().toISOString().slice(0, 10);
  const badges = [...(meta.badges ?? []).filter(Boolean), date, "待审初稿"]
    .map((b) => `<span class="badge">${escapeHtml(b)}</span>`).join("");
  const sub = meta.subtitle ? `<div class="hero-sub">${escapeHtml(meta.subtitle)}</div>` : "";
  const foot = escapeHtml(meta.foot ?? "本报告由战略发展分析工作台生成，结论为待审初稿；数据以标注的口径与来源为准，请结合尽调与现场核实后再定调。");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(meta.title)}</title><style>${css}</style></head>
<body><div class="wrap">
<div class="hero"><div class="eyebrow">战略发展分析工作台 · 研究报告</div><h1 class="hero-h">${escapeHtml(meta.title)}</h1>${sub}<div class="hero-badges">${badges}</div></div>
${bodyHtml}
<div class="foot">${foot}</div>
</div></body></html>`;
}
