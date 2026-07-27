// 多智能体研究流水线：规划→资料研判→起草→事实与中立性审查→定稿→验收。
// 定位（重要）：所有报告都是中性、客观的研究——把行业/公司/这单「到底是什么样」讲清楚，
// 有节制的判断、正反兼陈，绝不编造事实，尤其绝不虚构「我方」的数据、能力或筹码。
// 每个 stage 是用户可见的「子任务」，各自可路由不同模型；审查宜换一家/一款互查。
import { AgentRole, ChatRequest } from "./types";

export interface PipelineStage {
  id: string;
  role: AgentRole;
  title: string;   // 子任务标题
  detail: string;  // 这个 agent 干什么
}

export interface PipelineInput { industry: string; ourRole: string; focus: string; company?: string; counterparty?: string; }
export interface StageResult { stageId: string; summary: string; }

export const REPORT_PIPELINE: PipelineStage[] = [
  { id: "plan", role: "规划", title: "拆解框架", detail: "按内置研究框架列出内容骨架：这门生意 / 这家公司 / 这单到底是什么样" },
  { id: "research", role: "资料", title: "资料研判", detail: "读入本单材料（尽调稿 / 公开资料 / 已知数据），抽取关键事实与数据；缺料标「需补」、未公开标「未公开」" },
  { id: "draft", role: "起草", title: "起草初稿", detail: "按骨架 + 资料产出中性客观的研究综述：先事实与逻辑、再有节制的判断，量化必带口径 / 来源" },
  { id: "red", role: "红队", title: "事实与中立性审查", detail: "换一模型审查：有无无来源的断言、疑似编造（尤其编造我方数据 / 筹码）、一边倒的倾向、口径含糊" },
  { id: "final", role: "定稿", title: "采纳意见 · 定稿", detail: "逐条采纳审查意见，产出中性定稿（正反兼陈、信息不足处如实说明；仍为待审初稿）" },
  { id: "check", role: "验收", title: "自检验收 5 线", detail: "对照 5 条验收线逐条打钩：事实有据 / 缺口已标 / 中性无编造 / 结构清楚 / 内容齐全" },
];

// ——真实模型路径：每个 stage 的提示词组装（纯函数、可单测）。前一步产物喂给下一步。——
export interface PipelineCtx {
  input: PipelineInput;
  materials: string;                 // 用户提供的本单资料（尽调稿/公开资料等）
  outputs: Record<string, string>;   // 已完成 stage 的文本产出，按 stageId
}

const AGENT_SYS: Record<AgentRole, string> = {
  规划: "你是严谨的研究分析师，先搭客观的内容骨架，只据事实、不预设立场。",
  资料: "你是尽调分析师：只依据给定材料抽取事实，材料没有的标「需补」、未公开的标「未公开」，绝不杜撰。",
  起草: "你是严谨的行业 / 企业研究分析师。行文中性客观，把对象「到底是什么样」讲清楚：先事实与逻辑，再给有节制的判断；正反兼陈，不做空也不唱多。只用给定材料与公认事实，缺失处标「需补」或「未公开」，绝不虚构数据，也绝不虚构「我方」的能力、数据或筹码。直接输出正文，不写自我指涉或套话，用 markdown 小标题与要点列表。",
  红队: "你是事实与中立性审查员：检查有无未标来源的断言、有无编造（尤其编造我方数据 / 筹码）、有无一边倒的倾向、口径是否清楚。只列必须修正处，不添加新的倾向。",
  定稿: "你是主笔，据审查意见定稿：保持中性客观、正反兼陈；结论有节制，信息不足处如实说明、不臆断。直接输出成稿正文，用 markdown 结构清晰呈现。",
  验收: "你是质检，对照验收线逐条打钩，缺一条就点名。",
};

// 内置行业研究框架：客观讲清「这个行业到底是什么样」——不给投资建议、不谈卡位、不预设立场。
export const INDUSTRY_FRAME =
  "① 行业本质（这门生意靠什么创造价值、靠什么赚钱）｜② 需求侧（谁在买、为什么买、需求由什么驱动、趋势）｜" +
  "③ 供给与竞争格局（主要玩家、集中度、进入壁垒）｜④ 价值链与利润分布（上下游构成、利润沉在哪段、议价力如何分布）｜" +
  "⑤ 商业模式与盈利公式（典型收入＝量×价、成本结构、单位经济、规模 / 网络效应）｜" +
  "⑥ 技术与演进（关键技术与路线、成熟度、替代与迭代方向）｜⑦ 政策与监管（相关政策方向、准入与合规约束）｜" +
  "⑧ 发展阶段与趋势（当前所处阶段、增长驱动、未来走向与不确定性）｜" +
  "⑨ 风险与争议（客观呈现主要风险与正反两方观点，不预设立场）";

// 内置公司介绍框架：面向「不了解这家公司」的读者的一份朴素介绍——不做空、不谈决策链 / 筹码、不写噱头。
export const COMPANY_FRAME =
  "① 公司简介（成立时间、总部、定位、发展沿革简述）｜② 业务板块（主营业务、主要产品 / 服务、各板块构成）｜" +
  "③ 商业模式（靠什么赚钱、客户是谁）｜④ 财务数据（营收、利润、增长、现金流等——有公开数据则列并标来源，无则标「未公开」）｜" +
  "⑤ 高管团队（核心创始人与高管背景）｜⑥ 融资与股权（主要轮次与投资方——如有）｜" +
  "⑦ 行业位势（在所处行业中的位置、主要竞争对手、市场份额——如有）";

// 内置项目可行性框架：客观评估「能不能做、怎么做、值不值得」——先研究、不预设立场，我方信息只用给定材料。
export const DEAL_FRAME =
  "① 这单是什么（合作 / 交易的实质、各方与标的）｜② 能不能做（合规红线、资质 / 牌照、硬性约束）｜" +
  "③ 怎么做（合作结构、各方角色与投入——依据已知材料）｜④ 值不值得做（成本、收益、周期与回收——依据材料，缺口标「需补」）｜" +
  "⑤ 关键前提与风险（哪几条前提错了这单就不成立；合规 / 履约 / 退出风险，有名有姓）｜" +
  "⑥ 结论（基于已知信息的客观判断；信息不足处如实说明，不臆断）";

// 按类型选内置框架并给出研究对象的措辞
export function frameFor(input: PipelineInput): { frame: string; subject: string; kind: string } {
  const f = input.focus ?? "";
  if (f.includes("企业")) return { frame: COMPANY_FRAME, subject: `「${input.company || input.industry}」这家公司`, kind: "公司介绍" };
  if (f.includes("项目")) return { frame: DEAL_FRAME, subject: `这单（${input.industry}${input.counterparty ? `，对方「${input.counterparty}」` : ""}）`, kind: "项目可行性" };
  return { frame: INDUSTRY_FRAME, subject: `「${input.industry}」行业`, kind: "行业深度分析" };
}

const NEUTRALITY =
  "全程中性客观、正反兼陈，不做空也不唱多；只用给定材料与公认事实，缺失处标「需补」或「未公开」，绝不虚构数据，尤其绝不虚构「我方」的能力、数据或筹码。";

function typeNote(kind: string, company?: string): string {
  if (kind === "公司介绍")
    return `这是一份公司介绍（面向不了解这家公司的读者）：标题就写「${company || "该公司"} 公司介绍」，文风朴素、不用噱头；不做投资建议，不写做空 / 空头逻辑，不写决策链 / 筹码。`;
  if (kind === "行业深度分析")
    return "这是一份行业研究：客观讲清这个行业到底是什么样、怎么运转、发展逻辑；不要给投资组合建议或卡位点，不预设我方立场。";
  return "这是一份项目可行性研究：客观评估能不能做、怎么做、值不值得；先做研究、不预设立场，「我方」信息只用给定材料、绝不虚构。";
}

export function buildStageRequest(stage: PipelineStage, ctx: PipelineCtx, model: string): ChatRequest {
  const o = ctx.outputs;
  const { frame, subject, kind } = frameFor(ctx.input);
  const head = `${subject} · 类型「${kind}」。`;
  const note = typeNote(kind, ctx.input.company);
  let user = "";
  switch (stage.id) {
    case "plan":
      user = `${head}\n先为这份研究定内容骨架（内置框架，方法内化、不贴教科书框架名）。把下面要点逐一落到 ${subject} 的具体情形——每点先给一句客观概述，再点出关键事实、变量与需要补的资料：\n${frame}\n\n最后用一句话概括核心逻辑（中性，不带倾向）。${note} ${NEUTRALITY}`;
      break;
    case "research":
      user = `${head}\n内容骨架：\n${o.plan ?? "（无）"}\n\n本单材料：\n${ctx.materials.trim() || "（未提供外部材料）"}\n\n抽取与本单相关的关键事实、数据与口径；材料没覆盖的关键点标「需补」、公开渠道查不到的标「未公开」。不要编造。`;
      break;
    case "draft":
      user = `${head}\n内容骨架：\n${o.plan ?? ""}\n\n资料研判：\n${o.research ?? ""}\n\n据此起草正文，像一份严谨的研究综述：每部分先讲清事实与逻辑、再给有节制的判断；量化数据必带口径与来源，无来源标「需补 / 未公开」。紧扣上面框架各要点，不要出现框架名或教科书标签，不要清单感。用 markdown。${note} ${NEUTRALITY}`;
      break;
    case "red":
      user = `对下面这份初稿做事实与中立性审查，逐条指出问题（无来源的断言 / 疑似编造，尤其编造我方数据或筹码 / 一边倒的倾向 / 口径含糊），并列出必须修正处；不要添加新的倾向：\n\n${o.draft ?? ""}`;
      break;
    case "final":
      user = `初稿：\n${o.draft ?? ""}\n\n审查意见：\n${o.red ?? ""}\n\n逐条采纳并修改，产出定稿（markdown，结构清晰、中性客观、正反兼陈）。信息不足处如实说明、不臆断。仍标注为待审初稿。${note}`;
      break;
    case "check":
      user = `对照 5 条验收线逐条打 ✓/✗ 并一句话说明：事实有据（数据带口径 / 来源）｜缺口已标（需补 / 未公开）｜中性无编造（无虚构我方数据 / 筹码、无一边倒倾向）｜结构清楚｜该类型该有的内容齐全。\n\n定稿：\n${o.final ?? ""}`;
      break;
  }
  return { model, system: AGENT_SYS[stage.role], messages: [{ role: "user", content: user }], maxTokens: 4000 };
}

// ——洽谈清单一键生成（#5）：聚焦「能不能进 / 能不能做 / 值不值得 / 合规风险」这些能改变决策的问题。——
export interface ChecklistItem { text: string; intent: "要查" | "要问对方" | "待搞清"; dealBreaker?: boolean; }

export function buildChecklistRequest(input: PipelineInput, reportText: string, model: string): ChatRequest {
  const { subject } = frameFor(input);
  const head = `${subject} · 类型「${input.focus}」。`;
  const ground = reportText.trim()
    ? `下面是这单已完成的研究，请据此提炼（紧扣其中的关键前提、风险与信息缺口）：\n\n${reportText.trim()}`
    : "（暂无研究成稿，按内置框架与常识提炼。）";
  const user = `${head}\n${ground}\n\n列出这次洽谈 / 决策前必须搞清的重点清单——只留「能改变决策」的问题：能不能进、能不能做、值不值得做、合规风险、关键前提能否证实。不要列供应商名录、边角技术进展这类非核心信息。每行一条，严格用下面的标签格式，不加编号、不加解释：\n` +
    "[要查] 我方自己能核实 / 查证的（数据、资质、合规、履约记录…）\n" +
    "[要问对方] 只有当面问对方才能确认的（真实诉求、边界条件、时间表…）\n" +
    "[待搞清] 归属未定、但必须弄清的\n" +
    "若某条错了就能推翻整单，在该行末尾加 ◆。最多 12 条，按重要性排序，能推翻这单的排最前。";
  return { model, system: "你是严谨的研究助理，只列能改变决策的关键问题（能不能进 / 做 / 值不值得 / 合规），严格按给定标签格式逐行输出。", messages: [{ role: "user", content: user }], maxTokens: 1500 };
}

const INTENT_TAGS: ChecklistItem["intent"][] = ["要查", "要问对方", "待搞清"];

// 容错解析：吃掉编号/项目符号，认标签（半/全角括号皆可），◆/★/「能推翻」判 deal-breaker。
export function parseChecklist(text: string): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    let line = raw.trim().replace(/^[-*·•]\s*/, "").replace(/^\d+[.、)]\s*/, "").trim();
    if (!line) continue;
    const dealBreaker = /◆|★|能推翻|deal[-\s]?breaker/i.test(line);
    line = line.replace(/[◆★]/g, "").replace(/[（(]?能推翻(这单|整单)?[）)]?/g, "").trim();
    const m = /^[【\[]\s*(要查|要问对方|待搞清)\s*[】\]]\s*[:：]?\s*(.+)$/.exec(line);
    let intent: ChecklistItem["intent"] = "待搞清";
    let body = line;
    if (m) { intent = m[1] as ChecklistItem["intent"]; body = m[2].trim(); }
    else if (/^(要查|要问对方|待搞清)\s*[:：]/.test(line)) {
      const t = INTENT_TAGS.find((x) => line.startsWith(x))!;
      intent = t; body = line.slice(t.length).replace(/^[:：]\s*/, "").trim();
    } else if (/^(查证?|核实|核查)/.test(line)) intent = "要查";
    else if (/(问对方|向对方|当面问)/.test(line)) intent = "要问对方";
    body = body.replace(/[:：]\s*$/, "").trim();
    if (body.length >= 2 && /[\p{L}\p{N}]/u.test(body)) out.push({ text: body, intent, dealBreaker: dealBreaker || undefined });
  }
  return out;
}

export function mockChecklist(input: PipelineInput): ChecklistItem[] {
  const { focus, counterparty, company, industry } = input;
  const who = company || counterparty || "对方";
  if (focus?.includes("企业")) return [
    { text: `${who}最近 3 年财务是否与其对外说法一致（营收、利润、现金流）`, intent: "要查" },
    { text: `${who}主营业务与主要客户构成、客户集中度`, intent: "要查" },
    { text: "核心高管与创始团队背景是否属实", intent: "要查" },
    { text: `${who}是否存在重大合规 / 诉讼 / 股权瑕疵`, intent: "要查", dealBreaker: true },
    { text: "对方希望达成什么、时间表与边界条件", intent: "要问对方" },
    { text: "公开信息里仍不清楚、需进一步确认的关键点", intent: "待搞清" },
  ];
  if (focus?.includes("项目")) return [
    { text: "合规红线 / 资质牌照是否齐全（能不能做的硬约束）", intent: "要查", dealBreaker: true },
    { text: `这单能不能进：行业准入、政策与硬性门槛（${industry}）`, intent: "要查" },
    { text: "值不值得做：成本、收益、周期与回收的关键口径能否复核", intent: "要查" },
    { text: `${who}的真实诉求、边界条件与时间表`, intent: "要问对方" },
    { text: "各方出什么 / 拿什么，合作结构如何", intent: "要问对方" },
    { text: "履约与退出风险：违约怎么办、怎么退得出来", intent: "待搞清" },
  ];
  return [
    { text: `能不能进：${industry}的行业准入、政策与硬性门槛`, intent: "要查", dealBreaker: true },
    { text: "值不值得进：盈利公式与单位经济是否成立（量×价、成本结构）", intent: "要查" },
    { text: "格局与壁垒：主要玩家、集中度、头部靠什么守", intent: "要查" },
    { text: "利润分布：利润沉在价值链哪一段、议价力如何", intent: "要查" },
    { text: "所处发展阶段与主要不确定性", intent: "待搞清" },
    { text: "主要风险与争议（正反两面）", intent: "待搞清" },
  ];
}

// ——报告成品（结构化，供 .report 样式渲染的 Mock 演示；真实成品是模型输出的 markdown 定稿）——
export interface JudgmentCardData {
  stance: string; grounds: string[]; confidence: "高" | "中" | "低"; confidenceReason: string; falsifiers: string[];
}
export interface MockReport {
  title: string;
  backbone: string;                                   // 核心逻辑一句话
  layers: { name: string; note: string }[];           // 分层看
  metrics: { metric: string; range: string; caliber: string }[];  // 量化 + 口径
  risks: { risk: string; signal: string; dealBreaker?: boolean }[]; // 主要风险 + 识别信号
  judgment: JudgmentCardData;                          // 研判
  acceptance: string[];                               // 验收线
}

export function mockStageOutput(stage: PipelineStage, input: PipelineInput): StageResult {
  const subj = input.company || input.industry;
  switch (stage.role) {
    case "规划":
      return { stageId: stage.id, summary: `按内置框架把${subj}（${input.industry}）定框：本质 → 需求 → 供给格局 → 价值链利润 → 商业模式 → 技术演进 → 政策 → 发展阶段 → 风险争议，逐一落到具体情形；中性客观、不预设立场。` };
    case "资料":
      return { stageId: stage.id, summary: "读入本单材料，抽取关键事实与数据；缺料标「需补」、公开查不到标「未公开」，不杜撰。" };
    case "起草":
      return { stageId: stage.id, summary: "产出中性研究综述：每部分先讲清事实与逻辑、再给有节制的判断；量化带口径 / 来源，正反兼陈。" };
    case "红队":
      return { stageId: stage.id, summary: "事实与中立性审查：指出无来源的断言、疑似编造、一边倒的倾向、口径含糊之处，列出必须修正项。" };
    case "定稿":
      return { stageId: stage.id, summary: "逐条采纳审查意见：补来源与口径、平衡正反表述、信息不足处如实说明；终稿仍为待审初稿。" };
    case "验收":
      return { stageId: stage.id, summary: "5 线自检：事实有据✓ 缺口已标✓ 中性无编造✓ 结构清楚✓ 内容齐全✓" };
  }
}

export function mockReport(input: PipelineInput): MockReport {
  const subj = input.company || input.industry;
  return {
    title: `${subj} · ${input.focus || "研究"}（示例 · 待审初稿）`,
    backbone: `一句话概括：${subj}的核心逻辑与看点——（示例文本；真实生成时会据资料给出中性判断，不带倾向）。`,
    layers: [
      { name: "需求侧", note: "谁在买、为什么买、需求由什么驱动" },
      { name: "供给与格局", note: "主要玩家、集中度、进入壁垒" },
      { name: "价值链与利润", note: "上下游构成、利润沉在哪段、议价力如何分布" },
    ],
    metrics: [
      { metric: "市场规模", range: "（示例区间）", caliber: "口径：统计范围与年份需据来源标注" },
      { metric: "增速", range: "（示例）", caliber: "口径：同比 / 复合增速，需注明" },
      { metric: "典型毛利区间", range: "（示例）", caliber: "口径：按主流业务、剔除一次性项" },
    ],
    risks: [
      { risk: "政策 / 合规变化", signal: "相关准入、监管口径或补贴的变动", dealBreaker: true },
      { risk: "需求不及预期", signal: "下游采购放缓、渗透率低于假设" },
      { risk: "竞争加剧 / 价格战", signal: "新进入者增多、毛利被压缩" },
    ],
    judgment: {
      stance: `（中性）${subj}是一门什么样的生意、目前处在什么阶段——是否值得进入 / 合作取决于下列关键变量（示例；真实生成会据资料给出）。`,
      grounds: [
        "（示例）需求与商业模式的客观描述",
        "（示例）竞争格局与利润分布的客观描述",
      ],
      confidence: "中",
      confidenceReason: "示例内容；真实生成时按证据充分度评估把握度，缺口如实标注。",
      falsifiers: [
        "若关键前提缺乏来源支撑 → 相应判断需下调",
        "若数据口径不一致 / 无法复核 → 结论需重估",
      ],
    },
    acceptance: [
      "事实有据：量化都带口径 / 来源",
      "缺口已标：需补 / 未公开处均标注",
      "中性无编造：无虚构数据、无虚构我方筹码、无一边倒倾向",
      "结构清楚：按内容骨架分层，不罗列",
      "正反兼陈：风险与争议客观呈现两面",
      "类型齐全：该类型该有的内容都覆盖",
    ],
  };
}
