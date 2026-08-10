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
  { id: "final", role: "定稿", title: "采纳意见 · 定稿", detail: "逐条采纳审查意见，产出中性定稿（正反兼陈、信息不足处如实说明）" },
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
  "〇 核心结论·画像（开篇结论先行：一句话画像 + 3~5 条关键判断，可用要点列表）｜" +
  "一 行业本质与大势：①行业本质（靠什么创造价值、靠什么赚钱）· ②发展阶段与趋势（当前阶段、关键节点、增长驱动、走向与不确定性；此节须放一个时间轴）｜" +
  "二 产业链与供需格局：③产业链与价值链（上中下游、各环节代表企业、利润沉在哪段、议价力分布；须画产业链图）· ④需求侧（谁在买、为何买、市场规模与增速、需求结构）· ⑤供给与竞争格局（主要玩家、集中度[有则给 CR3/CR5]、进入壁垒）｜" +
  "三 商业模式与技术：⑥商业模式与盈利公式（量×价、成本结构、单位经济、规模 / 网络效应）· ⑦技术与技术演进（关键技术与路线、成熟度、替代与迭代方向）｜" +
  "四 政策与监管框架（政策方向、准入与合规约束；此节做成表格）｜" +
  "五 综合研判（把全篇拼成一个中性判断：正反两面、关键不确定性与要盯的变量）｜" +
  "六 数据来源与参考资料（正文引用随文标注来源与口径分歧；文末参考资料由系统自动附，勿自行罗列清单）";

// 内置公司介绍框架：面向「不了解这家公司」的读者的一份朴素介绍——不做空、不谈决策链 / 筹码、不写噱头。
export const COMPANY_FRAME =
  "〇 核心结论·画像（开篇结论先行：一句话画像 + 3~5 条关键判断，可用要点列表）｜" +
  "一 公司概况：①基本信息（成立·总部·实控人·注册资本·员工·主营·所处阶段，做成信息卡或两列表格）· ②发展历程与产品矩阵 · ③股权与背书（实控人 + 主要股东 / 投资方，背书简单带过）｜" +
  "二 业务与商业模式：④主营业务与产品 / 服务 · ⑤商业模式（靠什么赚钱、客户是谁）· ⑥业务结构与增长极（产品 / 地区 / 客户结构，增长来自哪、成长性）｜" +
  "三 财务与盈利质地：⑦关键财务指标（一张精选表：营收与增速、毛利率、归母 / 扣非净利、经营现金流、货币资金、有息负债、应收账款；有公开数据则列并标来源，无则标「未公开」）· ⑧盈利驱动与质地（毛利率怎么来的、扣非 vs 归母口径、真现金 vs 纸面利润）｜" +
  "四 行业位势与赛道空间：⑨赛道空间（市场规模、增速、所处阶段）· ⑩竞争格局与卡位（主要对手、市占、公司位置）｜" +
  "五 竞争优势与护城河（它凭什么、能带来什么、依赖它的风险）｜" +
  "六 风险因素（先经营风险：增速 / 盈利承压、客户集中、模式短板、竞争；再延伸：合规 / 履约 / 外部，点到为止）｜" +
  "七 数据来源与参考资料（正文引用随文标注来源与口径分歧；文末参考资料由系统自动附，勿自行罗列清单）";

// 内置项目可行性框架：客观评估「能不能做、怎么做、值不值得」——先研究、不预设立场，我方信息只用给定材料。
export const DEAL_FRAME =
  "〇 核心结论·画像（开篇结论先行：一句话结论 + 能不能做 / 值不值得的速览）｜" +
  "① 这单是什么（合作 / 交易的实质、各方与标的；交易结构须画中心辐射图）｜② 能不能做（合规红线、资质 / 牌照、硬性约束）｜" +
  "③ 怎么做（合作结构、各方角色与投入——依据已知材料）｜④ 值不值得做（成本、收益、周期与回收——依据材料，缺口标「需补」）｜" +
  "⑤ 关键前提与风险（哪几条前提错了这单就不成立；合规 / 履约 / 退出风险，有名有姓）｜" +
  "⑥ 综合研判（基于已知信息的中性判断；信息不足处如实说明、不臆断）｜" +
  "⑦ 数据来源与参考资料（正文引用随文标注来源与口径分歧；文末参考资料由系统自动附，勿自行罗列清单）";

// 按类型选内置框架并给出研究对象的措辞
export function frameFor(input: PipelineInput): { frame: string; subject: string; kind: string } {
  const f = input.focus ?? "";
  if (f.includes("企业")) return { frame: COMPANY_FRAME, subject: `「${input.company || input.industry}」这家公司`, kind: "公司介绍" };
  if (f.includes("项目")) return { frame: DEAL_FRAME, subject: `这单（${input.industry}${input.counterparty ? `，对方「${input.counterparty}」` : ""}）`, kind: "项目可行性" };
  return { frame: INDUSTRY_FRAME, subject: `「${input.industry}」行业`, kind: "行业深度分析" };
}

const NEUTRALITY =
  "全程中性客观、正反兼陈，不做空也不唱多；只用给定材料与公认事实，缺失处标「需补」或「未公开」，绝不虚构数据，尤其绝不虚构「我方」的能力、数据或筹码。";

// 排版约定：让定稿用这些标记，报告库「编辑体」样式会渲染成对应的语义模块
// （关键数字快览 / 要点块 / 产业链 / 时间轴 / 交易结构 / 指标条 / 综合研判 / 结论·风险·洞察框 / 表格）。
const MARKUP_HINT =
  "排版用「选形器」：不要一见并列就套要点卡。先判断这段内容是什么关系，再按下表选形态；能结构化的就别堆成大段落，正文段落只做承接过渡、每段别超过 3 句。" +
  "【选形器 · 关系 → 形态】" +
  "① 真·并列、无排序无因果、2–4 条（含开篇核心结论的关键判断）→ 要点卡：每条「- **标签**：一句话」（系统排成卡片）。只有这种情形才用卡片；用前先写一句领起句点明这几条的共同关系。" +
  "② 标签 → 值（基本信息：成立 / 总部 / 实控人 / 注册资本…）→ ```kpi（每行：标签 | 数值 | 语义色可选 | 说明可选）或两列表格。" +
  "③ 谁大谁小 / 排名 / 比较 → ```mrow（每行：名称 | 百分比0–100 | 显示值 | 语义色）；只给要强调的那一条上色、其余留中性。" +
  "④ 分组的要点（如核心风险分几组、业务分板块）→ ```groups（可选首行「# 行动式小标题」；组标题单独一行，组内每条写「- 标签 | 一句话」）。" +
  "⑤ 因果 / 驱动 / 多因素共同支撑一个结果 → ```drivers（首行写结论横梁，其后每行「因素 | 一句支撑」）。" +
  "⑥ 产业链上中下游 → ```chain；时间 / 阶段演进 → ```timeline；交易结构（项目类）→ ```dealflow；需核实 / 尽调清单 → ```chk。" +
  "⑦ 多维对比 / 几种类型且有维度 → markdown 表格（合计 / 总计行首列用 **加粗**）。" +
  "⑧ 单条重要结论 / 风险 / 洞察 → 「> 结论：…」「> 风险：…」「> 洞察：…」各自单独成段；结尾综合研判 → ```verdict（每行：利好 / 需冷静 / 核心结论 | 一句话）。" +
  "⑨ 盈利公式 / 量×价 / 成本拆解等等式 → ```formula 单独居中成行（每行一个等式，用 **加粗** 高亮最关键的量、末尾 ~ 一句点睛），别把公式塞在段落里。" +
  "⑩ 定性评级 / 打分（几档强弱）→ ```harvey（每行：名称 | 档位0–4 | 一句说明）；两维定位 / 分类 → ```quad（2×2：`x: 左→右`、`y: 下→上` 定轴，`tl/tr/bl/br: 象限名 | 条目` 放四象限）；增减贡献 / 桥接（从 A 拆成加减到 B）→ ```waterfall（每行：名称 | ±值；基准 / 合计行第三段标 base 或 total）；数值随时间的曲线 → ```line（可选 `x | 年份…`；每行 `系列名 | 数值…`）。" +
  "【三条规矩】图形跟着信息走（形态服从关系，别为好看硬套）；一屏只强调一处（mrow / groups 只给一条上色 / 一个重点）；每个图 / 组件都配一句行动式小标题——要是结论、不是名词（如「三重长逻辑共同支撑需求扩张」，而非「需求驱动」），用 ## / ### 或组件自带的标题行承载。" +
  "⚠ 关键：正文里凡出现「第一类 / 第二类…」「一是 / 二是 / 三是」「①②③…」这类枚举，一律改成对应组件（分组的要点 → groups、并列要点 → 要点卡、有维度对比 → 表格、可比数值 → mrow），绝不留成大段落罗列。" +
  "层次用 ## 章 / ### 小节，标题走「主题：一句概括」式。缺口不要成段罗列，只在相关句子里一句话内嵌注明即可（如「（口径待核）」「（未公开）」）。";

// 有联网检索资料时的引用约定（无检索时这条无害）
const CITE_HINT =
  "若「资料研判」中含带编号 [n] 与链接的检索资料，引用其事实 / 数据时在句末标注对应 [n]；不要自行罗列参考资料 / 参考文献 / 来源清单，文末的「参考资料」由系统统一附上。";

// 一手源引导（C）：写作时优先采用并归因一手 / 权威源，二手转述要如实标注。
const SOURCE_HINT =
  "来源优先级：优先采用一手 / 权威源——统计局 / 信通院 / 交易所 / 公司年报与公告 / 券商研报 / 行业协会白皮书 / 主流财经媒体（财新 / 第一财经 / 华尔街见闻 / 证券时报 / 36氪 等）；引用数据尽量标到原始责任主体（如「据 XX 研究院…」「据国家统计局…」），而非二次转载的聚合站；关键数据若只有二手转述、无一手佐证，用一句话点明「（二手来源，待一手核）」。";

// 结构纪律：严格照搬内置框架的章节与顺序，杜绝「自由重排 / 漏节 / 合并」（根治初稿不按框架走）。
const STRUCTURE_RULE =
  "结构纪律（务必遵守）：严格照搬内置框架的章节与顺序——每个一级板块（〇 / 一 / 二 …）写成一个 ## 章、其下每个 ①②③ 子项写成一个 ### 小节；框架有几节就写几节、按框架先后顺序来，不许重排、不许漏写或把两节合并（例如「发展阶段与趋势」在框架里靠前，就别挪到结尾；「商业模式与盈利公式」这类子项不许省略）。章节标题写成实质性的「主题：一句概括」，但不要出现「框架 / 一 / 二 / ①」这类标签或教科书名。";

// 深度要求：写足、写透，但深度靠信息密度与结构化，不是靠拉长段落（根治「满屏大段落」）
const LENGTH_HINT =
  "深度要求：把每个要点讲扎实——给足关键事实、数据、机制与代表性案例，不要点到为止。但深度体现在信息密度与结构化程度上，不是把段落写长：宁可多切几个组件（要点块 / 表格 / 卡片 / 指标条 / 时间轴等）、每个组件里把信息做实，也绝不要堆大段落——正文里出现连续三段以上的纯文字，就该停下来把它们拆成组件。不设字数目标，内容多到一次没写完可在中断处继续，系统会自动衔接。";

function typeNote(kind: string, company?: string): string {
  const lead = "开篇先写「核心结论·画像」：一句话画像 + 3~5 条关键判断（可用要点列表），让读者先看到结论。";
  if (kind === "公司介绍")
    return `这是一份公司介绍（面向不了解这家公司的读者）：标题就写「${company || "该公司"} 公司介绍」，文风朴素、不用噱头；不做投资建议，不写做空 / 空头逻辑，不写决策链 / 筹码。` + lead +
      "「基本信息」做成信息卡或两列表格（成立·总部·实控人·注册资本·员工·主营·所处阶段），别写成一段话；「关键财务指标」做成一张精选表（营收与增速、毛利率、归母 / 扣非净利、经营现金流、货币资金、有息负债、应收账款），不铺三张全表。";
  if (kind === "行业深度分析")
    return "这是一份行业研究：客观讲清这个行业到底是什么样、怎么运转、发展逻辑；不要给投资组合建议或卡位点，不预设我方立场。" + lead +
      "「政策与监管框架」一节做成 markdown 表格（列：时间 | 政策 / 文件 | 发布主体 | 核心要点 | 对行业影响），准入 / 合规约束附在表后一两句。结尾「综合研判」写成一个 ```verdict 代码块（每行：利好 / 需冷静 / 核心结论 | 一句话）。" +
      "「产业链与价值链」一节务必用一个 ```chain 代码块给出：先写三列表头（上游 / 中游 / 下游），每列下再用「- 分组 | 代表企业A、代表企业B」列出多个细分环节与代表性企业（尽量列全、可给多组），核心 / 高利润环节在该行末尾加 hot 或 ★，末尾可用「~ 流向说明」。示例：\n" +
      "```chain\n上游·核心供应 | UPSTREAM\n- 关键芯片（壁垒/利润最高） | 英伟达、华为昇腾、寒武纪\n- 关键部件 | 厂商A、厂商B\n中游·制造/服务 | MIDSTREAM | mid\n- 本环节 ★核心 | 厂商C、厂商D | hot\n下游·应用 | DOWNSTREAM\n- 应用场景 | 客户E、客户F\n~ 上游→下游为产品流，资金自下而上回流\n```\n" +
      "写「发展阶段与趋势」这一节时，把关键的时间演进用一个 ```timeline 代码块**就放在这一节里**（每行：年份 | 事件 | 一句说明），让趋势叙述和时间轴在一起，不要把时间轴拆到别的章节。判断哪些内容更适合表格 / 结构化，就用表格或这些块，不要堆成大段文字。" +
      "「供给与竞争格局」若把玩家分成几类（云厂商 / 专业运营商 / 跨界资本…），用 ```groups 分组块或表格呈现，别用「第一类…第二类…」的段落罗列；「需求侧」的「谁在买」（互联网 / 政府 / 金融 / 制造…）拆成要点块或表格；「商业模式与盈利公式」把盈利公式用 ```formula 居中单独展示。";
  return "这是一份项目可行性研究：客观评估能不能做、怎么做、值不值得；先做研究、不预设立场，「我方」信息只用给定材料、绝不虚构。" + lead +
    "结尾「综合研判」写成一个 ```verdict 代码块（每行：利好 / 需冷静 / 核心结论 | 一句话）。" +
    "交易结构务必用一个 ```dealflow 代码块画成中心辐射图：先用 `hub | 中心方 | 一句职能` 定中心（通常是这单的运营 / 主导方），再用 `周边方 | 一句说明 | 槽位` 定各方（槽位取 tl/t/tr/l/r/bl/b/br，把上下游与资金方合理摆放），最后用 `> 出方 | 收方 | 标的·款项 | solid或dashed` 连线（出/收方写节点名或 hub；solid＝资金/实物，dashed＝服务/持有）。示例：\n" +
    "```dealflow\nhub | 运营方 | 上架·调度·运维\n资金方/投资人 | 自有/融资租赁 | tl\n集成商 | 设备采购 | l\n客户/消纳方 | 大模型·政企 | r\n场地方/IDC | 电力·机柜 | b\n> 资金方/投资人 | 集成商 | 采购款 | solid\n> 集成商 | hub | 设备 | solid\n> 资金方/投资人 | hub | 出资/持有 | dashed\n> 客户/消纳方 | hub | 租金 | solid\n> hub | 客户/消纳方 | 服务 | dashed\n> hub | 场地方/IDC | 机柜·电力费 | solid\n```";
}

export function buildStageRequest(stage: PipelineStage, ctx: PipelineCtx, model: string): ChatRequest {
  const o = ctx.outputs;
  const { frame, subject, kind } = frameFor(ctx.input);
  const head = `${subject} · 类型「${kind}」。`;
  const note = typeNote(kind, ctx.input.company);
  let user = "";
  switch (stage.id) {
    case "plan":
      user = `${head}\n先为这份研究定内容骨架。${STRUCTURE_RULE}\n把框架每个子项逐一落到 ${subject} 的具体情形——每点先给一句客观概述，再点出关键事实、变量与需要补的资料：\n${frame}\n\n最后用一句话概括核心逻辑（中性，不带倾向）。${note} ${NEUTRALITY}`;
      break;
    case "research":
      user = `${head}\n内容骨架：\n${o.plan ?? "（无）"}\n\n本单材料：\n${ctx.materials.trim() || "（未提供外部材料）"}\n\n抽取与本单相关的关键事实、数据与口径；材料没覆盖的关键点标「需补」、公开渠道查不到的标「未公开」。不要编造。`;
      break;
    case "draft":
      user = `${head}\n【必须遵循的内置框架 · 章节与顺序照此】\n${frame}\n\n内容骨架：\n${o.plan ?? ""}\n\n资料研判：\n${o.research ?? ""}\n\n据此起草正文，像一份严谨的研究综述。${STRUCTURE_RULE}\n每部分先讲清事实与逻辑、再给有节制的判断；量化数据必带口径与来源，无来源标「需补 / 未公开」；不要清单感。用 markdown。${note} ${NEUTRALITY} ${MARKUP_HINT} ${CITE_HINT} ${SOURCE_HINT} ${LENGTH_HINT}`;
      break;
    case "red":
      user = `对下面这份初稿做事实与中立性审查，逐条指出问题（无来源的断言 / 疑似编造，尤其编造我方数据或筹码 / 一边倒的倾向 / 口径含糊），并列出必须修正处；不要添加新的倾向：\n\n${o.draft ?? ""}`;
      break;
    case "final":
      user = `【必须遵循的内置框架 · 章节与顺序照此】\n${frame}\n\n初稿：\n${o.draft ?? ""}\n\n审查意见：\n${o.red ?? ""}\n\n逐条采纳并修改，产出定稿（markdown，结构清晰、中性客观、正反兼陈）。${STRUCTURE_RULE}\n信息不足处如实说明、不臆断。${note} ${MARKUP_HINT}`;
      break;
    case "check":
      user = `对照 5 条验收线逐条打 ✓/✗ 并一句话说明：事实有据（数据带口径 / 来源）｜缺口已标（需补 / 未公开）｜中性无编造（无虚构我方数据 / 筹码、无一边倒倾向）｜结构清楚｜该类型该有的内容齐全。\n\n定稿：\n${o.final ?? ""}`;
      break;
  }
  // 起草 / 定稿是正文所在，放宽到 8000，避免报告写到一半被截断（#5）；其余步骤 4000 足够。
  const maxTokens = stage.id === "draft" || stage.id === "final" ? 8000 : 4000;
  return { model, system: AGENT_SYS[stage.role], messages: [{ role: "user", content: user }], maxTokens };
}

// ============ 洽谈后 · 项目立项报告（一键导出）============
// 独立于「调研前 深度分析」的决策文档：面向公司内部决策者，讲清这单业务是什么、
// 商业模式、经济效益、风险与控制，落到「继续推进 / 暂缓」的立项结论。
// 按需求精简：团队安排与项目推进计划不写。以调研前深度分析为事实底稿。
export const PROJECT_REPORT_FRAME =
  "〇 摘要·定调（开篇一句话结论 + 本单定调「继续推进 / 暂缓」及一句理由，让读者先看到结论）｜" +
  "一 项目基本情况（项目背景、业务概要、项目意义——≤300字，先讲清这单业务到底是什么、我方做什么、对方是谁）｜" +
  "二 商业模式：①交易标的物（商品贸易：品牌 / 主营产品 / 市场定价区间；服务贸易：服务内容 / 市场定价区间）· ②业务类型与盈利模式（靠什么赚钱：量×价、成本结构、毛利来源；盈利公式用 formula 居中单独成行）· ③主要上下游客商（各核心客商简介 + 已知工商 / 资信 / 涉诉风险；查不到的标「需补」，绝不杜撰）· ④交易结构链路图（货流 / 单据流 / 资金流的流向与周期、货权转移点、结算方式[预付 / 赊销 / 带款提货]，用 dealflow 画中心辐射图）｜" +
  "三 经济效益：①市场情况（所在行业发展与趋势研判，≤500字）· ②经济效益测算（采销计划、成本 / 收入 / 毛利、周期与回收；有数据用表格测算、无则标「需补」，绝不虚构数字）｜" +
  "四 风险分析及控制措施（逐条「风险 → 控制措施」，用表格或分组块）：政策性风险 · 客商信用风险（含回款）· 交易标的物风险 · 市场风险 · 其他（汇率 / 授权 / 资质）｜" +
  "五 立项结论（综合商业模式、经济效益、客商资信、风险控制，落到「继续推进 / 暂缓」的明确结论与下一步：继续推进＝推动公司内部决策、深入探讨要不要做、需补哪些尽调；暂缓＝因何暂缓、恢复条件；用 verdict 收口）";

export interface ProjectReportInput { name: string; industry: string; counterparty?: string; ourRole?: string; }
export interface ProjectReportCtx {
  deepReport: string;     // 调研前 深度分析 定稿（事实底稿）
  materials: string;      // 本单材料
  records: string;        // 洽谈记录（问答 / 未决项）
  verdict: string;        // 继续推进 / 暂缓
  verdictReason: string;
  stance: string;
  grounds: string[];
  confidence: string;
  falsifiers: string[];
  tx: string;             // 交易框架（据实录入）
}

// 组装「一键导出项目报告」的模型请求（纯函数、可单测）。走「定稿」主笔。
export function buildProjectReportRequest(inp: ProjectReportInput, ctx: ProjectReportCtx, model: string): ChatRequest {
  const subj = `本单「${inp.name}」${inp.counterparty ? ` · 对方「${inp.counterparty}」` : ""}${inp.industry ? ` · 行业「${inp.industry}」` : ""}`;
  const g = ctx.grounds.filter((x) => x.trim());
  const f = ctx.falsifiers.filter((x) => x.trim());
  const user =
    `${subj}。请写一份【项目立项报告】——面向公司内部决策者，客观讲清这单业务是什么、商业模式、经济效益、风险与控制，最后给出立项结论。` +
    `\n【必须遵循的框架 · 章节与顺序照此；团队安排与推进计划不写】\n${PROJECT_REPORT_FRAME}` +
    `\n\n【调研前·深度分析（事实底稿，据此提炼，勿照抄原文）】\n${ctx.deepReport.trim() || "（尚未生成深度分析——请据下方材料与洽谈记录，能写则写、缺口标「需补」，绝不虚构）"}` +
    `\n\n【本单材料】\n${ctx.materials.trim() || "（无）"}` +
    `\n\n【洽谈记录（带问题去核后的答案 / 未决项）】\n${ctx.records.trim() || "（无）"}` +
    `\n\n【当前定调】${ctx.verdict}：${ctx.verdictReason.trim() || "（未填）"}` +
    `\n【可行性判断】立场：${ctx.stance.trim() || "（未填）"}；把握度：${ctx.confidence}；依据：${g.join("；") || "（未填）"}；falsifiers：${f.join("；") || "（未填）"}` +
    `\n【交易框架（据实录入）】\n${ctx.tx.trim() || "（未填）"}` +
    `\n\n用 markdown 输出，结论先行、结构化优先。${STRUCTURE_RULE} ${NEUTRALITY} ${MARKUP_HINT} ${CITE_HINT} ${SOURCE_HINT} ${LENGTH_HINT}` +
    `\n特别注意：「交易结构链路图」用 dealflow 画、「盈利公式」用 formula 居中、「经济效益测算」用表格、「风险分析及控制措施」用表格或分组块（每条：风险 | 控制措施）、结尾「立项结论」用 verdict；全篇定调要与「${ctx.verdict}」一致。`;
  return { model, system: AGENT_SYS["定稿"], messages: [{ role: "user", content: user }], maxTokens: 8000 };
}

// 无真实模型（mock）时的兜底骨架：把已填字段落进框架、缺口标「需补」，保证「一键导出」始终能出一份文档。
export function mockProjectReport(inp: ProjectReportInput, ctx: ProjectReportCtx): string {
  const next = ctx.verdict === "继续推进"
    ? "推动公司内部决策、深入探讨要不要做；补齐关键尽调与经济效益测算"
    : "暂缓推进；待关键前提确认 / 条件成熟后再启动";
  const g = ctx.grounds.filter((x) => x.trim());
  return [
    `# 项目立项报告 · ${inp.name}`,
    ``,
    `> 结论：${ctx.verdict} —— ${ctx.verdictReason.trim() || "（补一句定调理由）"}`,
    ``,
    `## 项目基本情况`,
    `${inp.counterparty ? `对方：${inp.counterparty}。` : ""}项目背景、业务概要与意义——请补充；或先到「调研前 · 深度分析」生成研究底稿，再一键导出即为完整报告。`,
    ``,
    `## 商业模式`,
    `### 交易标的物`,
    `商品贸易：品牌 / 主营产品 / 市场定价区间；服务贸易：服务内容 / 定价区间——需补。`,
    `### 业务类型与盈利模式`,
    `靠什么赚钱：量×价、成本结构、毛利来源——需补。`,
    `### 主要上下游客商`,
    `各核心客商简介与工商 / 资信——需补。`,
    `### 交易结构链路图`,
    `${ctx.tx.trim() || "据实录入：货流 / 单据流 / 资金流、货权转移点、结算方式（预付 / 赊销 / 带款提货）——需补。"}`,
    ``,
    `## 经济效益`,
    `### 市场情况`,
    `所在行业发展与趋势——需补。`,
    `### 经济效益测算`,
    `采销计划、成本 / 收入 / 毛利、周期与回收——需补（有数据再据实测算，不虚构）。`,
    ``,
    `## 风险分析及控制措施`,
    ``,
    `| 风险 | 控制措施 |`,
    `| --- | --- |`,
    `| 政策性风险 | 需补 |`,
    `| 客商信用风险（含回款） | 需补 |`,
    `| 交易标的物风险 | 需补 |`,
    `| 市场风险 | 需补 |`,
    `| 其他（汇率 / 授权 / 资质） | 需补 |`,
    ``,
    `## 立项结论`,
    ``,
    "```verdict",
    `定调 | ${ctx.verdict}`,
    `理由 | ${ctx.verdictReason.trim() || "需补"}`,
    `下一步 | ${next}`,
    "```",
    g.length ? `\n立场依据：${g.join("；")}。` : "",
  ].join("\n");
}

// ——分块精读（map-reduce）：长材料切块逐块抽取，避免一坨塞进去被模型略读——
// 按段落聚合到约 size 字一块；超长段落硬切。纯函数、可单测。
export function chunkText(text: string, size = 6000): string[] {
  const paras = text.replace(/\r/g, "").split(/\n{2,}/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > size) { chunks.push(cur); cur = ""; }
    cur = cur ? cur + "\n\n" + p : p;
    while (cur.length > size * 1.6) { chunks.push(cur.slice(0, size)); cur = cur.slice(size); }   // 硬切超长段
  }
  if (cur.trim()) chunks.push(cur);
  return chunks.length ? chunks : [text];
}

// 逐块精读的请求：忠实抽取本块里与主题相关的事实/数据/结论，不发挥、不编造。
export function buildDigestRequest(input: PipelineInput, chunk: string, idx: number, total: number, model: string): ChatRequest {
  const { subject } = frameFor(input);
  const user = `${subject}。下面是本单材料的第 ${idx}/${total} 段（可能是研报 / 尽调稿的一部分）。` +
    "请从这一段里，逐条抽取与本主题相关的：关键事实、数据（带口径 / 单位 / 时间）、结论与观点、以及表格里的重要数字。" +
    "忠实原文、不要发挥、不要编造；有来源/日期就带上。若本段与主题无关，只回「（本段无相关内容）」。用要点列出。\n\n" +
    `材料片段：\n${chunk}`;
  return { model, system: AGENT_SYS.资料, messages: [{ role: "user", content: user }], maxTokens: 2000 };
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
      return { stageId: stage.id, summary: `按内置框架把${subj}（${input.industry}）定框：先给核心结论·画像，再依次 本质 → 发展阶段与趋势 → 产业链与价值链 → 需求侧 → 供给格局 → 商业模式 → 技术演进 → 政策监管 → 综合研判，逐一落到具体情形；中性客观、不预设立场。` };
    case "资料":
      return { stageId: stage.id, summary: "读入本单材料，抽取关键事实与数据；缺料标「需补」、公开查不到标「未公开」，不杜撰。" };
    case "起草":
      return { stageId: stage.id, summary: "产出中性研究综述：每部分先讲清事实与逻辑、再给有节制的判断；量化带口径 / 来源，正反兼陈。" };
    case "红队":
      return { stageId: stage.id, summary: "事实与中立性审查：指出无来源的断言、疑似编造、一边倒的倾向、口径含糊之处，列出必须修正项。" };
    case "定稿":
      return { stageId: stage.id, summary: "逐条采纳审查意见：补来源与口径、平衡正反表述、信息不足处如实说明。" };
    case "验收":
      return { stageId: stage.id, summary: "5 线自检：事实有据✓ 缺口已标✓ 中性无编造✓ 结构清楚✓ 内容齐全✓" };
  }
}

export function mockReport(input: PipelineInput): MockReport {
  const subj = input.company || input.industry;
  return {
    title: `${subj} · ${input.focus || "研究"}（示例）`,
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
