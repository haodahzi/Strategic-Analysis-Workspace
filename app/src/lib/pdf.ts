// PDF 文本提取（#4a）+ 页面渲染成图片（视觉解析）。懒加载 pdfjs——只有真的用到才拉这段大依赖。
// worker 走 Vite ?url 打包出的本地资源，Tauri file:// 与浏览器都能用。

// 老 WebView（如较旧 macOS WKWebView）没有 Promise.withResolvers，pdfjs v4 会用到，兜个底。
function ensureWithResolvers() {
  const P = Promise as unknown as { withResolvers?: unknown };
  if (typeof P.withResolvers === "function") return;
  P.withResolvers = function <T>() {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (r?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

async function loadPdf(file: File) {
  ensureWithResolvers();
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const buf = await file.arrayBuffer();
  // isEvalSupported:false —— 关掉 eval 路径，恶意 PDF 也无从执行脚本（纵深防御）。
  return pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
}

// 逐页文本（供检测扫描件：某页几乎无字 = 图片版）
export async function extractPdfPages(file: File, onProgress?: (page: number, total: number) => void): Promise<string[]> {
  const doc = await loadPdf(file);
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/[ \t]+/g, " ").trim());
      page.cleanup();
      onProgress?.(i, doc.numPages);
    }
    return pages;
  } finally { await doc.cleanup(); void doc.destroy(); }
}

export async function extractPdfText(file: File, onProgress?: (page: number, total: number) => void): Promise<string> {
  const pages = await extractPdfPages(file, onProgress);
  return pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

// 把 PDF 页面渲染成 PNG（base64 data URL），供视觉模型「看图读」。maxPages 控成本。
export async function renderPdfToImages(
  file: File,
  opts?: { maxPages?: number; scale?: number; pages?: number[] },
  onProgress?: (page: number, total: number) => void,
): Promise<string[]> {
  const doc = await loadPdf(file);
  try {
    const scale = opts?.scale ?? 1.6;
    const list = opts?.pages ?? Array.from({ length: Math.min(doc.numPages, opts?.maxPages ?? 30) }, (_, i) => i + 1);
    const out: string[] = [];
    for (let k = 0; k < list.length; k++) {
      const page = await doc.getPage(list[k]);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (ctx) { await page.render({ canvasContext: ctx, viewport }).promise; out.push(canvas.toDataURL("image/png")); }
      page.cleanup();
      onProgress?.(k + 1, list.length);
    }
    return out;
  } finally { await doc.cleanup(); void doc.destroy(); }
}
