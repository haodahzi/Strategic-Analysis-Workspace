// 核心数据类型（第一段 Web 内核）。详见 docs/详细设计-核心数据结构.md。
export type PhaseCol = "调研前" | "洽谈中" | "洽谈后";
export type Stage = "调研前" | "洽谈中" | "洽谈后";
export type DimensionKey =
  | "行业理解" | "对方画像" | "项目评估"
  | "风险维度" | "战略布局匹配" | "我方角色";
export type CellState = "空" | "假设" | "验证" | "结论";
export type Matrix = Record<DimensionKey, Record<PhaseCol, CellState>>;

export interface Deliverable {
  kind: string;
  durability: "半耐用" | "易耗";
  status: "初稿" | "进行中" | "完成";
}

// 「这单成立」所依赖的前提假设——贯穿主线的锚。dealBreaker=错了就能推翻整单。
export type PremiseStatus = "假设" | "待验证" | "已确认" | "已推翻";
export interface Premise {
  text: string;                 // 具体假设内容（不是数量！）
  dimension: DimensionKey;      // 挂在哪个评估维度
  dealBreaker?: boolean;        // 是否「错了就能推翻这单」
  status?: PremiseStatus;       // 假设→待验证→已确认/已推翻
}

export interface Analysis {
  id: string;
  name: string;
  ourRole: string;
  industry: string;
  focus?: string;               // 本次分析类型：项目可行性 / 行业深度分析 / 企业画像
  company?: string;             // 企业画像：被分析的企业名称
  counterparty?: string;        // 项目分析：对方 / 对手方
  stage: Stage;
  updatedAt: string;
  assumptions: number;
  dealBreakers: number;
  premises?: Premise[];         // 前提假设的具体内容（有则据此渲染主线，数量由它推导）
  matrix: Matrix;
  deliverables: Deliverable[];
  hasIndustryReport?: boolean;
}

// 洽谈重点清单条目（可编辑：#6）。由前提假设转化，deal-breaker 置顶。
export interface QItem {
  id: string;
  text: string;
  intent: "要查" | "要问对方" | "待搞清";
  dealBreaker?: boolean;
  answered?: boolean;
  note?: string;                 // 洽谈中回填的答案/记录
}

export interface KbIndustry {
  id: string; industry: string; version: number; updatedAt: string; hasSample?: boolean;
}
export interface KbEnterprise {
  id: string; company: string; version: number; updatedAt: string;
}

export const DIMENSIONS: DimensionKey[] = [
  "行业理解", "对方画像", "我方角色", "项目评估", "风险维度", "战略布局匹配",
];
export const STAGES: Stage[] = ["调研前", "洽谈中", "洽谈后"];
export const PHASE_COLS: PhaseCol[] = ["调研前", "洽谈中", "洽谈后"];
