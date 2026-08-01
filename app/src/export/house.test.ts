import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildHouseDoc, mdToHouseHtml } from "./house";

describe("房子样式渲染（#7/#15）", () => {
  it("标题分级：# / ## → 章（编号）；### → 小节；#### → 副标签", () => {
    const h = mdToHouseHtml("## 供给与格局\n### 主要玩家\n#### 备注");
    expect(h).toContain('class="chapter"');
    expect(h).toContain('class="ch-n">01');
    expect(h).toContain('class="ch-title">供给与格局');
    expect(h).toContain('class="sec-t">主要玩家');
    expect(h).toContain('class="sub-tag">备注');
  });

  it("列表渲染为 md-list", () => {
    const h = mdToHouseHtml("- 甲\n- 乙");
    expect(h).toContain('<ul class="md-list">');
    expect((h.match(/<li>/g) ?? []).length).toBe(2);
  });

  it("引用块按首词判语义：风险→红批注、结论→深色框、洞察→金色洞察", () => {
    expect(mdToHouseHtml("> 风险：数据无法复核")).toContain('class="anno red"');
    expect(mdToHouseHtml("> 结论：谨慎")).toContain('class="insight dark"');
    expect(mdToHouseHtml("> 洞察：利润在中游")).toContain('class="insight gold"');
    expect(mdToHouseHtml("> 一句普通引用")).toContain('class="anno gold"');
  });

  it("表格渲染为房子表格（含滚动容器、表头、单元格对齐列数）", () => {
    const h = mdToHouseHtml("| 指标 | 值 |\n| --- | --- |\n| 毛利 | 20% |\n| 增速 | 30% |");
    expect(h).toContain('<div class="tw"><table>');
    expect(h).toContain("<th>指标</th>");
    expect(h).toContain("<td>毛利</td>");
    expect((h.match(/<tr>/g) ?? []).length).toBe(3); // 1 表头 + 2 数据
  });

  it("全程转义，模型注入的 HTML 不会执行", () => {
    const h = mdToHouseHtml("正文 <script>alert(1)</script> 结束");
    expect(h).toContain("&lt;script&gt;");
    expect(h).not.toContain("<script>");
  });

  it("行内加粗", () => {
    expect(mdToHouseHtml("这是 **重点** 内容")).toContain("<strong>重点</strong>");
  });

  it("```chain 渲染产业链三列，含环节、代表企业标签", () => {
    const h = mdToHouseHtml("```chain\n上游 | 核心零部件 | 企业A、企业B\n中游 | 本体集成 | 企业C\n下游 | 应用场景 | 企业D\n```");
    expect(h).toContain('class="chain"');
    expect((h.match(/class="chain-col/g) ?? []).length).toBe(3);
    expect(h).toContain('class="chain-col mid"');   // 中游高亮
    expect(h).toContain("核心零部件");
    expect(h).toContain('class="tag">企业A</span>');
    expect(h).toContain('class="tag">企业B</span>');
  });

  it("```timeline 渲染时间轴", () => {
    const h = mdToHouseHtml("```timeline\n2020 | 起步 | 少量样机\n2023 | 放量 | 整机厂配套\n```");
    expect(h).toContain('class="tl"');
    expect((h.match(/class="tl-item"/g) ?? []).length).toBe(2);
    expect(h).toContain('class="tl-yr">2020</div>');
    expect(h).toContain("整机厂配套");
  });

  it("buildHouseDoc：独立文档含 doctype / 标题 / 封面 / 页脚 / 内联样式 / 正文", () => {
    const doc = buildHouseDoc('<p>正文</p>', ":root{--bg:#f4f1eb}", { title: "算力租赁 · 行业深度分析", subtitle: "客观研究", badges: ["行业深度分析"] });
    expect(doc).toContain("<!doctype html");
    expect(doc).toContain("<title>算力租赁 · 行业深度分析</title>");
    expect(doc).toContain('class="hero-h">算力租赁 · 行业深度分析');
    expect(doc).toContain("客观研究");
    expect(doc).toContain('class="foot"');
    expect(doc).toContain("--bg:#f4f1eb");
    expect(doc).toContain("<p>正文</p>");
  });
});

// 生成一份中性口径的样例报告（当 HOUSE_OUT 设置时），供人工预览房子样式与语气。非断言。
it("emit demo house report (when HOUSE_OUT set)", () => {
  const out = process.env.HOUSE_OUT;
  if (!out) return;
  const here = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(resolve(here, "../styles/report-house.css"), "utf8");
  const md = [
    "## 行业本质",
    "灵巧手是人形机器人完成精细操作的核心部件，其价值来自把感知、驱动与控制在有限空间内一体化集成。行业当前的收入主要来自整机厂配套与少量科研/演示订单，尚未形成规模化的终端商用。",
    "> 洞察：价值更多沉在触觉传感与微型驱动的一体化环节，而非结构件本身。",
    "",
    "### 需求侧",
    "- 人形机器人整机厂：配套需求随整机出货放量，目前体量小、确定性有限。",
    "- 工业与服务场景：对可靠性、寿命与成本更敏感，导入节奏偏保守。",
    "",
    "## 产业链",
    "```chain",
    "上游 | 触觉传感、微型电机、减速器、控制芯片 | 汉威科技、鸣志电器、兆威机电",
    "中游 | 灵巧手本体设计与集成 | 因时机器人、灵心巧手、强脑科技",
    "下游 | 人形机器人整机与应用场景 | 特斯拉、优必选、宇树科技",
    "```",
    "> 洞察：上游的触觉传感与微型驱动是价值与壁垒所在，中游集成的差异化相对有限。",
    "",
    "## 发展脉络",
    "```timeline",
    "2021 | 概念验证 | 少量科研样机，自由度与成本都不理想",
    "2023 | 整机带动 | 人形机器人热度上行，灵巧手作为配套进入视野",
    "2025 | 小批量导入 | 头部整机厂开始小批量采购，量产良率成为焦点",
    "```",
    "",
    "## 供给与竞争格局",
    "行业处于早期，技术路线（腱驱动 / 连杆 / 直驱等）尚未收敛，参与者以本体新创公司与部分零部件厂商为主。",
    "",
    "| 环节 | 主要参与者 | 集中度 |",
    "| --- | --- | --- |",
    "| 灵巧手总成 | 若干本体厂与新创公司 | 分散 |",
    "| 触觉传感 | 少数专业厂商 | 较集中 |",
    "| 微型驱动 / 减速 | 跨界的传统精密部件厂 | 中等 |",
    "",
    "> 风险：量产良率与成本下降速度存在不确定性，是决定行业能否放量的关键前提；相关数据多为厂商口径，需独立核实。",
    "",
    "## 结论",
    "> 结论：这是一门处于早期、技术路线尚未收敛的部件生意。是否值得进入或合作，主要取决于人形机器人整机的放量节奏与关键传感 / 驱动环节的国产化进度。以上判断基于公开信息，关键量化仍需以标注来源的数据进一步验证。",
  ].join("\n");
  const doc = buildHouseDoc(mdToHouseHtml(md), css, {
    title: "灵巧手 · 行业深度分析", subtitle: "中性研究样例：客观讲清这个部件行业是什么样、如何运转、关键不确定性在哪。", badges: ["行业深度分析", "样例"],
  });
  writeFileSync(out, doc);
  expect(doc.length).toBeGreaterThan(1000);
});
