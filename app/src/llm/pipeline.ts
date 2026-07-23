// 多智能体报告流水线：规划→起草→红队反驳→定稿→验收。
// 每个 stage 都是用户可见的「子任务」，实时勾选显示进度与思考（掌控感）。
// 纯逻辑 + Mock 内容在此；动画/时序在 ReportProgress 组件里驱动。
// 真实模型路径：每个 stage 一次 LLM 调用，前一步产物喂给下一步（此处给出结构，Key 就绪即接）。

export type AgentRole = "规划" | "起草" | "红队" | "定稿" | "验收";

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
  { id: "draft", role: "起草", title: "起草初稿", detail: "按骨架产出判断卡、行业分层、量化区间（每条标口径）" },
  { id: "red", role: "红队", title: "红队反驳", detail: "挑漏洞：证据够不够、口径清不清、风险有没有名有姓、falsifiers 够不够狠" },
  { id: "final", role: "定稿", title: "吸收反驳 · 定稿", detail: "逐条回应红队意见，产出终稿（仍为待审初稿）" },
  { id: "check", role: "验收", title: "自检验收 6 线", detail: "对照 6 条验收线逐条打钩，缺项打回" },
];

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
