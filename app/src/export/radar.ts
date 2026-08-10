// 自绘雷达图（五边形 / 六边形皆可）：纯函数返回自包含 <svg> 字符串，颜色内联，
// 既用于工作台内的 React 组件，也用于导出报告的 house ```radar 渲染，两处观感一致。
export interface RadarAxis { label: string; value: number; }
export interface RadarOpts { max?: number; size?: number; title?: string; }

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

export function radarSvg(axes: RadarAxis[], opts: RadarOpts = {}): string {
  const n = axes.length;
  if (n < 3) return "";
  const max = opts.max ?? 10;
  const size = opts.size ?? 300;
  const cx = size / 2;
  const cy = size / 2 + 8;
  const R = size * 0.32;
  const ink = "#2b2b2b", grid = "#d9d3c7", teal = "#2f7d5e", fill = "rgba(47,125,94,.15)";
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;                 // 从正上方顺时针
  const pt = (i: number, r: number): [number, number] => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const clampV = (v: number) => Math.max(0, Math.min(max, v));

  const rings: string[] = [];
  for (let g = 1; g <= 5; g++) {
    const r = (R * g) / 5;
    const p = axes.map((_, i) => pt(i, r).map((v) => v.toFixed(1)).join(",")).join(" ");
    rings.push(`<polygon points="${p}" fill="none" stroke="${grid}" stroke-width="1"/>`);
  }

  const spokes: string[] = [], labels: string[] = [];
  axes.forEach((a, i) => {
    const [x, y] = pt(i, R);
    spokes.push(`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${grid}" stroke-width="1"/>`);
    const [lx, ly] = pt(i, R + 22);
    const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx > cx ? "start" : "end";
    labels.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="12" fill="${ink}" font-family="system-ui,-apple-system,sans-serif">${esc(a.label)}</text>`);
    labels.push(`<text x="${lx.toFixed(1)}" y="${(ly + 15).toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" font-weight="700" fill="${teal}" font-family="system-ui,-apple-system,sans-serif">${a.value.toFixed(1)}</text>`);
  });

  const dpoly = axes.map((a, i) => pt(i, (R * clampV(a.value)) / max).map((v) => v.toFixed(1)).join(",")).join(" ");
  const dots = axes.map((a, i) => { const [x, y] = pt(i, (R * clampV(a.value)) / max); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${teal}"/>`; }).join("");
  const title = opts.title ? `<text x="${cx}" y="16" text-anchor="middle" font-size="13" font-weight="700" fill="${ink}" font-family="system-ui,-apple-system,sans-serif">${esc(opts.title)}</text>` : "";

  const padX = 68;                                                      // 左右留白，容下「风险可控性 / 主要客商资信」等轴标签，避免被裁切
  const vbW = size + padX * 2, vbH = size + 34;
  return `<svg viewBox="${-padX} 0 ${vbW} ${vbH}" width="${vbW}" height="${vbH}" role="img" class="radar-svg" xmlns="http://www.w3.org/2000/svg">${title}${rings.join("")}${spokes.join("")}<polygon points="${dpoly}" fill="${fill}" stroke="${teal}" stroke-width="2" stroke-linejoin="round"/>${dots}${labels.join("")}</svg>`;
}
