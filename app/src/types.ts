// 核心数据类型（第一段 Web 内核）。详见 docs/详细设计-核心数据结构.md。
export type PhaseCol = "调研前" | "洽谈中" | "洽谈后";
export type Stage = "定框" | "调研前" | "洽谈中" | "洽谈后";
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

export interface Analysis {
  id: string;
  name: string;
  ourRole: string;
  industry: string;
  stage: Stage;
  updatedAt: string;
  assumptions: number;
  dealBreakers: number;
  matrix: Matrix;
  deliverables: Deliverable[];
  hasIndustryReport?: boolean;
}

export interface KbIndustry {
  id: string; industry: string; version: number; updatedAt: string; hasSample?: boolean;
}
export interface KbEnterprise {
  id: string; company: string; version: number; updatedAt: string;
}

export const DIMENSIONS: DimensionKey[] = [
  "行业理解", "对方画像", "项目评估", "风险维度", "战略布局匹配", "我方角色",
];
export const STAGES: Stage[] = ["定框", "调研前", "洽谈中", "洽谈后"];
export const PHASE_COLS: PhaseCol[] = ["调研前", "洽谈中", "洽谈后"];
