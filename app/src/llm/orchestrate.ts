// Step 0 定框编排：提示词组装 + 结构化解析 + 按配置路由生成（含 Mock 端到端）。
// 提示词契约见 docs/详细设计-行业分析提示词.md。
import { ChatRequest, LLMClient } from "./types";
import { loadConfig, providerById } from "../config/store";
import { makeClient } from "./adapters";

export interface Step0Input { industry: string; ourRole: string; lightScan: string; }
export interface CoreDim { key: string; weight: number; weightReason: string; }
export interface OverlayItem { item: string; reason: string; }
export interface Step0Framework { coreDimensions: CoreDim[]; industryOverlay: OverlayItem[]; reflexive: string[]; }
export interface Step0Run { framework: Step0Framework; providerLabel: string; model: string; }

const CORE_KEYS = ["行业理解", "对方画像", "我方角色", "项目评估", "风险维度", "战略布局匹配"];

export const SYSTEM_CONTRACT =
  `你是"决策副驾"。定位：对业务合作/投资项目做接洽前后的可行性初评，只给决策建议、不替用户拍板。\n` +
  `红线：给带立场、带理由的判断，但必须同时交出四段——立场/倾向、依据、把握度(高/中/低+原因)、` +
  `falsifiers(哪几条前提错了这个结论就翻)；判断是"待你审的初稿"，可被推翻；` +
  `评估阶段只产出"问题"、不打分；必要处主动反问"这框架/这份分析可能漏了什么"。`;

export const STEP0_SCHEMA = {
  type: "object",
  properties: {
    coreDimensions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          weight: { type: "integer" },
          weightReason: { type: "string" },
        },
        required: ["key", "weight", "weightReason"],
        additionalProperties: false,
      },
    },
    industryOverlay: {
      type: "array",
      items: {
        type: "object",
        properties: { item: { type: "string" }, reason: { type: "string" } },
        required: ["item", "reason"],
        additionalProperties: false,
      },
    },
    reflexive: { type: "array", items: { type: "string" } },
  },
  required: ["coreDimensions", "industryOverlay", "reflexive"],
  additionalProperties: false,
};

export function buildStep0Request(input: Step0Input, model: string): ChatRequest {
  const system = `${SYSTEM_CONTRACT}\n\n我方角色：${input.ourRole}`;
  const user =
    `任务：为「${input.industry}」行业、我方角色「${input.ourRole}」做 Step 0 定框（本单的评估框架）。\n` +
    `轻扫信息：${input.lightScan || "（暂无，按行业常识垫底）"}\n` +
    `要求：\n` +
    `1) 核心层 6 维全量启用（行业理解/对方画像/项目评估/风险维度/战略布局匹配/我方角色），按我方角色给每维排权重(0–100)并说明理由；\n` +
    `2) 给该行业"叠加层"建议：特有监管、牌照、交易惯例、特有问题清单，每条带理由；\n` +
    `3) 反问：这框架对「${input.industry}」可能漏了什么（1–3 条）。\n` +
    `仅输出符合给定 schema 的 JSON，不要额外文字。`;
  return { model, system, messages: [{ role: "user", content: user }], jsonSchema: STEP0_SCHEMA, maxTokens: 4000 };
}

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  const slice = s >= 0 && e > s ? raw.slice(s, e + 1) : raw;
  try { return JSON.parse(slice); } catch { return {}; }
}

export function parseStep0(text: string): Step0Framework {
  const j = extractJson(text) as Partial<Step0Framework>;
  const dims = Array.isArray(j.coreDimensions) && j.coreDimensions.length
    ? j.coreDimensions.map((d) => ({ key: String(d.key ?? ""), weight: Number(d.weight) || 0, weightReason: String(d.weightReason ?? "") }))
    : CORE_KEYS.map((k) => ({ key: k, weight: 50, weightReason: "（模型未返回，已回退默认）" }));
  const overlay = Array.isArray(j.industryOverlay)
    ? j.industryOverlay.map((o) => ({ item: String(o.item ?? ""), reason: String(o.reason ?? "") }))
    : [];
  const reflexive = Array.isArray(j.reflexive) ? j.reflexive.map((r) => String(r)) : [];
  return { coreDimensions: dims, industryOverlay: overlay, reflexive };
}

export async function runStep0(input: Step0Input, client: LLMClient, model: string): Promise<Step0Framework> {
  const res = await client.send(buildStep0Request(input, model));
  return parseStep0(res.text);
}

// Mock：无 Key 演示用，产出与 schema 一致的 JSON（角色不同→权重不同）。
export function mockStep0Json(input: Step0Input): string {
  const w = roleWeights(input.ourRole);
  const coreDimensions = CORE_KEYS.map((k) => ({ key: k, weight: w[k][0], weightReason: w[k][1] }));
  const industryOverlay = [
    { item: `${input.industry} 特有监管 / 牌照红线`, reason: "强监管红线决定能不能做，须先厘清" },
    { item: `${input.industry} 交易惯例与计价方式`, reason: "影响商业模式、价值分配与风险分配" },
    { item: `${input.industry} 特有问题清单`, reason: "该行业最值钱的洞察往往正是这一栏需要自己补的" },
  ];
  const reflexive = [
    `这框架对「${input.industry}」是否漏了时点/周期透镜（这单在什么周期、什么价位锁的）？`,
    `作为「${input.ourRole}」，我方筹码（替代选项）是否被显式评估？`,
  ];
  return JSON.stringify({ coreDimensions, industryOverlay, reflexive });
}

function roleWeights(role: string): Record<string, [number, string]> {
  const base: Record<string, [number, string]> = {
    行业理解: [70, "跨项目复用的弹药库，基础项"],
    对方画像: [75, "真实诉求/资质/决策链决定可行性"],
    我方角色: [85, `我方为「${role}」，据此为其余维度排权重`],
    项目评估: [80, "能不能做 + 值不值得做的核心"],
    风险维度: [70, "合规/财务/履约/退出等"],
    战略布局匹配: [60, "与既有业务布局的协同"],
  };
  if (role.includes("资金")) { base["风险维度"] = [88, "资金方最盯财务/退出/名实分离"]; base["项目评估"] = [86, "ROI 与价值分配是资金方命门"]; }
  else if (role.includes("场地")) { base["风险维度"] = [78, "能耗/合规/空置风险"]; base["对方画像"] = [82, "运营方履约与上架率承诺"]; }
  else if (role.includes("货源") || role.includes("集成")) { base["项目评估"] = [82, "货源真实性与交付确定性"]; }
  return base;
}

// 按配置路由生成：Mock 走本地演示，其余走真实模型。
export function step0Route(): { isMock: boolean; label: string; model: string } {
  const cfg = loadConfig();
  const r = cfg.routing["定框"];
  const p = providerById(cfg, r.provider);
  return { isMock: p.id === "mock", label: p.label, model: r.model };
}

export async function generateStep0(input: Step0Input): Promise<Step0Run> {
  const cfg = loadConfig();
  const r = cfg.routing["定框"];
  const p = providerById(cfg, r.provider);
  if (p.id === "mock") {
    return { framework: parseStep0(mockStep0Json(input)), providerLabel: p.label, model: r.model };
  }
  const framework = await runStep0(input, makeClient(p), r.model);
  return { framework, providerLabel: p.label, model: r.model };
}
