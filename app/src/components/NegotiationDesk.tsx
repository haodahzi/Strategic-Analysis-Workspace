import { useState } from "react";
import { Analysis, QItem } from "../types";
import QuestionList from "./QuestionList";
import { extractPdfText } from "../lib/pdf";

// 洽谈中 · 单屏工作台：对照问题逐条记录（查漏补缺）+ 清单外额外信息 + 事后导入解析。
// 三块合一，不再切 tab。
export default function NegotiationDesk(
  { analysis, questions, onQuestions, notes, onNotes }:
  { analysis: Analysis; questions: QItem[]; onQuestions: (n: QItem[]) => void; notes: string; onNotes: (v: string) => void },
) {
  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState<string[] | null>(null);
  const [pdfBusy, setPdfBusy] = useState("");

  const onUpload = async (f: File | undefined) => {
    if (!f) return;
    if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
      setPdfBusy("解析 PDF…");
      try {
        const text = await extractPdfText(f, (p, t) => setPdfBusy(`解析 PDF… ${p}/${t} 页`));
        setPaste(text);
        setPdfBusy(text.trim() ? "" : "这份 PDF 没提取到文本（多为扫描件 / 图片，需 OCR，暂不支持）");
      } catch (e) { setPdfBusy("PDF 解析失败：" + (e as Error).message.slice(0, 120)); }
      return;
    }
    const r = new FileReader();
    r.onload = () => setPaste(String(r.result ?? ""));
    r.readAsText(f);
  };

  // Mock 解析：真实版由模型把记录逐条映射回前提假设/问题（确认/推翻/新出现）。
  const parse = () => {
    const src = paste.trim();
    if (!src) { setParsed(["（先粘贴或上传洽谈记录文本）"]); return; }
    const db = questions.find((q) => q.dealBreaker);
    setParsed([
      `已读入 ${src.length} 字、约 ${src.split(/\n+/).filter(Boolean).length} 段。`,
      db ? `映射到 deal-breaker 问题：「${db.text}」→ 建议在上面清单里勾「已答」并回填结论。` : "未识别到 deal-breaker 问题，建议先在调研前立起前提。",
      "新出现（原框架未覆盖）：对方提出分期付款诉求 → 已记入下方额外信息，可回灌 Step 0 改框。",
    ]);
  };

  return (
    <div className="nd">
      <div className="sec-head">① 对照问题逐条记录（查漏补缺）</div>
      <QuestionList items={questions} onChange={onQuestions} mode="核对" />

      <div className="sec-head">② 清单外的额外信息（便于整合）</div>
      <textarea
        className="nd-extra"
        value={notes}
        placeholder="清单没覆盖、但值得记的：对方临时抛出的诉求、现场气氛、新冒出的问题…（会自动留在本单）"
        onChange={(e) => onNotes(e.target.value)}
      />

      <div className="sec-head">③ 事后导入 · 解析（同屏，无需切页）
        <label className="mn-upload">上传 PDF / 文本
          <input type="file" accept=".pdf,.txt,.md,.csv,application/pdf,text/plain" onChange={(e) => { void onUpload(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
      {pdfBusy && <div className="set-hint" style={{ marginBottom: 8 }}>{pdfBusy}</div>}
      <textarea
        className="nd-paste"
        value={paste}
        placeholder="粘贴会议纪要 / 转写文本，或点上方「上传 PDF / 文本」自动提取…（语音转写留后续）"
        onChange={(e) => setPaste(e.target.value)}
      />
      <div className="nd-actions">
        <button type="button" className="app-btn" onClick={parse}>解析 → 回映问题清单与前提假设</button>
        {analysis.premises && analysis.premises.length === 0 && <span className="set-hint" style={{ marginLeft: 10 }}>本单尚无前提，可先在调研前生成深度分析。</span>}
      </div>
      {parsed && (
        <div className="mn-parsed">
          <div className="mn-parsed-t">解析结果（初稿 · 请在上面清单里逐条确认）</div>
          {parsed.map((p, i) => (<p key={i}>· {p}</p>))}
        </div>
      )}
    </div>
  );
}
