// 演示种子数据（第一段用；第二段接 SQLite 后由真实项目替代）。
import {
  CellState, DimensionKey, DIMENSIONS, KbEnterprise, KbIndustry, Matrix, Analysis,
} from "../types";

type Row = [CellState, CellState, CellState];
function mat(rows: Partial<Record<DimensionKey, Row>>): Matrix {
  const out = {} as Matrix;
  for (const d of DIMENSIONS) {
    const r: Row = rows[d] ?? ["空", "空", "空"];
    out[d] = { 调研前: r[0], 洽谈中: r[1], 洽谈后: r[2] };
  }
  return out;
}

export const analyses: Analysis[] = [
  {
    id: "p-suanli",
    name: "某智算中心 · 算力租赁合作",
    ourRole: "资金方",
    industry: "算力租赁",
    stage: "调研前",
    updatedAt: "2026-07-18",
    assumptions: 3,
    dealBreakers: 1,
    premises: [
      { text: "标的算力集群真实上架率与租约锁定期达到融资测算下限（≥80% 上架、租期 ≥3 年）", dimension: "项目评估", status: "待验证" },
      { text: "终端租户（算力需求方）信用与付款能力真实、可长期履约", dimension: "对方画像", status: "假设" },
      { text: "本单非「名实分离/回租套利」，资金-货物-票-合同四流一致、可穿透合规", dimension: "风险维度", dealBreaker: true, status: "待验证" },
    ],
    hasIndustryReport: true,
    matrix: mat({
      行业理解: ["结论", "空", "空"],
      我方角色: ["结论", "空", "空"],
      对方画像: ["验证", "空", "空"],
      项目评估: ["假设", "空", "空"],
      风险维度: ["假设", "空", "空"],
      战略布局匹配: ["假设", "空", "空"],
    }),
    deliverables: [
      { kind: "行业深度分析", durability: "半耐用", status: "完成" },
      { kind: "企业画像", durability: "半耐用", status: "进行中" },
    ],
  },
  {
    id: "p-lengchain",
    name: "跨境冷链仓储 · 场地合作",
    ourRole: "场地资源方",
    industry: "冷链物流",
    stage: "洽谈中",
    updatedAt: "2026-07-19",
    assumptions: 4,
    dealBreakers: 2,
    premises: [
      { text: "冷库能耗/电价与制冷负荷测算成立，空置期我方不兜底", dimension: "风险维度", dealBreaker: true, status: "待验证" },
      { text: "运营方对上架率/周转的承诺有真实货源支撑", dimension: "对方画像", dealBreaker: true, status: "待验证" },
      { text: "温控合规资质齐全（HACCP，涉药则 GSP）", dimension: "风险维度", status: "已确认" },
      { text: "场地租金与运营分成的价值分配对我方公允", dimension: "项目评估", status: "假设" },
    ],
    matrix: mat({
      行业理解: ["结论", "结论", "空"],
      我方角色: ["结论", "结论", "空"],
      对方画像: ["结论", "验证", "空"],
      项目评估: ["假设", "验证", "空"],
      风险维度: ["假设", "验证", "空"],
      战略布局匹配: ["结论", "验证", "空"],
    }),
    deliverables: [
      { kind: "行业深度分析", durability: "半耐用", status: "完成" },
      { kind: "企业画像", durability: "半耐用", status: "完成" },
      { kind: "洽谈问题清单", durability: "易耗", status: "完成" },
    ],
  },
  {
    id: "p-pv",
    name: "光伏 EPC 联合体 · 牵头整合",
    ourRole: "牵头整合",
    industry: "光伏 EPC",
    stage: "洽谈后",
    updatedAt: "2026-07-20",
    assumptions: 5,
    dealBreakers: 1,
    premises: [
      { text: "联合体各方资质与并网路条真实齐备", dimension: "对方画像", status: "已确认" },
      { text: "组件/逆变器供货价与工期锁定，不被涨价击穿", dimension: "项目评估", dealBreaker: true, status: "待验证" },
      { text: "业主付款节点与回款风险可控", dimension: "风险维度", status: "已确认" },
      { text: "联合体内部权责分成清晰、无连带塌方风险", dimension: "我方角色", status: "已确认" },
      { text: "补贴/电价政策在测算周期内稳定", dimension: "战略布局匹配", status: "已确认" },
    ],
    matrix: mat({
      行业理解: ["结论", "结论", "结论"],
      我方角色: ["结论", "结论", "结论"],
      对方画像: ["结论", "结论", "结论"],
      项目评估: ["假设", "验证", "结论"],
      风险维度: ["假设", "验证", "结论"],
      战略布局匹配: ["结论", "结论", "结论"],
    }),
    deliverables: [
      { kind: "行业深度分析", durability: "半耐用", status: "完成" },
      { kind: "企业画像", durability: "半耐用", status: "完成" },
      { kind: "洽谈问题清单", durability: "易耗", status: "完成" },
      { kind: "合作备忘（可行性+交易结构图）", durability: "易耗", status: "初稿" },
    ],
  },
  {
    id: "p-medical",
    name: "医疗器械代运营 · 渠道合作",
    ourRole: "运营方",
    industry: "医疗器械流通",
    stage: "定框",
    updatedAt: "2026-07-21",
    assumptions: 0,
    dealBreakers: 0,
    matrix: mat({
      我方角色: ["假设", "空", "空"],
      行业理解: ["假设", "空", "空"],
    }),
    deliverables: [
      { kind: "评估框架（活草稿）", durability: "易耗", status: "初稿" },
    ],
  },
];

export const kbIndustry: KbIndustry[] = [
  { id: "ki-suanli", industry: "算力租赁", version: 2, updatedAt: "2026-07-18", hasSample: true },
  { id: "ki-lengchain", industry: "冷链物流", version: 1, updatedAt: "2026-07-12" },
  { id: "ki-pv", industry: "光伏 EPC", version: 1, updatedAt: "2026-07-05" },
];

export const kbEnterprise: KbEnterprise[] = [
  { id: "ke-zhisuan", company: "某智算科技有限公司", version: 1, updatedAt: "2026-07-16" },
  { id: "ke-lengchain", company: "某冷链物流集团", version: 1, updatedAt: "2026-07-11" },
];
