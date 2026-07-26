// Step 0 · 行业定框：为一个行业搭「投研级」研究框架。
// 输出 markdown（稳健，不依赖严格 JSON——这也修掉了旧结构化在非 Claude 模型上回退默认的问题）。
import { ChatRequest, LLMClient } from "./types";
import { loadConfig, providerById } from "../config/store";
import { makeClient } from "./adapters";
import { getLlmFetch } from "./runtime";

export interface Step0Input { industry: string; ourRole: string; lightScan: string; }
export interface Step0Run { markdown: string; providerLabel: string; model: string; }

// 行业框架板块（按决策逻辑，不贴教科书框架名）
export const FRAME_SECTIONS = [
  "这门生意的本质", "需求", "格局", "价值链与利润池", "盈利公式与单位经济",
  "护城河", "周期与时点", "命门与风险", "对我方的含义",
];

export function buildStep0Request(input: Step0Input, model: string): ChatRequest {
  const system =
    "你是浸淫这行多年的资深分析师 / 投资人。你精通各类分析方法，但绝不在成稿里出现「PEST」「波特五力」「SWOT」「价值链分析」这类框架名或教科书标签——把方法内化，直接给判断与洞察。" +
    "像给决策者的备忘：每段先给结论、再给依据与关键变量，具体、有数感、可证伪；避免正确的废话与罗列清单感。不写「作为分析师」「以下是」这类套话。";
  const user =
    `为「${input.industry}」行业写一份"看懂这门生意"的研究框架（面向决策；我方角色：${input.ourRole}；已知碎片：${input.lightScan || "无"}）。\n` +
    `用 markdown（## 小标题 + 要点）。围绕下面这些问题展开，每段先亮结论、再给依据/关键变量，判断标注是否推测：\n` +
    `- 这门生意的本质：到底靠什么赚钱、价值从哪来（一句话主心骨）\n` +
    `- 需求：真不真、多大、增速与去向，什么在驱动、拐点信号\n` +
    `- 格局：谁在赢、凭什么、集中还是分散、新玩家进得来吗、拦路的是什么\n` +
    `- 价值链与利润池：从上游到终端，钱主要被哪一段赚走、卡脖子在哪\n` +
    `- 盈利公式与单位经济：收入＝量×价怎么拆、成本结构、真正的利润驱动、有没有规模 / 网络效应\n` +
    `- 护城河：头部靠什么守住、能不能被复制\n` +
    `- 周期与时点：这行现在处在什么位置、风往哪吹、当下该等还是该抢\n` +
    `- 命门与风险：什么会杀死这门生意（有名有姓）、前瞻信号\n` +
    `- 对我方（${input.ourRole}）的含义：该盯什么、筹码 / 软肋在哪、什么条件下值得下注\n` +
    `结尾用「## 我可能看漏了什么」自省一句。`;
  return { model, system, messages: [{ role: "user", content: user }], maxTokens: 5000 };
}

export async function runStep0(input: Step0Input, client: LLMClient, model: string): Promise<string> {
  const res = await client.send(buildStep0Request(input, model));
  return res.text;
}

// Mock：无 Key 演示用的框架骨架（引用行业名，但明确标注为示例）。
export function mockStep0Markdown(input: Step0Input): string {
  const ind = input.industry;
  const role = input.ourRole;
  return [
    "## 这门生意的本质",
    `- 一句话：${ind} 到底靠什么赚钱、价值从哪来——先把它说清（**待填 / 推测**）。`,
    "",
    "## 需求",
    "- 真不真、多大、增速与去向；什么在驱动，拐点信号是什么；辨真需求与被补贴/政策催出来的伪需求。",
    "",
    "## 格局",
    "- 谁在赢、凭什么；集中还是分散；新玩家进得来吗、拦路的是什么。",
    "",
    "## 价值链与利润池",
    "- 从上游到终端，钱主要被哪一段赚走；卡脖子环节在哪；我方卡在链上哪个位置。",
    "",
    "## 盈利公式与单位经济",
    "- 收入 ＝ 量 × 价 怎么拆；成本结构；真正的利润驱动；有没有规模 / 网络效应。",
    "",
    "## 护城河",
    "- 头部靠什么守住（规模 / 牌照 / 客户锁定 / 技术 / 数据）；能不能被复制。",
    "",
    "## 周期与时点",
    `- ${ind} 现在处在什么位置、风往哪吹；当下该等还是该抢。`,
    "",
    "## 命门与风险",
    "- 什么会杀死这门生意（有名有姓）；前瞻信号是什么。",
    "",
    "## 对我方的含义",
    `- 作为「${role}」，这行里该盯什么；筹码与软肋在哪；什么条件下值得下注。`,
    "",
    "## 我可能看漏了什么",
    `- （Mock 演示；到设置为「定框」配置真实模型后，生成 ${ind} 的真实判断。）`,
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
