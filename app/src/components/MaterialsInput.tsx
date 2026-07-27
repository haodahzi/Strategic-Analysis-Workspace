import { useState } from "react";
import { extractPdfText } from "../lib/pdf";
import { Attachment } from "../llm/pipelineStore";

// 本单资料录入（#5）：手写备注 + 上传多份 PDF / 文本。附件在后台提取正文喂模型，
// 前台只显示文件名与字数（不展示提取出的原文，避免一堆文本糊在界面上）。
export default function MaterialsInput(
  { materials, onMaterials, attachments, onAdd, onRemove, compact }:
  { materials: string; onMaterials: (v: string) => void; attachments: Attachment[]; onAdd: (a: Attachment) => void; onRemove: (name: string) => void; compact?: boolean },
) {
  const [busy, setBusy] = useState("");

  const pick = async (files: FileList | null) => {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) {
      if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
        setBusy(`解析 ${f.name}…`);
        try {
          const text = await extractPdfText(f, (p, t) => setBusy(`解析 ${f.name} · ${p}/${t} 页…`));
          if (text.trim()) { onAdd({ name: f.name, text }); setBusy(""); }
          else setBusy(`${f.name}：未提取到文本（多为扫描件 / 图片，需 OCR，暂不支持）`);
        } catch (e) { setBusy(`${f.name} 解析失败：${(e as Error).message.slice(0, 90)}`); }
      } else {
        try { onAdd({ name: f.name, text: await f.text() }); setBusy(""); }
        catch { setBusy(`${f.name} 读取失败`); }
      }
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
