import { useEffect, useRef, useState } from "react";
import { extractPdfPages } from "../lib/pdf";
import { visionEnabled, visionReadPdf } from "../llm/visionExtract";
import { loadConfig } from "../config/store";
import { Attachment } from "../llm/pipelineStore";
import { effectiveSources } from "../sources/registry";
import { listenDownload, listenGrab, listenReports, openExternal, openSource, readDownload } from "../sources/browser";
import { buildReportClipping } from "../sources/scrape";

// 本单资料录入（#5）：手写备注 + 上传多份 PDF / 文本。附件后台提取正文喂模型，前台只显示文件名与字数。
// 文字版 PDF 走文本提取；扫描件 / 图片版自动、或勾「视觉精读」强制走文档视觉模型（看图转 markdown）。
export default function MaterialsInput(
  { materials, onMaterials, attachments, onAdd, onRemove, compact }:
  { materials: string; onMaterials: (v: string) => void; attachments: Attachment[]; onAdd: (a: Attachment) => void; onRemove: (name: string) => void; compact?: boolean },
) {
  const [busy, setBusy] = useState("");
  const [visionForce, setVisionForce] = useState(false);
  const sources = effectiveSources(loadConfig().dataSources).filter((s) => s.enabled && s.kind !== "api");

  // 抓取回传 → 加入本单资料，带来源链接。用 ref 始终调最新 onAdd。
  const addRef = useRef(onAdd);
  addRef.current = onAdd;
  const importRef = useRef<(f: File) => Promise<void>>(async () => {});
  useEffect(() => {
    let unG = () => {}, unR = () => {}, unD = () => {};
    // ① 单页正文
    void listenGrab((it) => { addRef.current({ name: it.name, text: it.text, url: it.url }); setBusy(`已抓取「${it.name}」加入本单`); }).then((f) => { unG = f; });
    // ② 研报清单（站内自动抓取）：原始候选 → scrape.ts 打分成清单
    void listenReports((p) => {
      const clip = buildReportClipping(p.source, p.pageUrl, p.items);
      if (clip) { addRef.current({ name: clip.name, text: clip.text, url: clip.url }); setBusy(`已抓取${clip.name}`); }
      else setBusy("本页没识别到研报条目，可改用「下载研报→上传」");
    }).then((f) => { unR = f; });
    // ③ 站内点「下载」研报 → 读回文件 → pdfjs 抽取自动入库（省去手动上传）
    void listenDownload(async (d) => {
      try {
        setBusy(`从下载导入「${d.name}」…`);
        const buf = await readDownload(d.path);
        const file = new File([buf], d.name, { type: /\.pdf$/i.test(d.name) ? "application/pdf" : "" });
        await importRef.current(file);
      } catch (e) { setBusy(`「${d.name}」导入失败：${(e as Error).message.slice(0, 90)}`); }
    }).then((f) => { unD = f; });
    return () => { unG(); unR(); unD(); };
  }, []);

  const openSrc = async (id: string, url: string, name: string) => {
    setBusy(`打开「${name}」…`);
    const msg = await openSource(id, url, name);
    setBusy(msg || `已在内置浏览器打开「${name}」：登录后下载研报回来上传，或用页内「抓取本页研报清单 / 正文」`);
  };
  const openExt = async (url: string, name: string) => {
    setBusy(`用系统浏览器打开「${name}」…`);
    const msg = await openExternal(url, name);
    if (msg) setBusy(msg); else setBusy(`已在系统浏览器打开「${name}」：登录后下载研报回工作台上传`);
  };

  // 单个文件入库：PDF 走文本提取（扫描件 / 复杂表格转视觉精读），其余按文本读入。手动上传与「下载自动入库」共用。
  const importFile = async (f: File) => {
    const cfg = loadConfig();
    if (!(/\.pdf$/i.test(f.name) || f.type === "application/pdf")) {
      try { onAdd({ name: f.name, text: await f.text() }); setBusy(`已导入「${f.name}」`); } catch { setBusy(`${f.name} 读取失败`); }
      return;
    }
    setBusy(`解析 ${f.name}…`);
    try {
      const pages = await extractPdfPages(f, (p, t) => setBusy(`解析 ${f.name} · ${p}/${t} 页…`));
      const textLen = pages.join("").replace(/\s/g, "").length;
      const scanned = textLen < Math.max(40, pages.length * 8);   // 每页平均不到约 8 个非空白字 → 判扫描件
      if (visionForce || scanned) {
        if (!visionEnabled(cfg)) {
          setBusy(`${f.name}：${scanned ? "像是扫描件 / 图片版" : "已勾视觉精读"}，需先到「设置 → 文档视觉模型」配一个带视觉的模型`);
          return;
        }
        setBusy(`视觉精读 ${f.name}…（较慢）`);
        const text = await visionReadPdf(cfg, f, (d, t) => setBusy(`视觉精读 ${f.name} · ${d}/${t} 页…`));
        if (text.trim()) { onAdd({ name: f.name, text }); setBusy(`已导入「${f.name}」· ${text.length} 字`); }
        else setBusy(`${f.name}：视觉模型没读出内容`);
      } else {
        const text = pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
        if (text.trim()) { onAdd({ name: f.name, text }); setBusy(`已导入「${f.name}」· ${text.length} 字`); }
        else setBusy(`${f.name}：未提取到文本（可勾「视觉精读」用视觉模型再试）`);
      }
    } catch (e) { setBusy(`${f.name} 处理失败：${(e as Error).message.slice(0, 90)}`); }
  };
  importRef.current = importFile;

  const pick = async (files: FileList | null) => {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) await importFile(f);
  };

  return (
    <div className="mi">
      <textarea className="key-input wide" rows={compact ? 3 : 4} value={materials}
        placeholder="你的备注 / 已知要点（选填）：想让分析盯住什么、已知的关键事实…"
        onChange={(e) => onMaterials(e.target.value)} />
      {sources.length > 0 && (
        <div className="mi-src">
          <span className="mi-src-lb">从信息源获取</span>
          {sources.map((s) => (
            <span key={s.id} className="src-chip-wrap">
              <button type="button" className="src-chip" title={`内置浏览器打开（登录态留本机）｜登录方式：${s.login}｜网址可在「设置 → 数据源」改`}
                onClick={() => void openSrc(s.id, s.url, s.name)}>{s.name}</button>
              <button type="button" className="src-ext" title="内置打不开时用它：系统默认浏览器打开"
                onClick={() => void openExt(s.url, s.name)}>↗</button>
            </span>
          ))}
          <span className="mi-src-tip">登录后在站内点「下载」研报，会自动抽取入库（无需手动上传）；或用页内「抓取本页研报清单 / 正文」；内置打不开点 ↗ 走系统浏览器</span>
        </div>
      )}
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
