import { useState } from "react";
import { extractPdfPages } from "../lib/pdf";
import { visionEnabled, visionReadPdf } from "../llm/visionExtract";
import { loadConfig } from "../config/store";
import { Attachment } from "../llm/pipelineStore";

// 本单资料录入（#5）：手写备注 + 上传多份 PDF / 文本。附件后台提取正文喂模型，前台只显示文件名与字数。
// 文字版 PDF 走文本提取；扫描件 / 图片版自动、或勾「视觉精读」强制走文档视觉模型（看图转 markdown）。
export default function MaterialsInput(
  { materials, onMaterials, attachments, onAdd, onRemove, compact }:
  { materials: string; onMaterials: (v: string) => void; attachments: Attachment[]; onAdd: (a: Attachment) => void; onRemove: (name: string) => void; compact?: boolean },
) {
  const [busy, setBusy] = useState("");
  const [visionForce, setVisionForce] = useState(false);

  const pick = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const cfg = loadConfig();
    for (const f of Array.from(files)) {
      if (!(/\.pdf$/i.test(f.name) || f.type === "application/pdf")) {
        try { onAdd({ name: f.name, text: await f.text() }); setBusy(""); } catch { setBusy(`${f.name} 读取失败`); }
        continue;
      }
      setBusy(`解析 ${f.name}…`);
      try {
        const pages = await extractPdfPages(f, (p, t) => setBusy(`解析 ${f.name} · ${p}/${t} 页…`));
        const textLen = pages.join("").replace(/\s/g, "").length;
        const scanned = textLen < Math.max(40, pages.length * 8);   // 每页平均不到约 8 个非空白字 → 判扫描件
        if (visionForce || scanned) {
          if (!visionEnabled(cfg)) {
            setBusy(`${f.name}：${scanned ? "像是扫描件 / 图片版" : "已勾视觉精读"}，需先到「设置 → 文档视觉模型」配一个带视觉的模型`);
            continue;
          }
          setBusy(`视觉精读 ${f.name}…（较慢）`);
          const text = await visionReadPdf(cfg, f, (d, t) => setBusy(`视觉精读 ${f.name} · ${d}/${t} 页…`));
          if (text.trim()) { onAdd({ name: f.name, text }); setBusy(""); }
          else setBusy(`${f.name}：视觉模型没读出内容`);
        } else {
          const text = pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
          if (text.trim()) { onAdd({ name: f.name, text }); setBusy(""); }
          else setBusy(`${f.name}：未提取到文本（可勾「视觉精读」用视觉模型再试）`);
        }
      } catch (e) { setBusy(`${f.name} 处理失败：${(e as Error).message.slice(0, 90)}`); }
    }
  };

  return (
    <div className="mi">
      <textarea className="key-input wide" rows={compact ? 3 : 4} value={materials}
        placeholder="你的备注 / 已知要点（选填）：想让分析盯住什么、已知的关键事实…"
        onChange={(e) => onMaterials(e.target.value)} />
      <div className="mi-row">
        <label className="mn-upload">＋ 上传 PDF / 文本（可多选）
          <input type="file" multiple accept=".pdf,.txt,.md,application/pdf,text/plain"
            onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
        </label>
        <label className="mi-check" title="扫描件/图片版会自动走视觉；表格特别多的数字版也可勾它强制看图读">
          <input type="checkbox" checked={visionForce} onChange={(e) => setVisionForce(e.target.checked)} /> 视觉精读（扫描件 / 复杂表格）
        </label>
        {busy && <span className="set-hint mi-busy">{busy}</span>}
      </div>
      {attachments.length > 0 && (
        <div className="att-list">
          {attachments.map((a) => (
            <span key={a.name} className="att-chip" title={`${a.text.length} 字，已提取喂给模型`}>
              📄 {a.name} · {a.text.length} 字
              <button type="button" className="att-x" onClick={() => onRemove(a.name)} aria-label="移除">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
