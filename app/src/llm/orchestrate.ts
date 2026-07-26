// Step 0 · 行业定框：为一个行业搭「投研级」研究框架。
// 输出 markdown（稳健，不依赖严格 JSON——这也修掉了旧结构化在非 Claude 模型上回退默认的问题）。
import { ChatRequest, LLMClient } from "./types";
import { loadConfig, providerById } from "../config/store";
import { makeClient } from "./adapters";
import { getLlmFetch } from "./runtime";

export interface Step0Input { industry: string; ourRole: string; lightScan: string; }
export interface Step0Run { markdown: string; providerLabel: string; model: string; }

// 行业深度研究框架板块（投研/战略咨询约定俗成的方法论组合）
export const FRAME_SECTIONS = [
  "行业定义与生命周期", "市场规模与增长", "宏观与政策(PEST)", "需求端", "供给端",
  "竞争格局(波特五力)", "产业链/价值链", "商业模式与盈利公式", "关键成功要素与护城河",
  "关键企业/标杆", "周期与时点", "风险与命门",
];

export function buildStep0Request(input: Step0Input, model: string): ChatRequest {
  const system =
    "你是资深行业研究员（投研 / 战略咨询背景），精通行业深度研究的标准方法论：行业生命周期、" +
    "市场规模(TAM/SAM/SOM 与 CAGR)、PEST、波特五力、产业链 / 价值链（微笑曲线、利润池）、" +
    "单位经济、护城河与关键成功要素(KSF)。产出专业、结构化、可落地的研究框架。" +
    "直接输出正文，不写「作为分析师」「以下是」这类套话、不复述任务。";
  const user =
    `为「${input.industry}」行业搭一份深度研究框架（我方角色：${input.ourRole}；已知碎片：${input.lightScan || "无"}）。\n` +
    `用 markdown（## 板块 + 要点列表）。按行业研究通用方法论组织，对每块给「要研究什么 / 关键问题 / 初步判断（标推测、待核）」：\n` +
    `1. 行业定义与生命周期：边界与统计口径；处于 导入 / 成长 / 成熟 / 衰退 哪一阶段\n` +
    `2. 市场规模与增长：TAM/SAM/SOM、历史与预期 CAGR、渗透率与 S 曲线位置、量价拆解\n` +
    `3. 宏观与政策（PEST）：政策 / 监管 / 补贴、经济周期、社会需求、技术变迁\n` +
    `4. 需求端：需求结构与分层、驱动与弹性、真需求 vs 伪需求\n` +
    `5. 供给端：产能格局、供给约束（牌照 / 资源 / 技术）、产能周期与扩张节奏\n` +
    `6. 竞争格局（波特五力）：现有竞争强度（集中度 CR/HHI、竞争梯队）、潜在进入者与壁垒、替代品、供应商议价力、买方议价力\n` +
    `7. 产业链 / 价值链：上中下游拆解、价值分布（微笑曲线）、利润池在哪段、卡脖子环节\n` +
    `8. 商业模式与盈利公式：怎么赚钱、单位经济（收入＝量×价、成本结构、毛利 / 净利驱动）、现金流与账期、规模效应\n` +
    `9. 关键成功要素(KSF)与护城河：赢家靠什么、护城河类型（规模 / 网络 / 品牌 / 牌照 / 技术 / 切换成本）\n` +
    `10. 关键企业 / 标杆：龙头与各环节代表、市占与打法差异、可复制性\n` +
    `11. 周期与时点：结合生命周期与当下供需 / 价格，说明现在是什么时点、意味着什么\n` +
    `12. 风险与命门：有名有姓的风险（政策 / 技术替代 / 产能过剩 / 价格战）+ 能一票否决的命门变量 + 前瞻信号\n` +
    `结尾用「## 本框架可能漏了什么」做一句自检。`;
  return { model, system, messages: [{ role: "user", content: user }], maxTokens: 5000 };
}

export async function runStep0(input: Step0Input, client: LLMClient, model: string): Promise<string> {
  const res = await client.send(buildStep0Request(input, model));
  return res.text;
}

// Mock：无 Key 演示用的框架骨架（引用行业名，但明确标注为示例）。
export function mockStep0Markdown(input: Step0Input): string {
  const ind = input.industry;
  return [
    "## 行业定义与生命周期",
    `- 边界与统计口径：先界定 ${ind} 的产品 / 服务边界。`,
    "- 生命周期：处于 导入 / 成长 / 成熟 / 衰退 哪阶段（**推测，待核**）。",
    "",
    "## 市场规模与增长",
    "- TAM / SAM / SOM 各多大；历史与预期 CAGR；渗透率与 S 曲线位置；增长靠量还是价。",
    "",
    "## 宏观与政策（PEST）",
    "- 政策 / 监管 / 补贴、经济周期、社会需求、技术变迁，哪项对本行业最关键。",
    "",
    "## 需求端",
    "- 需求结构与分层、驱动与弹性；辨真需求 vs 伪需求。",
    "",
    "## 供给端",
    "- 产能格局、供给约束（牌照 / 资源 / 技术）、产能周期与扩张节奏。",
    "",
    "## 竞争格局（波特五力）",
    `- 现有竞争：集中度 CR/HHI、竞争梯队；${ind} 多呈「哑铃型」（**推测**）。`,
    "- 潜在进入者与壁垒、替代品威胁、供应商议价力、买方议价力。",
    "",
    "## 产业链 / 价值链",
    "- 上中下游拆解、价值分布（微笑曲线）、利润池在哪段、卡脖子环节。",
    "",
    "## 商业模式与盈利公式",
    "- 怎么赚钱；单位经济：收入 ＝ 量 × 价、成本结构、毛利 / 净利驱动；现金流与账期、规模效应。",
    "",
    "## 关键成功要素(KSF)与护城河",
    "- 赢家靠什么；护城河类型（规模 / 网络 / 品牌 / 牌照 / 技术 / 切换成本）。",
    "",
    "## 关键企业 / 标杆",
    "- 龙头与各环节代表、市占与打法差异、可复制性。",
    "",
    "## 周期与时点",
    `- 结合生命周期与当下供需 / 价格，${ind} 现在处于什么时点、意味着什么。`,
    "",
    "## 风险与命门",
    "- 有名有姓的风险（政策 / 技术替代 / 产能过剩 / 价格战）；能一票否决的命门变量 + 前瞻信号。",
    "",
    "## 本框架可能漏了什么",
    `- （Mock 演示框架；到设置为「定框」配置真实模型后，生成 ${ind} 的真实框架。）`,
  ].join("\n");
}

export function step0Route(): { isMock: boolean; label: string; model: string } {
  const cfg = loadConfig();
  const r = cfg.step0;
  const p = providerById(cfg, r.provider);
  return { isMock: p.id === "mock", label: p.label, model: r.model };
}

export async function generateStep0(input: Step0Input): Promise<Step0Run> {
  const cfg = loadConfig();
  const r = cfg.step0;
  const p = providerById(cfg, r.provider);
  if (p.id === "mock") {
    return { markdown: mockStep0Markdown(input), providerLabel: p.label, model: r.model };
  }
  // 桌面下走 tauri-http 绕过 CORS；浏览器下全局 fetch
  const markdown = await runStep0(input, makeClient(p, await getLlmFetch()), r.model);
  return { markdown, providerLabel: p.label, model: r.model };
}
