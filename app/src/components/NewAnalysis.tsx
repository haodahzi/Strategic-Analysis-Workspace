import { useState } from "react";
import { Analysis, CellState, DIMENSIONS, Matrix, PHASE_COLS, PhaseCol } from "../types";
import { Attachment } from "../llm/pipelineStore";
import MaterialsInput from "./MaterialsInput";

const ROLES = ["资金方", "场地资源方", "货源方", "运营方", "牵头整合", "客户方", "其他"];

// 分析类型 = 决定填什么、走哪套内置框架（三者框架不同）。
const FOCUS: { key: string; desc: string }[] = [
  { key: "行业深度分析", desc: "把一个行业客观摸透：怎么运转、格局、商业逻辑" },
  { key: "企业画像", desc: "一份朴素的公司介绍：业务 / 财务 / 团队 / 位势" },
  { key: "项目可行性", desc: "评估一单能不能做、值不值得（含交易结构）" },
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

// onCreate 带上本单资料：新建即开始生成（#3 合并「新建」与「开始分析」，不再二次填写）。
export default function NewAnalysis({ onCreate, onCancel }: { onCreate: (a: Analysis, materials: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [focus, setFocus] = useState(() => new URLSearchParams(window.location.search).get("nf") || "行业深度分析");
  const [industry, setIndustry] = useState("");
  const [company, setCompany] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [ourRole, setOurRole] = useState("资金方");
  const [roleOther, setRoleOther] = useState("");
  const [materials, setMaterials] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const isCompany = focus === "企业画像";
  const isDeal = focus === "项目可行性";
  const role = isDeal ? (ourRole === "其他" ? roleOther.trim() : ourRole) : "";
  const subjectOk = isCompany ? company.trim() : industry.trim();
  const canCreate = !!(name.trim() && subjectOk && (isDeal ? counterparty.trim() : true));

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
    const combined = [materials.trim(), ...attachments.map((x) => `【附件：${x.name}】\n${x.text}`)].filter(Boolean).join("\n\n");
    onCreate(a, combined);
  };

  return (
    <div className="dash">
      <div className="dash-head">
        <h2>新建分析</h2>
      </div>

      <div className="na-form">
        <label className="fld"><span>分析名称</span>
          <input className="key-input wide" value={name} placeholder="如：灵巧手 · 行业深度分析" onChange={(e) => setName(e.target.value)} />
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
              <input className="key-input wide" value={company} placeholder="要介绍的公司全称" onChange={(e) => setCompany(e.target.value)} />
            </label>
            <label className="fld"><span>行业（选填）</span>
              <input className="key-input wide" value={industry} placeholder="这家公司所在行业" onChange={(e) => setIndustry(e.target.value)} />
            </label>
          </>
        ) : isDeal ? (
          <>
            <label className="fld"><span>行业</span>
              <input className="key-input wide" value={industry} placeholder="如：灵巧手 / 冷链物流" onChange={(e) => setIndustry(e.target.value)} />
            </label>
            <label className="fld"><span>对方 / 对手方</span>
              <input className="key-input wide" value={counterparty} placeholder="这单的合作 / 交易对方" onChange={(e) => setCounterparty(e.target.value)} />
            </label>
          </>
        ) : (
          <label className="fld"><span>行业</span>
            <input className="key-input wide" value={industry} placeholder="如：灵巧手 / 冷链物流 / 光伏 EPC" onChange={(e) => setIndustry(e.target.value)} />
          </label>
        )}

        {/* 我方角色：仅项目可行性需要（研究优先、不预设立场，行业 / 企业分析不涉及我方） */}
        {isDeal && (
          <div className="fld"><span>我方角色（选填）</span>
            <div className="na-roles">
              {ROLES.map((r) => (
                <button key={r} type="button" className={"na-chip" + (ourRole === r ? " on" : "")} onClick={() => setOurRole(r)}>{r}</button>
              ))}
            </div>
            {ourRole === "其他" && (
              <input className="key-input wide" style={{ marginTop: 8 }} value={roleOther} placeholder="填写我方角色…" onChange={(e) => setRoleOther(e.target.value)} />
            )}
          </div>
        )}

        <div className="fld"><span>本单资料（选填）· 可上传多份 PDF，后台自动提取喂给分析</span>
          <MaterialsInput
            materials={materials} onMaterials={setMaterials}
            attachments={attachments}
            onAdd={(a) => setAttachments((xs) => [...xs.filter((x) => x.name !== a.name), a])}
            onRemove={(n) => setAttachments((xs) => xs.filter((x) => x.name !== n))}
          />
        </div>

        <div className="na-actions">
          <button type="button" className="app-btn" disabled={!canCreate} onClick={create}>建好并开始深度分析 →</button>
          <button type="button" className="app-btn ghost dark" onClick={onCancel}>取消</button>
          {!canCreate && <span className="set-hint">{isCompany ? "分析名称、企业名称为必填。" : isDeal ? "分析名称、行业、对方为必填。" : "分析名称、行业为必填。"}</span>}
        </div>
      </div>
    </div>
  );
}
