// 多智能体报告流水线：规划→资料研判→起草→红队反驳→定稿→验收。
// 每个 stage 都是用户可见的「子任务」，各自可路由不同模型；红队宜换一家/一款互查。
// 纯逻辑（stage 定义、Mock 内容、各 agent 的请求组装）在此；异步链在 ReportProgress 里驱动。
import { AgentRole, ChatRequest } from "./types";

export interface PipelineStage {
  id: string;
  role: AgentRole;
  title: string;   // 子任务标题
  detail: string;  // 这个 agent 干什么
}

export interface PipelineInput { industry: string; ourRole: string; focus: string; }
export interface StageResult { stageId: string; summary: string; }

export const REPORT_PIPELINE: PipelineStage[] = [
  { id: "plan", role: "规划", title: "拆解框架", detail: "依据 Step 0 定框，列出报告骨架：决策主心骨 / 分层轴 / 命门变量" },
  { id: "research", role: "资料", title: "资料研判", detail: "读入本单材料（尽调稿 / 对方资料 / 交付物库），抽取关键事实与数据作为起草依据；缺料处标「需补」" },
  { id: "draft", role: "起草", title: "起草初稿", detail: "按骨架 + 资料产出判断卡、行业分层、量化区间（每条标口径）" },
  { id: "red", role: "红队", title: "红队反驳", detail: "换一模型挑漏洞：证据够不够、口径清不清、风险有没有名有姓、falsifiers 够不够狠" },
  { id: "final", role: "定稿", title: "吸收反驳 · 定稿", detail: "逐条回应红队意见，产出终稿（仍为待审初稿）" },
  { id: "check", role: "验收", title: "自检验收 6 线", detail: "对照 6 条验收线逐条打钩，缺项打回" },
];

// ——真实模型路径：每个 stage 的提示词组装（纯函数、可单测）。前一步产物喂给下一步。——
export interface PipelineCtx {
  input: PipelineInput;
  materials: string;                 // 用户提供的本单资料（尽调稿/对方资料等）
  outputs: Record<string, string>;   // 已完成 stage 的文本产出，按 stageId
}

const AGENT_SYS: Record<AgentRole, string> = {
  规划: "你是资深行研规划师，先搭骨架再落笔。",
  资料: "你是尽调分析师：只依据给定材料抽取事实，材料没有的标「需补」，绝不杜撰。",
  起草: "你是行业深度分析师。每个判断给「立场/依据/把握度/falsifiers」四段，每个量化区间必带口径。直接输出分析正文，不写「作为分析师」「以下是」这类自我指涉或套话，不复述任务；用 markdown 小标题与要点列表，便于阅读复核。",
  红队: "你是红队评审，专挑漏洞、不留情面，只针对证据、口径、风险命名与 falsifiers 的硬伤。",
  定稿: "你是主笔，吸收红队意见定稿；结论仍是「待审初稿」，可被推翻。直接输出成稿正文，不要自我指涉或复述任务，用 markdown 结构（小标题+要点列表）清晰呈现，便于阅读。",
  验收: "你是质检，对照验收线逐条打钩，缺一条就点名。",
};

export function buildStageRequest(stage: PipelineStage, ctx: PipelineCtx, model: string): ChatRequest {
  const { industry, ourRole, focus } = ctx.input;
  const o = ctx.outputs;
  const head = `行业「${industry}」· 我方「${ourRole}」· 本次重点「${focus}」。`;
  let user = "";
  switch (stage.id) {
    case "plan":
      user = `${head}\n按行业研究通用方法论（行业生命周期、市场规模 TAM/CAGR、PEST、波特五力、产业链 / 价值链与利润池、单位经济、护城河 / KSF、关键企业、周期与时点、风险命门）规划这份深度分析的骨架：决策主心骨（一句话拎全篇）+ 要覆盖的板块清单 + 每块的命门问题 + 需要哪些资料。简洁分点。`;
      break;
    case "research":
      user = `${head}\n骨架：\n${o.plan ?? "（无）"}\n\n本单材料：\n${ctx.materials.trim() || "（未提供外部材料）"}\n\n抽取与本单相关的关键事实、数据与口径；材料没覆盖的关键点标「需补」。不要编造。`;
      break;
    case "draft":
      user = `${head}\n研究框架 / 骨架：\n${o.plan ?? ""}\n\n资料研判：\n${o.research ?? ""}\n\n据此起草深度分析初稿，紧扣框架各板块（竞争格局 / 市场规模 / 盈利公式与单位经济 / 护城河 / 产业链利润池 / 周期时点等）：要有决策主心骨、分层论述、量化区间（每条带口径）、命门风险（有名有姓 + 识别信号）、可行性判断卡（立场 / 依据 / 把握度 / falsifiers）。用 markdown。`;
      break;
    case "red":
      user = `审下面这份初稿，逐条挑硬伤（证据不足 / 口径含糊 / 风险没点名 / falsifiers 不够狠），并列出必须补的清单：\n\n${o.draft ?? ""}`;
      break;
    case "final":
      user = `初稿：\n${o.draft ?? ""}\n\n红队意见：\n${o.red ?? ""}\n\n逐条回应并修改，产出定稿（markdown，结构清晰）。仍标注为待审初稿。`;
      break;
    case "check":
      user = `对照 6 条验收线逐条打 ✓/✗ 并一句话说明：决策主心骨 / 分层轴 / 量化+口径 / 命门变量 / 有名有姓的风险 / ${ourRole}角色视角。\n\n定稿：\n${o.final ?? ""}`;
      break;
  }
  return { model, system: AGENT_SYS[stage.role], messages: [{ role: "user", content: user }], maxTokens: 4000 };
}

// ——报告成品（结构化，供 .report 样式渲染；也是"深度"的载体）——
export interface JudgmentCardData {
  stance: string; grounds: string[]; confidence: "高" | "中" | "低"; confidenceReason: string; falsifiers: string[];
}
export interface MockReport {
  title: string;
  backbone: string;                                   // 决策主心骨
  layers: { name: string; note: string }[];           // 分层轴
  metrics: { metric: string; range: string; caliber: string }[];  // 量化 + 口径
  risks: { risk: string; signal: string; dealBreaker?: boolean }[]; // 有名有姓的风险 + 识别信号
  judgment: JudgmentCardData;                          // 判断卡
  acceptance: string[];                               // 6 条验收线
}

export function mockStageOutput(stage: PipelineStage, input: PipelineInput): StageResult {
  const ind = input.industry, role = input.ourRole;
  switch (stage.role) {
    case "规划":
      return { stageId: stage.id, summary: `锁定「${ind}」报告骨架：以「时点×筹码」为决策主心骨；按[资产层/运营层/资本层]分层；命门变量＝真实上架率、租约锁定期、电价与能耗、终端信用。` };
    case "资料":
      return { stageId: stage.id, summary: `读入本单材料，抽取关键事实与数据；缺料处标「需补」。示例：${ind}区域电价、租户名单与履约记录、机房 PUE 实测——未提供则标注需补。` };
    case "起草":
      return { stageId: stage.id, summary: "产出 4 张判断卡 + 3 条量化区间（均标口径），例：整柜租赁毛利 18–28%（口径：不含电费转售、按 3 年租期摊）。" };
    case "红队":
      return { stageId: stage.id, summary: "挑出 3 处硬伤：①「需求旺盛」无量化→打回；②退出路径缺场景；③未点名「名实分离/回租套利」红线。要求补 falsifiers。" };
    case "定稿":
      return { stageId: stage.id, summary: "逐条回应：补需求量化与口径、加退出三情景、点名名实分离红线并给识别信号；终稿仍为待审初稿，可被推翻。" };
    case "验收":
      return { stageId: stage.id, summary: `6 线自检：主心骨✓ 分层轴✓ 量化+口径✓ 命门变量✓ 有名有姓风险✓ 角色视角(${role})✓` };
  }
}

export function mockReport(input: PipelineInput): MockReport {
  const ind = input.industry, role = input.ourRole;
  return {
    title: `${ind} · 行业深度分析（${role}视角 · 待审初稿）`,
    backbone: `这单能不能做，取决于「在什么时点、以什么筹码锁定」——${ind}是强周期 + 强监管行业，同样的标的在周期顶/底、议价强/弱下结论可以相反。`,
    layers: [
      { name: "资产层", note: "标的本身的质地：算力集群规格、上架率、机房 PUE/电价" },
      { name: "运营层", note: "谁在运营、租户是谁、租约结构与履约记录" },
      { name: "资本层", note: "钱怎么进、怎么退：出资结构、增信、退出路径" },
    ],
    metrics: [
      { metric: "整柜租赁毛利率", range: "18%–28%", caliber: "不含电费转售、按 3 年租期摊销" },
      { metric: "真实上架率", range: "≥ 80% 视为健康", caliber: "以电表负荷 + 租约双口径交叉核" },
      { metric: "投资回收期", range: "3.5–5 年", caliber: "含一次性接入与季度电价波动" },
    ],
    risks: [
      { risk: "名实分离 / 回租套利", signal: "签约主体≠收款/开票主体；租金与市场价背离；回购/兜底暗条款", dealBreaker: true },
      { risk: "终端租户信用塌方", signal: "单一大客户占比过高、账期越拉越长、续约含糊" },
      { risk: "电价 / 能耗击穿测算", signal: "地方电价补贴到期、PUE 实测高于承诺" },
    ],
    judgment: {
      stance: `谨慎可做——但必须先验穿「四流一致」，作为${role}这是命门。`,
      grounds: [
        "标的资产质地与区域电价具备结构性优势（资产层成立）",
        "但终端需求与租约锁定期尚为假设，未见硬证据",
      ],
      confidence: "中",
      confidenceReason: "资产层证据较足，运营层/资本层仍靠假设，量化区间口径已标但数据源单一。",
      falsifiers: [
        "若四流不一致（名实分离）→ 整单法律/合规定性翻转，弃",
        "若真实上架率 < 60% 或租期 < 2 年 → ROI 测算不成立，缓",
        "若终端为单一关联方 → 需求真实性存疑，降级重估",
      ],
    },
    acceptance: [
      "决策主心骨：时点×筹码，一句话拎起全篇",
      "分层轴：资产/运营/资本三层，切开而非罗列",
      "量化 + 口径：每个区间都带口径，可复核",
      "命门变量：上架率/租期/电价/信用，四个",
      "有名有姓的风险：名实分离等，附识别信号",
      `角色视角：全篇站在${role}立场排序`,
    ],
  };
}
