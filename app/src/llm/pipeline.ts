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

export interface PipelineInput { industry: string; ourRole: string; focus: string; company?: string; counterparty?: string; }
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

// 内置行业研究框架：资深分析师看一门生意的决策式结构（方法内化，不贴教科书标签）。
// 定框已并入此处——由「规划」agent 落到具体行业，不再是独立 UI 步骤。
export const INDUSTRY_FRAME =
  "① 这门生意的本质（靠什么赚钱、价值从哪来）｜② 需求（谁在买、为什么买、付费意愿与需求趋势）｜" +
  "③ 供给与格局（主要玩家、集中度、进入壁垒）｜④ 价值链与利润池（利润沉在哪段、议价力沿链条如何转移、卡脖子在哪）｜" +
  "⑤ 技术与替代（颠覆性技术、替代方案、技术成熟度曲线）｜⑥ 盈利公式与单位经济（收入＝量×价、成本结构、利润驱动、规模 / 网络效应）｜" +
  "⑦ 护城河（头部靠什么守、能否复制）｜⑧ 政策与宏观（监管方向、政策风险、宏观周期）｜" +
  "⑨ 资本视角（谁在投、估值倍数、并购活跃度——钱往哪走本身是信号）｜⑩ 周期与时点（现在处在什么位置、风往哪吹、该等还是该抢）｜" +
  "⑪ 唱衰 / 反方（当前是否被高估、是否正结构性衰退、什么会杀死这门生意、前瞻信号）｜⑫ 对我方的含义（该盯什么、筹码 / 软肋、什么条件下值得下注）";

// 企业分析框架（投研级客观面 + 交易/洽谈面 合并）
export const COMPANY_FRAME =
  "① 商业模式与单位经济（怎么赚钱、单位经济是否成立）｜② 财务（增长、利润率、现金流、资产负债健康度）｜" +
  "③ 护城河（壁垒来源与可持续性）｜④ 客户与产品（留存、NPS、产品市场契合度 PMF、客户集中度）｜" +
  "⑤ 管理层与治理（团队履历、激励结构、公司治理）｜⑥ 增长与战略（增长引擎、战略清晰度与执行力）｜" +
  "⑦ 真实诉求与动机（想干什么、为什么找我方、急不急）｜⑧ 决策链与筹码（谁拍板、关键人诉求、对方退路 BATNA、我方筹码与软肋）｜" +
  "⑨ 空头 / 做空逻辑（完整反方：什么会让它崩、名实是否一致、有无硬伤）｜⑩ 对我方的含义（该盯什么、怎么谈、什么条件下可信 / 值得合作）";

// 项目分析框架
export const DEAL_FRAME =
  "① 能不能做（合规红线、资质 / 牌照、硬约束）｜② 值不值得做（ROI、价值分配、对我方的收益与代价）｜" +
  "③ 合作点与结构（各方出什么 / 拿什么、交易框架）｜④ 关键前提与命门（哪几条前提错了这单就翻）｜" +
  "⑤ 风险（合规 / 财务 / 履约 / 退出，有名有姓）｜⑥ 对我方的含义（角色、筹码、什么条件下值得下注）";

// 按类型选内置框架并给出分析对象的措辞
export function frameFor(input: PipelineInput): { frame: string; subject: string; kind: string } {
  const f = input.focus ?? "";
  if (f.includes("企业")) return { frame: COMPANY_FRAME, subject: `企业「${input.company || input.industry}」`, kind: "企业画像" };
  if (f.includes("项目")) return { frame: DEAL_FRAME, subject: `这单（行业「${input.industry}」，对方「${input.counterparty || "待填"}」）`, kind: "项目分析" };
  return { frame: INDUSTRY_FRAME, subject: `「${input.industry}」行业`, kind: "行业深度分析" };
}

export function buildStageRequest(stage: PipelineStage, ctx: PipelineCtx, model: string): ChatRequest {
  const { ourRole, focus } = ctx.input;
  const o = ctx.outputs;
  const { frame, subject } = frameFor(ctx.input);
  const head = `${subject} · 我方「${ourRole}」· 类型「${focus}」。`;
  let user = "";
  switch (stage.id) {
    case "plan":
      user = `${head}\n先给这份深度分析定框（内置框架，按决策逻辑、方法内化、不贴教科书框架名）。把下面要害逐一落到 ${subject} 的具体情形——每个先给一句结论 / 主张，再点出最关键的问题、变量与需要的资料：\n${frame}\n\n最后用一句话点出全篇「决策主心骨」。简洁、有数感。`;
      break;
    case "research":
      user = `${head}\n骨架：\n${o.plan ?? "（无）"}\n\n本单材料：\n${ctx.materials.trim() || "（未提供外部材料）"}\n\n抽取与本单相关的关键事实、数据与口径；材料没覆盖的关键点标「需补」。不要编造。`;
      break;
    case "draft":
      user = `${head}\n骨架：\n${o.plan ?? ""}\n\n资料研判：\n${o.research ?? ""}\n\n据此起草初稿，像资深分析师给决策者的备忘：每段先结论后依据、具体有数感；紧扣上面框架的各要害；要有量化区间（带口径）、有名有姓的风险、判断卡（立场 / 依据 / 把握度 / falsifiers）。不要出现框架名或教科书标签，不要清单感。用 markdown。`;
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
      return { stageId: stage.id, summary: `按内置框架把「${ind}」定框：本质 → 需求 → 格局 → 价值链利润池 → 盈利公式与单位经济 → 护城河 → 周期时点 → 命门风险 → 对我方含义，逐一落到本行业；决策主心骨一句话拎全篇。` };
    case "资料":
      return { stageId: stage.id, summary: `读入本单材料，抽取关键事实与数据；缺料处标「需补」。示例：${ind}的价格 / 成本数据、主要玩家与市占、政策 / 牌照要点——未提供则标注需补，不杜撰。` };
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

// ——洽谈清单一键生成（#5）：由深度分析（有则接地）提炼「洽谈前必须搞清」的重点。——
export interface ChecklistItem { text: string; intent: "要查" | "要问对方" | "待搞清"; dealBreaker?: boolean; }

export function buildChecklistRequest(input: PipelineInput, reportText: string, model: string): ChatRequest {
  const { subject } = frameFor(input);
  const head = `${subject} · 我方「${input.ourRole}」· 类型「${input.focus}」。`;
  const ground = reportText.trim()
    ? `下面是这单已完成的深度分析，请据此提炼（紧扣其中的命门变量、有名有姓的风险、判断卡里的 falsifiers）：\n\n${reportText.trim()}`
    : "（暂无深度分析，按内置框架与常识提炼。）";
  const user = `${head}\n${ground}\n\n列出这次洽谈前必须搞清的重点清单——只留「能改变决策」的问题，不要泛泛而谈。每行一条，严格用下面的标签格式，不加编号、不加解释：\n` +
    "[要查] 我方自己能核实 / 查证的（数据、资质、履约记录、四流一致…）\n" +
    "[要问对方] 只有当面问对方才能确认的（真实诉求、底线、决策链、退路…）\n" +
    "[待搞清] 归属未定、但必须弄清的\n" +
    "若某条错了就能推翻整单，在该行末尾加 ◆。最多 12 条，按重要性排序，能推翻这单的排最前。";
  return { model, system: "你是我方的洽谈军师，只列能改变决策的关键问题，严格按给定标签格式逐行输出。", messages: [{ role: "user", content: user }], maxTokens: 1500 };
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
    { text: `${who}的真实诉求：为什么现在找我方、急不急、退路（BATNA）是什么`, intent: "要问对方", dealBreaker: true },
    { text: `${who}最近 3 年财务：增长、利润率、现金流是否与其说法一致`, intent: "要查" },
    { text: "谁真正拍板、关键人各自诉求（决策链）", intent: "要问对方" },
    { text: `${who}客户集中度与大客户履约 / 续约情况`, intent: "要查" },
    { text: "名实是否一致——有无对外披露与实际经营背离的硬伤", intent: "要查", dealBreaker: true },
    { text: "我方筹码与软肋：这桩合作里我方不可替代在哪、命门在哪", intent: "待搞清" },
  ];
  if (focus?.includes("项目")) return [
    { text: "合规红线 / 资质牌照是否齐全（能不能做的硬约束）", intent: "要查", dealBreaker: true },
    { text: `资金 / 货物 / 合同 / 发票四流是否一致（${who}）`, intent: "要查", dealBreaker: true },
    { text: `${who}的真实诉求与底线、退路是什么`, intent: "要问对方" },
    { text: "各方出什么 / 拿什么，交易结构与增信安排", intent: "要问对方" },
    { text: "ROI 测算的关键口径（成本、周期、退出路径）能否复核", intent: "要查" },
    { text: "履约与退出风险：违约怎么办、怎么退得出来", intent: "待搞清" },
  ];
  return [
    { text: `${industry}的盈利公式与单位经济是否成立（收入＝量×价、成本结构）`, intent: "要查" },
    { text: "主要玩家、集中度与进入壁垒——头部靠什么守", intent: "要查" },
    { text: "利润沉在价值链哪一段、议价力沿链条如何转移", intent: "要查" },
    { text: "政策 / 牌照 / 监管方向有无硬约束或临界变化", intent: "要查", dealBreaker: true },
    { text: "现在处在周期什么位置——该等还是该抢", intent: "待搞清" },
    { text: "反方：什么会杀死这门生意、是否正被高估或结构性衰退", intent: "待搞清" },
  ];
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
