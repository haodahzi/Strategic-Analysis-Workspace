import { useState } from "react";
import { Analysis, CellState, DIMENSIONS, Matrix, PHASE_COLS, PhaseCol } from "../types";

// 我方角色在这里定义（Step 0 定框据此为各维度排权重）。
const ROLES = ["资金方", "场地资源方", "货源方", "运营方", "牵头整合", "客户方", "其他"];

// 本次分析重点 = 决定先产哪份交付物、走哪套提示词（三者提示词不同）。
const FOCUS: { key: string; desc: string }[] = [
  { key: "项目可行性", desc: "全流程评估这单该不该做（默认）" },
  { key: "行业深度分析", desc: "先把行业摸透，可跨项目复用" },
  { key: "企业画像", desc: "先把对方摸透：诉求 / 资质 / 决策链" },
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
  const [industry, setIndustry] = useState("");
  const [ourRole, setOurRole] = useState("资金方");
  const [roleOther, setRoleOther] = useState("");
  const [focus, setFocus] = useState("项目可行性");
  const [lightScan, setLightScan] = useState("");

  const role = ourRole === "其他" ? roleOther.trim() : ourRole;
  const canCreate = !!(name.trim() && industry.trim() && role);

  const create = () => {
    if (!canCreate) return;
    const a: Analysis = {
      id: "a-" + Date.now().toString(36),
      name: name.trim(),
      ourRole: role,
      industry: industry.trim(),
      focus,
      stage: "定框",
      updatedAt: new Date().toISOString().slice(0, 10),
      assumptions: 0,
      dealBreakers: 0,
      matrix: emptyMatrix(),
      deliverables: [{ kind: "评估框架（活草稿）", durability: "易耗", status: "初稿" }],
    };
    onCreate(a);
  };

  return (
    <div className="dash">
      <div className="dash-head">
        <h2>新建分析</h2>
      </div>

      <div className="na-form">
        <label className="fld"><span>分析名称（这单的称呼）</span>
          <input className="key-input wide" value={name} placeholder="如：某智算中心 · 算力租赁合作" onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="fld"><span>行业</span>
          <input className="key-input wide" value={industry} placeholder="如：算力租赁 / 冷链物流 / 光伏 EPC" onChange={(e) => setIndustry(e.target.value)} />
        </label>

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

        <div className="fld"><span>本次分析重点</span>
          <div className="na-focus">
            {FOCUS.map((f) => (
              <button key={f.key} type="button" className={"na-focus-card" + (focus === f.key ? " on" : "")} onClick={() => setFocus(f.key)}>
                <div className="na-focus-t">{f.key}</div>
                <div className="na-focus-d">{f.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <label className="fld"><span>轻扫信息（可选）</span>
          <textarea className="key-input wide" rows={3} value={lightScan} placeholder="这单已知的零碎信息：对方是谁、想干什么、卡在哪…（定框时垫底）" onChange={(e) => setLightScan(e.target.value)} />
        </label>

        <div className="na-actions">
          <button type="button" className="app-btn" disabled={!canCreate} onClick={create}>建好并进入 Step 0 定框 →</button>
          <button type="button" className="app-btn ghost dark" onClick={onCancel}>取消</button>
          {!canCreate && <span className="set-hint">分析名称、行业、我方角色为必填。</span>}
        </div>
      </div>
    </div>
  );
}
