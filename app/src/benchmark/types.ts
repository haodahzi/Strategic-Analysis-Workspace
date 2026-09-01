// [对标情报] 对标企业情报 · 类型定义。整块功能自成一模块（src/benchmark/），删除见 README.md。
export type EventType =
  | "战略与经营" | "产品与服务" | "客户与项目" | "渠道与市场"
  | "投资、融资与并购" | "组织与核心人才" | "招聘、技术与专利" | "风险与舆情";
export const EVENT_TYPES: EventType[] = [
  "战略与经营", "产品与服务", "客户与项目", "渠道与市场",
  "投资、融资与并购", "组织与核心人才", "招聘、技术与专利", "风险与舆情",
];
export type Importance = "重大" | "重要" | "一般";
export const IMPORTANCE: Importance[] = ["重大", "重要", "一般"];
export const IMPORTANCE_RANK: Record<Importance, number> = { 重大: 3, 重要: 2, 一般: 1 };
export type Confidence = "高" | "中" | "低";
export type Feedback = "有用" | "不相关" | "分析不准确";

export interface IntelSource { url: string; name: string; publishTime?: string; }

export interface IntelEvent {
  id: string;
  unitId: string;
  companyId: string;
  company: string;              // 冗余存企业名，便于列表直接显示
  title: string;                // 一句话事件
  type: EventType;
  importance: Importance;
  occurTime: string;            // 事件发生 / 生效时间（YYYY-MM 或 YYYY-MM-DD，可能为空→用发布时间）
  publishTime: string;          // 来源发布时间
  facts: string;                // 公开事实（仅来源支持，不含推测）
  impact: string;               // 潜在影响（AI）
  action: string;               // 建议行动（AI）
  confidence: Confidence;
  confidenceBasis: string;      // 置信度判断依据
  sources: IntelSource[];       // 一事多源聚合
  month: string;                // 归档月份 YYYY-MM（优先按发生时间）
  createdAt: string;            // 本地入库时间 ISO
  read?: boolean;
  starred?: boolean;
  feedback?: Feedback;
}

export interface Company { id: string; name: string; aliases: string[]; active: boolean; }
export interface Unit { id: string; name: string; companies: Company[]; }
export interface RefreshLog { unitId: string; month: string; at: string; count: number; note?: string; }

export interface BenchmarkData { units: Unit[]; events: IntelEvent[]; refreshes: RefreshLog[]; }

// 当前自然月 YYYY-MM
export function curMonth(): string { return new Date().toISOString().slice(0, 7); }
// 去重键：企业 + 类型 + 标题核（剥非字），供刷新时合并同一事件、保留用户状态
export function dedupKey(companyId: string, type: string, title: string): string {
  return companyId + "|" + type + "|" + title.replace(/[\s，。、,.:：;；!！?？"“”'‘’()（）\-—_]/g, "").slice(0, 24);
}
