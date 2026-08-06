import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildHouseDoc, mdToHouseHtml } from "./house";

describe("房子样式渲染（#7/#15）", () => {
  it("标题分级：# / ## → 章（不自动加序号）；### → 小节；#### → 副标签", () => {
    const h = mdToHouseHtml("## 供给与格局\n### 主要玩家\n#### 备注");
    expect(h).toContain('class="chapter"');
    expect(h).not.toContain('ch-n');   // 不再自动加 01/02 序号（#2a）
    expect(h).toContain('class="ch-title">供给与格局');
    expect(h).toContain('class="sec-t">主要玩家');
    expect(h).toContain('class="sub-tag">备注');
  });

  it("列表渲染为 md-list", () => {
    const h = mdToHouseHtml("- 甲\n- 乙");
    expect(h).toContain('<ul class="md-list">');
    expect((h.match(/<li>/g) ?? []).length).toBe(2);
  });

  it("「- **标签**：一句」形式的列表自动排成要点卡 what-grid（少大段文字主力）", () => {
    const h = mdToHouseHtml("- **期限**：大卡主流 3+2\n- **押付**：卖方市场押三付一\n- **违约**：低于承诺按 80% 赔付");
    expect(h).toContain('class="what-grid"');
    expect((h.match(/class="what-item"/g) ?? []).length).toBe(3);
    expect(h).toContain('class="what-label">期限</div>');
    expect(h).toContain('class="what-text">大卡主流 3+2</div>');
    expect(h).not.toContain("md-list");
  });

  it("混合列表（含非标签项）保持普通 md-list，不误转要点卡", () => {
    const h = mdToHouseHtml("- **期限**：大卡 3+2\n- 普通一句话没有标签");
    expect(h).toContain('<ul class="md-list">');
    expect(h).not.toContain("what-grid");
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

  it("```chain 多分组 + ★核心高亮 + 流向脚注", () => {
    const h = mdToHouseHtml("```chain\n上游·供应 | UPSTREAM\n- AI 芯片 | 英伟达、寒武纪\n- 光模块 | 中际旭创\n中游·服务 | MIDSTREAM | mid\n- 算力租赁 ★核心 | 利通电子、协创数据 | hot\n下游·应用 | DOWNSTREAM\n- 互联网 | 阿里、腾讯\n~ 算力自上而下、资金自下而上\n```");
    expect((h.match(/class="chain-col/g) ?? []).length).toBe(3);
    expect(h).toContain('class="cgrp hot"');
    expect(h).toContain('class="tag">利通电子</span>');
    expect(h).toContain('class="chain-flow"');
    expect(h).toContain("英伟达");
    expect(h).toContain("光模块");
  });

  it("```flow 渲染交易结构：节点 + 标签 + 虚实线", () => {
    const h = mdToHouseHtml("```flow\n资金方 | 集成商 | 采购款 | solid\n资金方 | 运营方 | 出资/持有 | dashed\n```");
    expect(h).toContain('class="flowdiag"');
    expect((h.match(/class="flow-node"/g) ?? []).length).toBe(4);
    expect(h).toContain('class="flow-lbl">采购款</span>');
    expect(h).toContain('class="flow-edge dashed"');   // 服务/持有 → 虚线
  });

  it("```dealflow 渲染 2D 中心辐射图（SVG：中心方红、连线、箭头、虚实线）", () => {
    const h = mdToHouseHtml("```dealflow\nhub | 运营方 | 上架·运维\n资金方 | 自有资金 | tl\n客户 | 大模型 | r\n> 资金方 | hub | 出资 | dashed\n> 客户 | hub | 租金 | solid\n```");
    expect(h).toContain('class="diagram"');
    expect(h).toContain("<svg");
    expect(h).toContain('fill="#b03020"');         // 中心方红色
    expect(h).toContain("stroke-dasharray");        // 虚线（服务/持有）
    expect(h).toContain("<polygon");                // 箭头
    expect(h).toContain(">运营方</text>");
    expect(h).toContain(">租金</text>");
  });

  it("```timeline 渲染时间轴", () => {
    const h = mdToHouseHtml("```timeline\n2020 | 起步 | 少量样机\n2023 | 放量 | 整机厂配套\n```");
    expect(h).toContain('class="tl"');
    expect((h.match(/class="tl-item"/g) ?? []).length).toBe(2);
    expect(h).toContain('class="tl-yr">2020</div>');
    expect(h).toContain("整机厂配套");
  });

  it("```kpi 关键数字快览：按条数选栅格 + 语义色（仅认 teal/gold/red/blue）", () => {
    const h = mdToHouseHtml("```kpi\n年收入 | 197亿 | | 2年CAGR 32%\n净利率 | 21.4% | teal | 持续改善\n在手订单 | 594 | gold | 单位:个\n```");
    expect(h).toContain('class="g3"');                          // 3 条 → g3
    expect(h).toContain('class="card-tag">年收入</div>');
    expect(h).toContain('class="card-val">197亿</div>');         // 无色
    expect(h).toContain('class="card-val teal">21.4%</div>');    // teal
    expect(h).toContain('class="card-val gold">594</div>');
    expect(h).toContain('class="card-sub">2年CAGR 32%</div>');
  });

  it("回归：开栏行带中文标题（```kpi 关键数字快览）正确解析，且绝不吞掉后续章节", () => {
    const md = [
      "```kpi 关键数字快览",
      "规模 | 197亿 | gold | 口径待核",
      "增速 | 42% | teal |",
      "```",
      "",
      "## 一、行业本质",
      "正文一句话。",
      "## 二、需求侧",
      "正文两句话。",
    ].join("\n");
    const h = mdToHouseHtml(md);
    expect(h).toContain('class="g2"');                       // 带标题的开栏也渲染成卡片
    expect(h).toContain('class="card-val gold">197亿</div>');
    expect(h).toContain('class="ch-title">一、行业本质');    // 后续两章各自独立、序号保留
    expect(h).toContain('class="ch-title">二、需求侧');
    expect(h).not.toContain("md-pre");                       // 绝不串成一个 <pre>
  });

  it("回归：```what 开栏行带标题不破坏解析、不吞后文", () => {
    const md = ["```what 典型收入模型", "订阅制 | 付费用户数 × ARPPU", "* API | 调用量 × 单价", "```", "", "## 下一章", "正文。"].join("\n");
    const h = mdToHouseHtml(md);
    expect(h).toContain('class="what-grid"');
    expect(h).toContain('class="what-item key"');
    expect(h).toContain('class="ch-title">下一章');
    expect(h).not.toContain("md-pre");
  });

  it("```what 要点块（★拆段主力）：* 开头 / key 标记 → 重点项（金色左边）", () => {
    const h = mdToHouseHtml("```what\n* 关键要点 | 一句话说清 **重点**\n普通要点 | 一句话说清\n```");
    expect(h).toContain('class="what-grid"');
    expect(h).toContain('class="what-item key"');               // * → 重点
    expect(h).toContain('class="what-item"><div class="what-label">普通要点');
    expect(h).toContain('class="what-label">关键要点</div>');
    expect(h).toContain("<strong>重点</strong>");
  });

  it("```verdict 综合研判：利好→bull / 需冷静→bear / 核心结论→note，可自定标题", () => {
    const h = mdToHouseHtml("```verdict\n# 综合研判\n利好 | 需求向上\n需冷静 | 数据待核\n核心结论 | 早期部件生意\n```");
    expect(h).toContain('class="verdict"');
    expect(h).toContain('class="verdict-t">综合研判</div>');
    expect(h).toContain('class="v-tag bull">利好</span>');
    expect(h).toContain('class="v-tag bear">需冷静</span>');
    expect(h).toContain('class="v-tag note">核心结论</span>');
  });

  it("```mrow 指标条：百分比夹到 0–100、语义色（缺省 gold）、显示值", () => {
    const h = mdToHouseHtml("```mrow\n2024现金流 | 45 | 44.9亿 | teal\n2025现金流 | 160 | 96亿+ |\n```");
    expect((h.match(/class="mrow"/g) ?? []).length).toBe(2);
    expect(h).toContain("width:45%;background:var(--teal)");
    expect(h).toContain("width:100%;background:var(--gold)");    // 160 夹到 100、无色回退 gold
    expect(h).toContain('class="mrow-val">44.9亿</span>');
  });

  it("```chk 核查清单：自动编号 01/02 + 危险信号", () => {
    const h = mdToHouseHtml("```chk\n资质是否齐全？ | 缺牌照即红线\n数据能否复核？ | 只有厂商口径\n```");
    expect(h).toContain('class="chk"');
    expect(h).toContain('class="chk-box">01</div>');
    expect(h).toContain('class="chk-box">02</div>');
    expect(h).toContain('class="chk-q">资质是否齐全？</div>');
    expect(h).toContain('class="chk-r">缺牌照即红线</div>');
  });

  it("```groups 分组要点块（变体A）：编号 01/02、语义色轮转、组内标签+说明、可选行动式小标题", () => {
    const h = mdToHouseHtml([
      "```groups",
      "# 三类风险里经营与财务最该盯",
      "经营与财务",
      "- 盈利可持续性 | 累计未弥补亏损",
      "- 客户集中度 | 前五大占比偏高",
      "技术与产业链",
      "- 技术迭代 | 能否追赶先进制程",
      "```",
    ].join("\n"));
    expect(h).toContain('class="grp-cap">三类风险里经营与财务最该盯</div>');
    expect(h).toContain('class="groups"');
    expect(h).toContain('class="grp c-red"');                  // 第 1 组 red
    expect(h).toContain('class="grp c-gold"');                 // 第 2 组 gold（轮转）
    expect(h).toContain('class="grp-n">01</span>');
    expect(h).toContain('class="grp-n">02</span>');
    expect(h).toContain("<h4>经营与财务</h4>");
    expect(h).toContain("<b>盈利可持续性</b><span>累计未弥补亏损</span>");
  });

  it("```drivers 驱动树三支柱（方案②）：首行结论横梁 + 每根支柱 + 支柱数对应 ▲", () => {
    const h = mdToHouseHtml([
      "```drivers",
      "行业需求扩张 ＝ 三重驱动共同支撑",
      "场景碎片化 | 商用嵌入酒店/办公/车",
      "政策导向 | 家电×AI×物联网融合",
      "人口结构长逻辑 | 老龄化+职场亚健康",
      "```",
    ].join("\n"));
    expect(h).toContain('class="drv-beam">行业需求扩张 ＝ 三重驱动共同支撑</div>');
    expect(h).toContain('class="drv-pillars"');
    expect((h.match(/class="drv-col"/g) ?? []).length).toBe(3);
    expect((h.match(/▲/g) ?? []).length).toBe(3);              // 三根支柱三个 ▲
    expect(h).toContain("<b>场景碎片化</b><small>商用嵌入酒店/办公/车</small>");
  });

  it("表格合计行：首列 **加粗** → tr-bold；普通行仍是 <tr>", () => {
    const h = mdToHouseHtml("| 项 | 值 |\n| --- | --- |\n| 收入 | 100 |\n| **合计** | 130 |");
    expect(h).toContain('<tr class="tr-bold">');
    expect(h).toContain("<strong>合计</strong>");
    expect((h.match(/<tr>/g) ?? []).length).toBe(2);   // 表头 + 收入行；合计行带 class 不计入
  });

  it("未知围栏语言仍回退为代码块（不误伤）", () => {
    const h = mdToHouseHtml("```python\nprint(1)\n```");
    expect(h).toContain('class="md-pre"');
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
    "- **人形机器人整机厂**：配套需求随整机出货放量，目前**体量小、确定性有限**。",
    "- **工业 / 服务场景**：对可靠性、寿命与成本更敏感，导入节奏偏**保守**。",
    "",
    "## 产业链",
    "```chain",
    "上游·核心零部件 | UPSTREAM",
    "- 触觉传感（壁垒/利润最高） | 汉威科技、柯力传感、能斯达",
    "- 微型电机 / 减速器 | 鸣志电器、兆威机电、绿的谐波",
    "- 控制芯片 | 兆易创新、峰岹科技",
    "中游·本体集成 | MIDSTREAM | mid",
    "- 灵巧手本体 ★本报告核心 | 因时机器人、灵心巧手、强脑科技、傲意科技 | hot",
    "- 关节 / 模组 | 绿的谐波、步科股份",
    "下游·整机与应用 | DOWNSTREAM",
    "- 人形机器人整机 | 特斯拉、优必选、宇树科技、智元机器人",
    "- 工业 / 服务场景 | 工业产线、医疗康复、服务机器人",
    "~ 上游 → 下游为产品流，价值与议价力集中在上游传感与中游集成",
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
    "```mrow",
    "触觉传感 · 国产化率 | 35 | ~35% | red",
    "微型驱动 / 减速 · 国产化率 | 55 | ~55% | gold",
    "控制芯片 · 国产化率 | 25 | ~25% | red",
    "```",
    "> 风险：量产良率与成本下降速度存在不确定性，是决定行业能否放量的关键前提；相关数据多为厂商口径，需独立核实。",
    "",
    "## 交易结构（项目分析示例）",
    "```dealflow",
    "hub | 算力租赁运营方 | 上架·调度·运维·签约",
    "资金方/投资人 | 自有资金 / 融资租赁 | tl",
    "卡源/集成商 | 英伟达渠道·超聚变·浪潮 | l",
    "客户/消纳方 | 大模型公司·互联网大厂·政企 | r",
    "场地方/IDC | 土地·电力·能耗·机柜·液冷 | b",
    "> 资金方/投资人 | 卡源/集成商 | 采购款 | solid",
    "> 卡源/集成商 | hub | GPU 服务器 | solid",
    "> 资金方/投资人 | hub | 出资/持有资产 | dashed",
    "> 客户/消纳方 | hub | 租金 | solid",
    "> hub | 客户/消纳方 | 算力/Token 服务 | dashed",
    "> hub | 场地方/IDC | 机柜·电力·运维费 | solid",
    "```",
    "",
    "## 结论",
    "```verdict",
    "利好 | 人形机器人整机放量将直接带动灵巧手配套需求，上游触觉传感与微型驱动是价值与壁垒高地。",
    "需冷静 | 量产良率与成本下降速度尚不确定，相关数据多为厂商口径、需独立核实。",
    "核心结论 | 这是一门处于早期、技术路线尚未收敛的部件生意；是否值得进入或合作，主要取决于整机放量节奏与关键环节国产化进度。以上判断基于公开信息，关键量化仍需以标注来源的数据进一步验证。",
    "```",
  ].join("\n");
  const doc = buildHouseDoc(mdToHouseHtml(md), css, {
    title: "灵巧手 · 行业深度分析", subtitle: "中性研究样例：客观讲清这个部件行业是什么样、如何运转、关键不确定性在哪。", badges: ["行业深度分析", "样例"],
  });
  writeFileSync(out, doc);
  expect(doc.length).toBeGreaterThan(1000);
});
