import { useState } from "react";
import { Analysis } from "../types";

// 洽谈中·记录：现场敲字（live），或事后粘贴/上传文本→解析（V1 只收文本，语音留后续）。
export default function MeetingNotes(
  { analysis, notes, onNotes }:
  { analysis: Analysis; notes: string; onNotes: (v: string) => void },
) {
  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState<string[] | null>(null);

  const onUpload = (f: File | undefined) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPaste(String(r.result ?? ""));
    r.readAsText(f);
  };

  // Mock 解析：真实版由模型把记录逐条映射回前提假设（确认/推翻/新出现）。
  const parse = () => {
    const src = paste.trim();
    if (!src) { setParsed(["（先粘贴或上传洽谈记录文本）"]); return; }
    const dbs = (analysis.premises ?? []).filter((p) => p.dealBreaker).map((p) => p.text);
    setParsed([
      `已读入 ${src.length} 字、约 ${src.split(/\n+/).filter(Boolean).length} 段。`,
      dbs.length ? `映射到 deal-breaker 假设：「${dbs[0]}」→ 标为「待验证」，等你在清单里回填结论。` : "未识别到 deal-breaker 假设，建议先在调研前立起前提。",
      "新出现（原框架未覆盖）：对方提出分期付款诉求 → 可回灌 Step 0 改框。",
    ]);
  };

  return (
    <div className="mn">
      <div className="mn-col">
        <div className="mn-h">现场记录（边谈边敲）</div>
        <textarea
          className="mn-live"
          value={notes}
          placeholder="洽谈进行时直接敲字：谁说了什么、承诺了什么、卡在哪…（自动留在本单）"
          onChange={(e) => onNotes(e.target.value)}
        />
      </div>

      <div className="mn-col">
        <div className="mn-h">事后导入 · 解析
          <label className="mn-upload">上传文本
            <input type="file" accept=".txt,.md,.csv,text/plain" onChange={(e) => onUpload(e.target.files?.[0])} />
          </label>
        </div>
        <textarea
          className="mn-paste"
          value={paste}
          placeholder="粘贴会议纪要 / 转写文本，或点上方「上传文本」…（V1 只收文本，语音转写留后续）"
          onChange={(e) => setPaste(e.target.value)}
        />
        <div className="mn-actions">
          <button type="button" className="app-btn" onClick={parse}>解析 → 映射回前提假设</button>
        </div>
        {parsed && (
          <div className="mn-parsed">
            <div className="mn-parsed-t">解析结果（初稿 · 待你在清单里确认）</div>
            {parsed.map((p, i) => (<p key={i}>· {p}</p>))}
          </div>
        )}
      </div>
    </div>
  );
}
