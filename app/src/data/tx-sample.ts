import { TxStructure } from "../domain/tx";

// 演示四流结构（算力租赁项目·洽谈后）：
// 甲方签约并付款，但租金付给合同外的关联方丙 → 收款主体≠签约主体（代收代付/名实分离）。
// 叠加高位锁价 vs 买方市场 → 时点黄灯。生产中此结构由 AI 从会议记录抽取（structured output）。
export const sampleTx: TxStructure = {
  parties: [
    { id: "jia", name: "甲方（我方 · 资金方）", roles: ["签约主体", "付款主体", "收货/服务接收", "受票方"] },
    { id: "yi", name: "乙方（运营方）", roles: ["签约主体", "发货/服务提供", "开票方"] },
    { id: "bing", name: "丙方（关联收款方）", roles: ["收款主体"] },
    { id: "chang", name: "场地方 / IDC", roles: ["签约主体", "发货/服务提供", "开票方"] },
  ],
  flows: [
    { id: "c1", type: "合同流", from: "jia", to: "yi", instrument: "算力租赁合同" },
    { id: "c2", type: "合同流", from: "yi", to: "chang", instrument: "机柜租赁合同" },
    { id: "m1", type: "资金流", from: "jia", to: "bing", instrument: "租金", amount: 1200 },
    { id: "m2", type: "资金流", from: "yi", to: "chang", instrument: "机柜·电力·运维费", amount: 300 },
    { id: "g1", type: "货物服务流", from: "yi", to: "jia", instrument: "算力 / Token 服务" },
    { id: "i1", type: "票流", from: "yi", to: "jia", instrument: "增值税专用发票" },
    { id: "g2", type: "货物服务流", from: "chang", to: "yi", instrument: "机柜 · 电力 · 运维" },
    { id: "i2", type: "票流", from: "chang", to: "yi", instrument: "服务费专用发票" },
  ],
  timing: { lockPeriod: "3 年闭口", lockPrice: "高位锁价", marketCycle: "买方市场价格下行" },
};
