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

// 交易结构 / 资金流——```flow 每行：出方 | 收方 | 标的·款项 | solid(资金/实物) 或 dashed(服务/持有)
function renderFlow(rows: string[]): string {
  const items = rows.map((r) => r.trim()).filter(Boolean).map((r) => {
    const c = r.split("|").map((x) => x.trim());
    const dashed = /dash|虚|服务|持有|token/i.test(c[3] ?? "");
    return `<div class="flowrow"><span class="flow-node">${inline(c[0] ?? "")}</span><span class="flow-edge${dashed ? " dashed" : ""}"><span class="flow-lbl">${inline(c[2] ?? "")}</span><span class="flow-line"></span></span><span class="flow-node">${inline(c[1] ?? "")}</span></div>`;
  }).join("");
  return `<div class="flowdiag"><div class="flow-cap">交易结构 · 资金流与实物流（虚线＝服务 / 持有关系）</div>${items}</div>`;
}

// 交易结构 2D 中心辐射图——```dealflow：
//   hub | 中心方名称 | 一句职能
//   周边方名称 | 一句说明 | 槽位(tl/t/tr/l/r/bl/b/br)
//   > 出方 | 收方 | 标的·款项 | solid 或 dashed   （出/收方用节点名或 hub）
interface DealNode { label: string; sub: string; cx: number; cy: number; hw: number; hh: number; hub: boolean; }
const DEAL_SLOTS: Record<string, [number, number]> = {
  hub: [410, 235], t: [410, 55], b: [410, 415], tl: [150, 92], tr: [670, 92], l: [150, 235], r: [670, 235], bl: [150, 378], br: [670, 378],
};

function renderDealflow(rows: string[]): string {
  const nodes = new Map<string, DealNode>();
  const edges: { from: string; to: string; label: string; dashed: boolean }[] = [];
  const free = ["tl", "tr", "l", "r", "bl", "br", "t", "b"];
  let si = 0;
  for (const raw of rows) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(">")) {
      const c = line.replace(/^>+\s*/, "").split("|").map((x) => x.trim());
      edges.push({ from: c[0] ?? "", to: c[1] ?? "", label: c[2] ?? "", dashed: /dash|虚|服务|持有|token/i.test(c[3] ?? "") });
      continue;
    }
    const c = line.split("|").map((x) => x.trim());
    const isHub = /^(hub|中心|中央|运营方)/i.test(c[0]);
    const slot = isHub ? "hub" : (DEAL_SLOTS[c[2]] ? c[2] : (free[si++] ?? "b"));
    const [cx, cy] = DEAL_SLOTS[slot] ?? DEAL_SLOTS.b;
    const label = isHub ? (c[1] || c[0]) : c[0];
    const node: DealNode = { label, sub: isHub ? (c[2] || "") : (c[1] || ""), cx, cy, hw: isHub ? 92 : 76, hh: isHub ? 33 : 28, hub: isHub };
    nodes.set(label, node);
    if (isHub) nodes.set("hub", node);
  }
  if (!nodes.has("hub") && nodes.size) { const f = [...nodes.values()][0]; f.cx = 410; f.cy = 235; f.hw = 92; f.hh = 33; f.hub = true; nodes.set("hub", f); }

  const pt = (n: DealNode, tx: number, ty: number): [number, number] => {
    const dx = tx - n.cx, dy = ty - n.cy;
    const t = Math.min(n.hw / (Math.abs(dx) || 1e-6), n.hh / (Math.abs(dy) || 1e-6));
    return [n.cx + dx * t, n.cy + dy * t];
  };
  const n1 = (v: number) => v.toFixed(1);

  const edgeSvg = edges.map((e) => {
    const a = nodes.get(e.from), b = nodes.get(e.to);
    if (!a || !b || a === b) return "";
    const [sx, sy] = pt(a, b.cx, b.cy);
    const [ex, ey] = pt(b, a.cx, a.cy);
    const ang = Math.atan2(ey - sy, ex - sx);
    const ax = ex - 9 * Math.cos(ang), ay = ey - 9 * Math.sin(ang);
    const arrow = `${n1(ex)},${n1(ey)} ${n1(ex - 10 * Math.cos(ang - 0.42))},${n1(ey - 10 * Math.sin(ang - 0.42))} ${n1(ex - 10 * Math.cos(ang + 0.42))},${n1(ey - 10 * Math.sin(ang + 0.42))}`;
    const col = e.dashed ? "#8a847c" : "#9a6c00";
    const mx = (sx + ex) / 2, my = (sy + ey) / 2, w = e.label.length * 11 + 6;
    const lbl = e.label ? `<rect x="${n1(mx - w / 2)}" y="${n1(my - 9)}" width="${n1(w)}" height="18" fill="#f4f1eb"/><text x="${n1(mx)}" y="${n1(my + 4)}" text-anchor="middle" font-size="11" fill="${e.dashed ? "#484440" : "#7a5600"}">${escapeHtml(e.label)}</text>` : "";
    return `<line x1="${n1(sx)}" y1="${n1(sy)}" x2="${n1(ax)}" y2="${n1(ay)}" stroke="${col}" stroke-width="1.6"${e.dashed ? ' stroke-dasharray="5 4"' : ""}/><polygon points="${arrow}" fill="${col}"/>${lbl}`;
  }).join("");

  const nodeSvg = [...new Set([...nodes.values()])].map((n) => {
    const fill = n.hub ? "#b03020" : "#1a1712";
    const t1 = `<text x="${n1(n.cx)}" y="${n1(n.cy + (n.sub ? -5 : 4))}" text-anchor="middle" fill="#fff" font-size="${n.hub ? 15 : 12.5}" font-weight="700">${escapeHtml(n.label)}</text>`;
    const t2 = n.sub ? `<text x="${n1(n.cx)}" y="${n1(n.cy + 13)}" text-anchor="middle" fill="rgba(255,255,255,.62)" font-size="9.5">${escapeHtml(n.sub)}</text>` : "";
    return `<rect x="${n1(n.cx - n.hw)}" y="${n1(n.cy - n.hh)}" width="${n1(n.hw * 2)}" height="${n1(n.hh * 2)}" rx="2" fill="${fill}"/>${t1}${t2}`;
  }).join("");

  return `<div class="diagram"><svg viewBox="0 0 820 470" width="100%" xmlns="http://www.w3.org/2000/svg">${edgeSvg}${nodeSvg}</svg><div class="dia-cap">图 · 典型交易结构与资金流（实线＝资金 / 实物，虚线＝服务 / 持有关系）</div></div>`;
}

// 时间轴——```timeline 每行：年份 | 事件 | 说明
function renderTimeline(rows: string[]): string {
  const items = rows.map((r) => r.trim()).filter(Boolean).map((r) => {
    const c = r.split("|").map((x) => x.trim());
    return `<div class="tl-item"><div class="tl-yr">${inline(c[0] ?? "")}</div><div class="tl-t">${inline(c[1] ?? "")}</div><div class="tl-d">${inline(c[2] ?? "")}</div></div>`;
  }).join("");
  return `<div class="tl">${items}</div>`;
}

// ——编辑体组件（editorial-report skill 全集）：关键数字快览 / 要点块 / 综合研判 / 指标条 / 核查清单——
// 语义色只认这 4 个（对应 report-house.css 的 card-val / mrow 变量），杜绝任意值注入。
const CARD_COLORS = new Set(["teal", "gold", "red", "blue"]);
const colorName = (s: string | undefined): string => {
  const c = (s ?? "").trim().toLowerCase();
  return CARD_COLORS.has(c) ? c : "";
};

// 关键数字快览——```kpi（或 cards）每行：标签 | 数值 | 语义色(可选) | 一句说明(可选)。2→g2 / 3→g3 / 其余 g4。
function renderKpi(rows: string[]): string {
  const items = rows.map((r) => r.trim()).filter(Boolean).map((r) => {
    const c = r.split("|").map((x) => x.trim());
    const cv = colorName(c[2]);
    const sub = c[3] ? `<div class="card-sub">${inline(c[3])}</div>` : "";
    return `<div class="card"><div class="card-tag">${inline(c[0] ?? "")}</div><div class="card-val${cv ? " " + cv : ""}">${inline(c[1] ?? "")}</div>${sub}</div>`;
  });
  const g = items.length === 2 ? "g2" : items.length === 3 ? "g3" : "g4";
  return `<div class="${g}">${items.join("")}</div>`;
}

// 要点块（★最常用的「拆段」组件）——```what 每行：小标签 | 一句话 | key(可选)；行首 * 或第 3 段含 key/★/重点 → 重点项（金色左边）。
function renderWhat(rows: string[]): string {
  const items = rows.map((r) => r.trim()).filter(Boolean).map((r) => {
    let key = /^\*\s+/.test(r);
    const c = r.replace(/^\*\s+/, "").split("|").map((x) => x.trim());
    if (/key|★|重点/.test(c[2] ?? "")) key = true;
    const hasLabel = c.length >= 2;
    const label = hasLabel && c[0] ? `<div class="what-label">${inline(c[0])}</div>` : "";
    const text = hasLabel ? c[1] : c[0];
    return `<div class="what-item${key ? " key" : ""}">${label}<div class="what-text">${inline(text ?? "")}</div></div>`;
  });
  return `<div class="what-grid">${items.join("")}</div>`;
}

// 综合研判——```verdict：可选首行「# 标题」；其余每行：标签 | 一句话。标签判多空色：利好→bull / 需冷静·风险→bear / 其余→note。
function verdictTag(kw: string): string {
  if (/利好|看好|正面|机会|bull/i.test(kw)) return "bull";
  if (/冷静|风险|负面|警示|担忧|bear/i.test(kw)) return "bear";
  return "note";
}
function renderVerdict(rows: string[]): string {
  let title = "综合研判";
  const items: string[] = [];
  for (const raw of rows) {
    const line = raw.trim();
    if (!line) continue;
    const h = /^#\s+(.*)$/.exec(line);
    if (h) { title = h[1]; continue; }
    const c = line.split("|").map((x) => x.trim());
    const kw = c.length >= 2 ? c[0] : "核心结论";
    const body = c.length >= 2 ? c.slice(1).join(" | ") : c[0];
    items.push(`<div class="v-item"><span class="v-tag ${verdictTag(kw)}">${inline(kw)}</span><p class="v-text">${inline(body)}</p></div>`);
  }
  return `<div class="verdict"><div class="verdict-t">${inline(title)}</div>${items.join("")}</div>`;
}

// 指标条（迷你条形图）——```mrow 每行：名称 | 百分比数字(0–100) | 显示值 | 语义色(可选,默认 gold)。
function renderMrow(rows: string[]): string {
  return rows.map((r) => r.trim()).filter(Boolean).map((r) => {
    const c = r.split("|").map((x) => x.trim());
    const pct = Math.max(0, Math.min(100, parseFloat(c[1] ?? "") || 0));
    const col = colorName(c[3]);
    const bg = col ? `var(--${col})` : "var(--gold)";
    return `<div class="mrow"><span class="mrow-name">${inline(c[0] ?? "")}</span><div class="mrow-bar"><div class="mrow-fill" style="width:${pct}%;background:${bg}"></div></div><span class="mrow-val">${inline(c[2] ?? "")}</span></div>`;
  }).join("");
}

// 核查清单——```chk 每行：要核实的问题 | 危险信号(可选)。自动编号 01/02…，危险信号自带红旗前缀。
function renderChk(rows: string[]): string {
  let n = 0;
  const items = rows.map((r) => r.trim()).filter(Boolean).map((r) => {
    const c = r.split("|").map((x) => x.trim());
    const box = String(++n).padStart(2, "0");
    const risk = c[1] ? `<div class="chk-r">${inline(c[1])}</div>` : "";
    return `<div class="chk-row"><div class="chk-box">${box}</div><div class="chk-c"><div class="chk-q">${inline(c[0] ?? "")}</div>${risk}</div></div>`;
  });
  return `<div class="chk">${items.join("")}</div>`;
}

export function mdToHouseHtml(md: string): string {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  let quote: string[] | null = null;

  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  // 列表收尾：整段都是「**标签**：一句话」形式（2–8 项）→ 自动排成要点卡片 what-grid（少大段文字的主力）；否则普通列表。
  const LABEL_ITEM = /^\s*\*\*([^*]+?)\*\*\s*[:：]\s*(.+)$/;
  const flushList = () => {
    if (!list) return;
    const items = list; list = null;
    const parsed = items.map((t) => LABEL_ITEM.exec(t));
    if (items.length >= 2 && items.length <= 8 && parsed.every(Boolean)) {
      const cards = parsed.map((m) => `<div class="what-item"><div class="what-label">${inline(m![1].trim())}</div><div class="what-text">${inline(m![2].trim())}</div></div>`).join("");
      out.push(`<div class="what-grid">${cards}</div>`);
    } else {
      out.push(`<ul class="md-list">${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`);
    }
  };
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
      // 首列整体加粗（**合计** / **总计**）→ 合计行语义（tr-bold）；其余行保持无 class。
      const tbody = `<tbody>${rows.map((r) => {
        const total = /^\*\*.+\*\*$/.test((r[0] ?? "").trim());
        return `<tr${total ? ' class="tr-bold"' : ""}>${header.map((_, k) => `<td>${inline(r[k] ?? "")}</td>`).join("")}</tr>`;
      }).join("")}</tbody>`;
      out.push(`<div class="tw"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    if (line === "") { flushAll(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { flushAll(); out.push("<hr>"); continue; }

    // 结构化围栏块：```chain（产业链）/ ```timeline（时间轴）等；其余当代码块。
    // 关键容错：开栏行只要以 ``` 起头即可，lang 之后允许跟中文标题/说明并一律忽略
    //（模型常把「```kpi 关键数字快览」写成一行）。绝不要求开栏行以 lang 结尾——否则带标题的
    // 开栏行不匹配，其配对的收栏 ``` 反被误判为新开栏，把后续整段正文（甚至连着几章）吞进 <pre>。
    if (/^`{3,}/.test(line)) {
      flushAll();
      const lang = (/^`{3,}\s*([a-zA-Z][\w-]*)/.exec(line)?.[1] ?? "").toLowerCase();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^`{3,}\s*$/.test(lines[i].trim())) { body.push(lines[i]); i++; }
      if (lang === "chain") out.push(renderChain(body));
      else if (lang === "timeline") out.push(renderTimeline(body));
      else if (lang === "flow") out.push(renderFlow(body));
      else if (lang === "dealflow") out.push(renderDealflow(body));
      else if (lang === "kpi" || lang === "cards") out.push(renderKpi(body));
      else if (lang === "what") out.push(renderWhat(body));
      else if (lang === "verdict") out.push(renderVerdict(body));
      else if (lang === "mrow" || lang === "bars") out.push(renderMrow(body));
      else if (lang === "chk") out.push(renderChk(body));
      else out.push(`<pre class="md-pre">${escapeHtml(body.join("\n"))}</pre>`);
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushAll();
      const lvl = h[1].length, title = inline(h[2]);
      if (lvl <= 2) out.push(`<div class="chapter"><div class="ch-hd"><div class="ch-meta"><div class="ch-title">${title}</div></div></div></div>`);
      else if (lvl === 3) out.push(`<div class="sec-t">${title}</div>`);
      else out.push(`<div class="sub-tag">${title}</div>`);
      continue;
    }

    const bq = /^>\s?(.*)$/.exec(line);
    if (bq) { flushPara(); flushList(); (quote ??= []).push(bq[1]); continue; }

    const li = /^[-*]\s+(.*)$/.exec(line) ?? /^\d+[.、)]\s+(.*)$/.exec(line);
    if (li) { flushPara(); flushQuote(); (list ??= []).push(li[1]); continue; }

    flushList(); flushQuote(); para.push(line);
  }
  flushAll();
  return out.join("\n");
}

export function buildHouseDoc(bodyHtml: string, css: string, meta: HouseMeta): string {
  const date = new Date().toISOString().slice(0, 10);
  const badges = [...(meta.badges ?? []).filter(Boolean), date]
    .map((b) => `<span class="badge">${escapeHtml(b)}</span>`).join("");
  const sub = meta.subtitle ? `<div class="hero-sub">${escapeHtml(meta.subtitle)}</div>` : "";
  const foot = escapeHtml(meta.foot ?? "本报告由战略发展分析工作台生成；数据以标注的口径与来源为准，请结合尽调与现场核实后再定调。");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(meta.title)}</title><style>${css}</style></head>
<body><div class="wrap">
<div class="hero"><div class="eyebrow">战略发展分析工作台 · 研究报告</div><h1 class="hero-h">${escapeHtml(meta.title)}</h1>${sub}<div class="hero-badges">${badges}</div></div>
${bodyHtml}
<div class="foot">${foot}</div>
</div></body></html>`;
}
