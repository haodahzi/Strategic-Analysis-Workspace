import { useState } from "react";
import { Analysis, CellState, DIMENSIONS, Matrix, PHASE_COLS, PhaseCol } from "../types";

const ROLES = ["资金方", "场地资源方", "货源方", "运营方", "牵头整合", "客户方", "其他"];

// 分析类型 = 决定填什么、走哪套内置框架（三者框架不同）。
const FOCUS: { key: string; desc: string }[] = [
  { key: "行业深度分析", desc: "把一个行业摸透（可跨项目复用）" },
  { key: "企业画像", desc: "把一家企业摸透：诉求 / 资质 / 决策链 / 筹码" },
  { key: "项目可行性", desc: "评估一单该不该做（含交易框架）" },
];

function emptyMatrix(): Matrix {
  const out = {} as Matrix;
  for (const d of DIMENSIONS) {
    const row = {} as Record<PhaseCol, CellState>;
    for (const c of PHASE_COLS) row[c] = "空";
    out[d] = row;
  }
  return out;
}

export default function NewAnalysis({ onCreate, onCancel }: { onCreate: (a: Analysis) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [focus, setFocus] = useState(() => new URLSearchParams(window.location.search).get("nf") || "行业深度分析");
  const [industry, setIndustry] = useState("");
  const [company, setCompany] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [ourRole, setOurRole] = useState("资金方");
  const [roleOther, setRoleOther] = useState("");
  const [lightScan, setLightScan] = useState("");

  const role = ourRole === "其他" ? roleOther.trim() : ourRole;
  const isCompany = focus === "企业画像";
  const isDeal = focus === "项目可行性";
  const subjectOk = isCompany ? company.trim() : industry.trim();
  const canCreate = !!(name.trim() && role && subjectOk && (isDeal ? counterparty.trim() : true));

  const create = () => {
    if (!canCreate) return;
    const a: Analysis = {
      id: "a-" + Date.now().toString(36),
      name: name.trim(),
      ourRole: role,
      industry: industry.trim(),
      focus,
      company: isCompany ? company.trim() : undefined,
      counterparty: isDeal ? counterparty.trim() : undefined,
      stage: "调研前",
      updatedAt: new Date().toISOString().slice(0, 10),
      assumptions: 0,
      dealBreakers: 0,
      matrix: emptyMatrix(),
      deliverables: [],
    };
    onCreate(a);
  };

  return (
    <div className="dash">
      <div className="dash-head">
        <h2>新建分析</h2>
      </div>

      <div className="na-form">
        <label className="fld"><span>分析名称</span>
          <input className="key-input wide" value={name} placeholder="如：某智算中心 · 算力租赁合作" onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="fld"><span>分析类型</span>
          <div className="na-focus">
            {FOCUS.map((f) => (
              <button key={f.key} type="button" className={"na-focus-card" + (focus === f.key ? " on" : "")} onClick={() => setFocus(f.key)}>
                <div className="na-focus-t">{f.key}</div>
                <div className="na-focus-d">{f.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 按类型填不同的分析对象 */}
        {isCompany ? (
          <>
            <label className="fld"><span>企业名称</span>
              <input className="key-input wide" value={company} placeholder="要摸透的企业全称" onChange={(e) => setCompany(e.target.value)} />
            </label>
            <label className="fld"><span>行业（选填）</span>
              <input className="key-input wide" value={industry} placeholder="这家企业所在行业" onChange={(e) => setIndustry(e.target.value)} />
            </label>
          </>
        ) : isDeal ? (
          <>
            <label className="fld"><span>行业</span>
              <input className="key-input wide" value={industry} placeholder="如：算力租赁 / 冷链物流" onChange={(e) => setIndustry(e.target.value)} />
            </label>
            <label className="fld"><span>对方 / 对手方</span>
              <input className="key-input wide" value={counterparty} placeholder="这单的合作 / 交易对方" onChange={(e) => setCounterparty(e.target.value)} />
            </label>
          </>
        ) : (
          <label className="fld"><span>行业</span>
            <input className="key-input wide" value={industry} placeholder="如：算力租赁 / 冷链物流 / 光伏 EPC" onChange={(e) => setIndustry(e.target.value)} />
          </label>
        )}

        <div className="fld"><span>我方角色</span>
          <div className="na-roles">
            {ROLES.map((r) => (
              <button key={r} type="button" className={"na-chip" + (ourRole === r ? " on" : "")} onClick={() => setOurRole(r)}>{r}</button>
            ))}
          </div>
          {ourRole === "其他" && (
            <input className="key-input wide" style={{ marginTop: 8 }} value={roleOther} placeholder="填写我方角色…" onChange={(e) => setRoleOther(e.target.value)} />
          )}
        </div>

        <label className="fld"><span>轻扫信息（可选）</span>
          <textarea className="key-input wide" rows={3} value={lightScan} placeholder="已知的零碎信息：对方是谁、想干什么、卡在哪…" onChange={(e) => setLightScan(e.target.value)} />
        </label>

        <div className="na-actions">
          <button type="button" className="app-btn" disabled={!canCreate} onClick={create}>建好并开始深度分析 →</button>
          <button type="button" className="app-btn ghost dark" onClick={onCancel}>取消</button>
          {!canCreate && <span className="set-hint">{isCompany ? "分析名称、企业名称、我方角色为必填。" : isDeal ? "分析名称、行业、对方、我方角色为必填。" : "分析名称、行业、我方角色为必填。"}</span>}
        </div>
      </div>
    </div>
  );
}
