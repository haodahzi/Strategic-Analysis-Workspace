import { useCallback, useState, useSyncExternalStore } from "react";
import { Analysis, QItem, Stage } from "../types";
import PhaseRail from "./PhaseRail";
import ReportProgress from "./ReportProgress";
import QuestionList from "./QuestionList";
import NegotiationDesk from "./NegotiationDesk";
import ProjectReport from "./ProjectReport";
import MaterialsInput from "./MaterialsInput";
import { generateChecklist } from "../llm/checklist";
import { addAttachment, getRun, removeAttachment, setMaterials, startRun, subscribe } from "../llm/pipelineStore";

const STAGE_CLASS: Record<Stage, string> = { 调研前: "st-pre", 洽谈中: "st-neg", 洽谈后: "st-post" };

function seedQuestions(a: Analysis): QItem[] {
  return (a.premises ?? []).map((p, i) => ({
    id: "q-seed-" + i,
    text: p.text,
    intent: p.dimension === "对方画像" ? "要问对方" : "要查",
    dealBreaker: p.dealBreaker,
  }));
}

export default function ProjectWorkspace({ analysis, onUpdate }: { analysis: Analysis; onUpdate: (a: Analysis) => void }) {
  const isDeal = (analysis.focus ?? "").includes("项目");
  const isCompany = (analysis.focus ?? "").includes("企业");
  // 洽谈清单只对项目分析有意义（#11）；两轴总览已删（#4）
  const PHASE_TABS: Record<Stage, { key: string; label: string }[]> = {
    调研前: isDeal
      ? [{ key: "deep", label: "深度分析" }, { key: "questions", label: "洽谈清单" }]
      : [{ key: "deep", label: "深度分析" }],
    洽谈中: [{ key: "desk", label: "对照问题 · 记录 · 导入" }],
    洽谈后: [{ key: "report", label: "项目报告 · 定调" }],
  };
  const [phase, setPhase] = useState<Stage>(analysis.stage);
  const [tab, setTab] = useState<string>(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return t && PHASE_TABS[analysis.stage].some((x) => x.key === t) ? t : PHASE_TABS[analysis.stage][0].key;
  });
  const [questions, setQuestions] = useState<QItem[]>(() => seedQuestions(analysis));
  const [notes, setNotes] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [genErr, setGenErr] = useState("");

  // #2 可编辑分析：订阅 run 拿本单资料（materials/attachments），编辑基础信息 + 资料后可仅保存或重跑
  const run = useSyncExternalStore(
    useCallback((cb: () => void) => subscribe(analysis.id, cb), [analysis.id]),
    useCallback(() => getRun(analysis.id), [analysis.id]),
  );
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

  const pickPhase = (s: Stage) => { setPhase(s); setTab(PHASE_TABS[s][0].key); };
  const tabs = PHASE_TABS[phase];

  const genChecklist = async () => {
    setGenLoading(true); setGenErr("");
    try {
      const input = {
        industry: analysis.industry, ourRole: analysis.ourRole, focus: analysis.focus ?? "行业深度分析",
        company: analysis.company, counterparty: analysis.counterparty,
      };
      const items = await generateChecklist(input, getRun(analysis.id).realReport ?? "");
      const now = Date.now().toString(36);
      const add: QItem[] = items.map((it, i) => ({ id: `q-gen-${now}-${i}`, text: it.text, intent: it.intent, dealBreaker: it.dealBreaker }));
      setQuestions((cur) => [...cur, ...add]);
    } catch (e) {
      setGenErr((e as Error).message.slice(0, 140));
    } finally {
      setGenLoading(false);
    }
  };

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
        {!editing && <button type="button" className="app-btn ghost dark" onClick={openEdit}>编辑基础信息 / 资料</button>}
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
          <ReportProgress analysis={analysis} onBack={isDeal ? () => setTab("questions") : undefined} />
        )}
        {phase === "调研前" && tab === "questions" && (
          <div className="dash">
            <QuestionList items={questions} onChange={setQuestions} mode="编辑" onGenerate={() => void genChecklist()} generating={genLoading} />
            {genErr && <div className="set-hint" style={{ color: "var(--danger,#c0392b)", marginTop: 8 }}>生成失败：{genErr}（可先到设置为「起草」配置真实模型，或手动加条目）</div>}
          </div>
        )}
        {phase === "洽谈中" && tab === "desk" && (
          <div className="dash">
            <NegotiationDesk analysis={analysis} questions={questions} onQuestions={setQuestions} notes={notes} onNotes={setNotes} />
          </div>
        )}
        {phase === "洽谈后" && tab === "report" && (
          <div className="dash"><ProjectReport analysis={analysis} /></div>
        )}
      </div>
    </div>
  );
}
