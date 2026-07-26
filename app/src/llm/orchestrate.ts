// Step 0 · 行业定框：为一个行业搭「投研级」研究框架。
// 输出 markdown（稳健，不依赖严格 JSON——这也修掉了旧结构化在非 Claude 模型上回退默认的问题）。
import { ChatRequest, LLMClient } from "./types";
import { loadConfig, providerById } from "../config/store";
import { makeClient } from "./adapters";
import { getLlmFetch } from "./runtime";

export interface Step0Input { industry: string; ourRole: string; lightScan: string; }
export interface Step0Run { markdown: string; providerLabel: string; model: string; }

// 行业研究框架的板块（投研常用透镜）
export const FRAME_SECTIONS = [
  "竞争格局", "发展核心要素", "关键企业", "盈利公式", "商业模式", "产业链 / 价值链", "周期与时点", "风险与命门",
];

export function buildStep0Request(input: Step0Input, model: string): ChatRequest {
  const system = "你是资深行业研究员，擅长搭投研级行业分析框架。直接输出框架正文，不写「作为分析师」「以下是」这类套话、不复述任务。";
  const user =
    `为「${input.industry}」行业搭一份研究框架（我方角色：${input.ourRole}；已知碎片：${input.lightScan || "无"}）。\n` +
    `用 markdown（## 小标题 + 要点列表）。对下列每个板块，给「要研究什么 / 关键问题 / 初步判断（标注是推测、待核）」：\n` +
    `1. 竞争格局：集中度、主要玩家、进入壁垒、上下游议价力\n` +
    `2. 发展核心要素：需求 / 供给 / 政策 / 技术 / 资本，当前主驱动是哪个、拐点信号\n` +
    `3. 关键企业：龙头与各环节代表，各卡什么位、护城河在哪\n` +
    `4. 盈利公式：收入＝？ 成本＝？ 利润与单位经济的关键驱动项\n` +
    `5. 商业模式：怎么赚钱、在价值链的位置、典型交易结构与账期\n` +
    `6. 产业链 / 价值链：上中下游，价值主要沉淀在哪一段\n` +
    `7. 周期与时点：这行业处在什么周期，当下时点（供需 / 价位）意味着什么\n` +
    `8. 风险与命门：有名有姓的风险 + 能一票否决这门生意的命门变量\n` +
    `结尾用「## 本框架可能漏了什么」做一句自检。`;
  return { model, system, messages: [{ role: "user", content: user }], maxTokens: 4000 };
}

export async function runStep0(input: Step0Input, client: LLMClient, model: string): Promise<string> {
  const res = await client.send(buildStep0Request(input, model));
  return res.text;
}

// Mock：无 Key 演示用的框架骨架（引用行业名，但明确标注为示例）。
export function mockStep0Markdown(input: Step0Input): string {
  const ind = input.industry;
  return [
    "## 竞争格局",
    `- 集中度：${ind}多呈「哑铃型」——头部规模玩家 + 长尾服务商（**推测，待核**）。`,
    "- 进入壁垒：牌照 / 资金 / 客户关系 / 技术，哪个最硬需实证。",
    "- 议价力：向上游（供给方）与向下游（客户）分别评估。",
    "",
    "## 发展核心要素",
    `- 需求 / 供给 / 政策 / 技术 / 资本 —— ${ind}当前主驱动是哪个？拐点信号是什么？`,
    "",
    "## 关键企业",
    "- 龙头是谁、卡哪段价值链、护城河（规模 / 牌照 / 数据 / 客户锁定）。",
    "",
    "## 盈利公式",
    "- 收入 ＝ 量 × 价（× 复购？）；成本 ＝ 固定 + 可变；利润驱动项与单位经济。",
    "",
    "## 商业模式",
    "- 怎么赚钱、在价值链的位置、典型交易结构与账期。",
    "",
    "## 产业链 / 价值链",
    "- 上中下游拆解，价值主要沉淀在哪一段。",
    "",
    "## 周期与时点",
    `- ${ind}处在什么周期，当前时点（供需 / 价位）意味着什么。`,
    "",
    "## 风险与命门",
    "- 有名有姓的风险；能一票否决这门生意的命门变量。",
    "",
    "## 本框架可能漏了什么",
    `- （Mock 演示框架；到设置为「定框」配置真实模型后，生成${ind}的真实框架。）`,
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
