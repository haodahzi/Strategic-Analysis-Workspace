// 视觉解析：把 PDF 页面渲染成图片，交给多模态模型「看图读」，转成忠实 markdown（含表格）。
// 用于扫描件 / 图片版 / 复杂表格——纯文本提取搞不定的场景。走用户在设置里选的「文档视觉模型」。
import { AppConfig } from "./types";
import { providerById } from "../config/store";
import { makeClient } from "./adapters";
import { getLlmFetch } from "./runtime";
import { renderPdfToImages } from "../lib/pdf";

export function visionEnabled(cfg: AppConfig): boolean {
  const p = providerById(cfg, cfg.vision.provider);
  return p.id !== "mock" && !!p.apiKey;
}

const VISION_SYS =
  "你是文档 OCR / 版面识别助手。把给定页面的内容如实转成 markdown：保留标题层级、正文与要点；" +
  "表格务必用 markdown 表格、保住每一个数字；图 / 图表里若有可读数据，转成表格或要点。" +
  "只转录、不发挥、不遗漏数字、不编造；页眉页脚页码可略去。";

export async function visionReadPdf(cfg: AppConfig, file: File, onProgress?: (done: number, total: number) => void): Promise<string> {
  const prov = providerById(cfg, cfg.vision.provider);
  const fetchImpl = await getLlmFetch();
  const client = makeClient(prov, fetchImpl);
  const images = await renderPdfToImages(file, { maxPages: 30, scale: 1.6 });
  const batchSize = 2;   // 每次发 2 页，控成本与上下文
  const parts: string[] = [];
  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);
    onProgress?.(Math.min(i + batch.length, images.length), images.length);
    const res = await client.send({
      model: cfg.vision.model,
      system: VISION_SYS,
      messages: [{ role: "user", content: `这是文档的第 ${i + 1}–${i + batch.length} 页，请如实转成 markdown：` }],
      images: batch,
      maxTokens: 4000,
    });
    if (res.text.trim()) parts.push(res.text.trim());
  }
  return parts.join("\n\n");
}
