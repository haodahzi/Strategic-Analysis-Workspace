import { useRef } from "react";
import { saveHtmlDoc } from "../export/exporter";

// 报告「一键排版」全屏查看器（#7）：iframe 隔离渲染，样式不与工作台冲突；
// 同一份 doc 既用于查看也用于导出，所见即所得。可打印 / 存 PDF、另存 HTML。
export default function ReportView({ title, doc, onClose }: { title: string; doc: string; onClose: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const print = () => { try { ref.current?.contentWindow?.focus(); ref.current?.contentWindow?.print(); } catch { /* 退化：可先导出 HTML 再 Ctrl+P */ } };
  return (
    <div className="rv-overlay">
      <div className="rv-bar">
        <button type="button" className="rv-close" onClick={onClose}>← 关闭</button>
        <div className="rv-title">{title}</div>
        <div className="rv-actions">
          <button type="button" className="app-btn ghost" onClick={print}>打印 / 存 PDF</button>
          <button type="button" className="app-btn" onClick={() => void saveHtmlDoc(title, doc)}>导出 HTML</button>
        </div>
      </div>
      <iframe ref={ref} className="rv-frame" title={title} srcDoc={doc} sandbox="allow-same-origin allow-modals allow-popups" />
    </div>
  );
}
