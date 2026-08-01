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

// 产业链三列（上游 / 中游 / 下游），每列多个分组 + 代表企业，中游高亮、可标★核心、底部流向。
//   ```chain
//   上游·软硬件供应 | UPSTREAM
//   - AI 芯片（壁垒/利润最高） | 英伟达、华为昇腾、寒武纪
//   中游·算力中心服务 | MIDSTREAM | mid
//   - 算力租赁 / 运营 ★本报告核心 | 利通电子、协创数据 | hot
//   ~ 算力自上而下流动 → 资金自下而上回流
interface ChainGroup { title: string; companies: string; hot: boolean; }
interface ChainCol { title: string; en: string; mid: boolean; extra: string; groups: ChainGroup[]; }

function renderChain(rows: string[]): string {
  const cols: ChainCol[] = [];
  let flow = "";
  for (const raw of rows) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("~")) { flow = line.replace(/^~+\s*/, ""); continue; }
    if (line.startsWith("-")) {
      const c = line.replace(/^-+\s*/, "").split("|").map((x) => x.trim());
      if (cols.length) cols[cols.length - 1].groups.push({ title: c[0] ?? "", companies: c[1] ?? "", hot: /hot|核心|★/.test((c[2] ?? "") + (c[0] ?? "")) });
      continue;
    }
    const c = line.split("|").map((x) => x.trim());
    cols.push({ title: c[0] ?? "", en: c[1] ?? "", mid: /mid|中游/.test(c[2] ?? "") || (c[0] ?? "").includes("中游"), extra: c[2] ?? "", groups: [] });
  }
  const tagsOf = (s: string) => s.split(/[、,，;；]/).map((x) => x.trim()).filter(Boolean).map((x) => `<span class="tag">${inline(x)}</span>`).join("");
  const colHtml = cols.slice(0, 3).map((col, i) => {
    // 兜底：只写了一行「标题 | 说明 | 企业」而没有 - 分组时，用第 3 段当作一个分组
    const groups = col.groups.length ? col.groups
      : (col.extra && /[、,，]/.test(col.extra) ? [{ title: "", companies: col.extra, hot: false }] : []);
    const body = groups.map((g) => `<div class="cgrp${g.hot ? " hot" : ""}">${g.title ? `<div class="cgrp-t">${inline(g.title)}</div>` : ""}<div class="tags">${tagsOf(g.companies)}</div></div>`).join("");
    return `<div class="chain-col${col.mid || i === 1 ? " mid" : ""}"><div class="chain-hd">${inline(col.title)}<span class="cx">${inline(col.en)}</span></div><div class="chain-body">${body}</div></div>`;
  }).join("");
  return `<div class="chain">${colHtml}</div>${flow ? `<div class="chain-flow">${inline(flow)}</div>` : ""}`;
}

// 时间轴——```timeline 每行：年份 | 事件 | 说明
function renderTimeline(rows: string[]): string {
  const items = rows.map((r) => r.trim()).filter(Boolean).map((r) => {
    const c = r.split("|").map((x) => x.trim());
    return `<div class="tl-item"><div class="tl-yr">${inline(c[0] ?? "")}</div><div class="tl-t">${inline(c[1] ?? "")}</div><div class="tl-d">${inline(c[2] ?? "")}</div></div>`;
  }).join("");
  return `<div class="tl">${items}</div>`;
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

    // 结构化围栏块：```chain（产业链）/ ```timeline（时间轴）；其余当代码块
    const fence = /^`{3,}\s*([a-zA-Z]+)?\s*$/.exec(line);
    if (fence) {
      flushAll();
      const lang = (fence[1] ?? "").toLowerCase();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^`{3,}\s*$/.test(lines[i].trim())) { body.push(lines[i]); i++; }
      if (lang === "chain") out.push(renderChain(body));
      else if (lang === "timeline") out.push(renderTimeline(body));
      else out.push(`<pre class="md-pre">${escapeHtml(body.join("\n"))}</pre>`);
      continue;
    }

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
