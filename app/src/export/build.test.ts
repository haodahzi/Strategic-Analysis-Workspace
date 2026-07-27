import { describe, it, expect } from "vitest";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildCleanDoc, buildStandaloneHtml, buildWordHtml, escapeHtml } from "./build";

const css = ":root{--gold:#9a6c00}\n.report .hero{padding:1px}";
const inner = '<div class="report"><div class="wrap"><h1 class="hero-h">判断的样子</h1></div></div>';

describe("导出构建器", () => {
  it("escapeHtml 正确转义", () => {
    expect(escapeHtml('a<b>&"c')).toBe("a&lt;b&gt;&amp;&quot;c");
  });

  it("自包含 HTML 含 doctype / 标题 / 内联 CSS / 内容", () => {
    const h = buildStandaloneHtml(inner, css, "行业分析");
    expect(h).toContain("<!doctype html");
    expect(h).toContain("<title>行业分析</title>");
    expect(h).toContain("--gold:#9a6c00");
    expect(h).toContain("判断的样子");
  });

  it("Word 文档含 mso 命名空间 / WordSection / A4 @page / 内容", () => {
    const w = buildWordHtml(inner, css, "行业分析");
    expect(w).toContain('xmlns:w="urn:schemas-microsoft-com:office:word"');
    expect(w).toContain('<div class="WordSection1">');
    expect(w).toContain("@page WordSection1");
    expect(w).toContain("判断的样子");
  });

  it("清洁版文档：doctype / 标题 / 副标题 / 自带样式 / 打印 @page / 内容", () => {
    const c = buildCleanDoc('<div class="md"><div class="md-h2">格局</div><p>正文</p></div>', "算力租赁·深度分析", "我方视角：资金方");
    expect(c).toContain("<!doctype html");
    expect(c).toContain("<h1 class=\"c-title\">算力租赁·深度分析</h1>");
    expect(c).toContain("我方视角：资金方");
    expect(c).toContain(".md-h2");
    expect(c).toContain("@page");
    expect(c).toContain("格局");
  });
});

// 生成演示产物（真实报告的 .html / .doc）到 EXPORT_OUT，供在 Word/浏览器中人工验证。
// 非断言：仅在设置了 EXPORT_OUT 时写文件，不影响常规 CI。
it("emit demo exports (when EXPORT_OUT set)", () => {
  const outDir = process.env.EXPORT_OUT;
  if (!outDir) return;
  const here = dirname(fileURLToPath(import.meta.url));
  const appRoot = resolve(here, "../..");
  const cssFull = readFileSync(resolve(appRoot, "src/styles/report.css"), "utf8");
  const sample = readFileSync(resolve(appRoot, "src/assets/suanli-sample.html"), "utf8");
  const start = sample.indexOf('<div class="wrap">');
  const bodyEnd = sample.indexOf("</body>");
  const lastDiv = sample.lastIndexOf("</div>", bodyEnd);
  const wrapInner = sample.slice(start + '<div class="wrap">'.length, lastDiv);
  const reportHtml = `<div class="report"><div class="wrap">${wrapInner}</div></div>`;
  const title = "算力租赁·行业深度分析";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, `${title}.html`), buildStandaloneHtml(reportHtml, cssFull, title));
  writeFileSync(resolve(outDir, `${title}.doc`), "﻿" + buildWordHtml(reportHtml, cssFull, title));
  expect(wrapInner.length).toBeGreaterThan(1000);
});
