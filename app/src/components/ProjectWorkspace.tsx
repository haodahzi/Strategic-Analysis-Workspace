import { useState } from "react";
import { Analysis, QItem, Stage } from "../types";
import PhaseRail from "./PhaseRail";
import ReportProgress from "./ReportProgress";
import QuestionList from "./QuestionList";
import NegotiationDesk from "./NegotiationDesk";
import ProjectReport from "./ProjectReport";
import { generateChecklist } from "../llm/checklist";
import { getRun } from "../llm/pipelineStore";

const STAGE_CLASS: Record<Stage, string> = { 调研前: "st-pre", 洽谈中: "st-neg", 洽谈后: "st-post" };

function seedQuestions(a: Analysis): QItem[] {
  return (a.premises ?? []).map((p, i) => ({
    id: "q-seed-" + i,
    text: p.text,
    intent: p.dimension === "对方画像" ? "要问对方" : "要查",
    dealBreaker: p.dealBreaker,
  }));
}

export default function ProjectWorkspace({ analysis }: { analysis: Analysis }) {
  const isDeal = (analysis.focus ?? "").includes("项目");
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
      </div>

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
