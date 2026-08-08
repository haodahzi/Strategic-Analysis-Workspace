import { useCallback, useState, useSyncExternalStore } from "react";
import { Analysis, QItem, Stage } from "../types";
import PhaseRail from "./PhaseRail";
import ReportProgress from "./ReportProgress";
import NegotiationDesk from "./NegotiationDesk";
import ProjectReport from "./ProjectReport";
import MaterialsInput from "./MaterialsInput";
import { addAttachment, getRun, removeAttachment, setAnalysisQuestions, setMaterials, startRun, subscribe } from "../llm/pipelineStore";

const STAGE_CLASS: Record<Stage, string> = { 调研前: "st-pre", 洽谈中: "st-neg", 洽谈后: "st-post" };

function seedQuestions(a: Analysis): QItem[] {
  return (a.premises ?? []).map((p, i) => ({
    id: "q-seed-" + i,
    text: p.text,
    intent: p.dimension === "对方画像" ? "要问对方" : "要查",
    dealBreaker: p.dealBreaker,
  }));
}

export default function ProjectWorkspace({ analysis, onUpdate, onDelete }: { analysis: Analysis; onUpdate: (a: Analysis) => void; onDelete: () => void }) {
  const isDeal = (analysis.focus ?? "").includes("项目");
  const isCompany = (analysis.focus ?? "").includes("企业");
  // 洽谈清单收归到「洽谈中」一处（NegotiationDesk），调研前不再单开「洽谈清单」tab。
  const PHASE_TABS: Record<Stage, { key: string; label: string }[]> = {
    调研前: [{ key: "deep", label: "深度分析" }],
    洽谈中: [{ key: "desk", label: "对照问题 · 记录 · 导入" }],
    洽谈后: [{ key: "report", label: "项目报告 · 定调" }],
  };
  const [phase, setPhase] = useState<Stage>(analysis.stage);
  const [tab, setTab] = useState<string>(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return t && PHASE_TABS[analysis.stage].some((x) => x.key === t) ? t : PHASE_TABS[analysis.stage][0].key;
  });
  const [notes, setNotes] = useState("");

  // #2 可编辑分析：订阅 run 拿本单资料（materials/attachments/洽谈清单），编辑基础信息 + 资料后可仅保存或重跑
  const run = useSyncExternalStore(
    useCallback((cb: () => void) => subscribe(analysis.id, cb), [analysis.id]),
    useCallback(() => getRun(analysis.id), [analysis.id]),
  );
  // 洽谈清单从落盘的 run 读（按项目持久化，切走再切回不丢）；run 里没有则用前提假设种子。
  const questions = run.questions.length ? run.questions : seedQuestions(analysis);
  const [editing, setEditing] = useState(false);
  const [eName, setEName] = useState(analysis.name);
  const [eIndustry, setEIndustry] = useState(analysis.industry);
  const [eCompany, setECompany] = useState(analysis.company ?? "");
  const [eCounterparty, setECounterparty] = useState(analysis.counterparty ?? "");

  const openEdit = () => {
    setEName(analysis.name); setEIndustry(analysis.industry);
    setECompany(analysis.company ?? ""); setECounterparty(analysis.counterparty ?? "");
    setEditing(true);
  };
  const saveEdit = (rerun: boolean) => {
    const updated: Analysis = {
      ...analysis,
      name: eName.trim() || analysis.name,
      industry: eIndustry.trim(),
      company: isCompany ? (eCompany.trim() || undefined) : analysis.company,
      counterparty: isDeal ? (eCounterparty.trim() || undefined) : analysis.counterparty,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    onUpdate(updated);
    setEditing(false);
    if (rerun) {
      void startRun(analysis.id, { industry: updated.industry, ourRole: updated.ourRole, focus: updated.focus ?? "行业深度分析", company: updated.company, counterparty: updated.counterparty });
      setPhase("调研前"); setTab("deep");
    }
  };

  // 点主轴任一段＝把本单「状态」推进到该阶段：本地视图切换 + 落盘 analysis.stage，
  // 让侧栏、总览「阶段分布 / 卡片状态」、工作区头部「当前：」四处同步。
  const pickPhase = (s: Stage) => {
    setPhase(s); setTab(PHASE_TABS[s][0].key);
    if (s !== analysis.stage) onUpdate({ ...analysis, stage: s, updatedAt: new Date().toISOString().slice(0, 10) });
  };
  const tabs = PHASE_TABS[phase];

  return (
    <div className="pw">
      <div className="pw-head">
        <div>
          <h2>{analysis.name}</h2>
          <div className="pw-meta">
            {analysis.ourRole && <span className="role-badge">我方：{analysis.ourRole}</span>}
            {analysis.company && <span className="ind-badge">企业：{analysis.company}</span>}
            {analysis.industry && <span className="ind-badge">{analysis.industry}</span>}
            {analysis.counterparty && <span className="ind-badge">对方：{analysis.counterparty}</span>}
            {analysis.focus && <span className="ind-badge">类型：{analysis.focus}</span>}
            <span className={"st-chip " + STAGE_CLASS[analysis.stage]}>当前：{analysis.stage}</span>
          </div>
        </div>
        {!editing && (
          <div className="pw-head-btns">
            <button type="button" className="app-btn ghost dark" onClick={openEdit}>编辑基础信息 / 资料</button>
            <button type="button" className="app-btn ghost pw-del" title="删除该分析" onClick={onDelete}>删除</button>
          </div>
        )}
      </div>

      {editing && (
        <div className="dash pw-edit">
          <div className="sec-head">编辑分析（类型「{analysis.focus}」不可改；改完可仅保存，或保存并重新生成）</div>
          <label className="fld"><span>分析名称</span>
            <input className="key-input wide" value={eName} onChange={(e) => setEName(e.target.value)} />
          </label>
          {isCompany && (
            <label className="fld"><span>企业名称</span>
              <input className="key-input wide" value={eCompany} onChange={(e) => setECompany(e.target.value)} />
            </label>
          )}
          <label className="fld"><span>行业{isCompany ? "（选填）" : ""}</span>
            <input className="key-input wide" value={eIndustry} onChange={(e) => setEIndustry(e.target.value)} />
          </label>
          {isDeal && (
            <label className="fld"><span>对方 / 对手方</span>
              <input className="key-input wide" value={eCounterparty} onChange={(e) => setECounterparty(e.target.value)} />
            </label>
          )}
          <div className="fld"><span>本单资料（信息补充 · 从信息源获取的研报 / 正文也在这里）</span>
            <MaterialsInput
              materials={run.materials} onMaterials={(v) => setMaterials(analysis.id, v)}
              attachments={run.attachments}
              onAdd={(a) => addAttachment(analysis.id, a)}
              onRemove={(n) => removeAttachment(analysis.id, n)}
            />
          </div>
          <div className="na-actions">
            <button type="button" className="app-btn" onClick={() => saveEdit(true)}>保存并重新生成 →</button>
            <button type="button" className="app-btn ghost" onClick={() => saveEdit(false)}>仅保存</button>
            <button type="button" className="app-btn ghost dark" onClick={() => setEditing(false)}>取消</button>
          </div>
        </div>
      )}

      <PhaseRail current={phase} onPick={pickPhase} />

      <div className="pw-tabs">
        {tabs.map((t) => (
          <button key={t.key} type="button" className={"pw-tab" + (tab === t.key ? " on" : "")} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="pw-body">
        {phase === "调研前" && tab === "deep" && (
          <ReportProgress analysis={analysis} />
        )}
        {phase === "洽谈中" && tab === "desk" && (
          <div className="dash">
            <NegotiationDesk analysis={analysis} questions={questions} onQuestions={(next) => setAnalysisQuestions(analysis.id, next)} notes={notes} onNotes={setNotes} />
          </div>
        )}
        {phase === "洽谈后" && tab === "report" && (
          <div className="dash"><ProjectReport analysis={analysis} /></div>
        )}
      </div>
    </div>
  );
}
