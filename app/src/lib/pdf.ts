// PDF 尽调稿文本提取（#4a）：懒加载 pdfjs——只有用户真的传 PDF 时才拉这段大依赖，
// 不拖累工作台首屏。worker 走 Vite ?url 打包出的本地资源，Tauri file:// 与浏览器都能用。

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

export async function extractPdfText(file: File, onProgress?: (page: number, total: number) => void): Promise<string> {
  ensureWithResolvers();
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  // isEvalSupported:false —— 关掉 eval 路径，恶意 PDF 也无从执行脚本（纵深防御）。
  const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  try {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
      page.cleanup();
      onProgress?.(i, doc.numPages);
    }
    return pages.join("\n\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  } finally {
    await doc.cleanup();
    void doc.destroy();
  }
}
