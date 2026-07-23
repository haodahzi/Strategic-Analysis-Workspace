import { useState } from "react";
import { Analysis, QItem, Stage } from "../types";
import PhaseRail from "./PhaseRail";
import Step0 from "./Step0";
import TwoAxisBoard from "./TwoAxisBoard";
import ReportProgress from "./ReportProgress";
import QuestionList from "./QuestionList";
import MeetingNotes from "./MeetingNotes";
import ProjectReport from "./ProjectReport";

const STAGE_CLASS: Record<Stage, string> = { 定框: "st-def", 调研前: "st-pre", 洽谈中: "st-neg", 洽谈后: "st-post" };

const PHASE_TABS: Record<Stage, { key: string; label: string }[]> = {
  定框: [{ key: "step0", label: "Step 0 定框" }],
  调研前: [
    { key: "board", label: "两轴总览" },
    { key: "deep", label: "深度分析（多智能体）" },
    { key: "questions", label: "洽谈重点清单" },
  ],
  洽谈中: [
    { key: "notes", label: "洽谈记录" },
    { key: "check", label: "问题核对清单" },
  ],
  洽谈后: [{ key: "report", label: "项目报告 · 定调" }],
};

function seedQuestions(a: Analysis): QItem[] {
  return (a.premises ?? []).map((p, i) => ({
    id: "q-seed-" + i,
    text: p.text,
    intent: p.dimension === "对方画像" ? "要问对方" : "要查",
    dealBreaker: p.dealBreaker,
  }));
}

export default function ProjectWorkspace({ analysis }: { analysis: Analysis }) {
  const [phase, setPhase] = useState<Stage>(analysis.stage);
  const [tab, setTab] = useState<string>(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return t && PHASE_TABS[analysis.stage].some((x) => x.key === t) ? t : PHASE_TABS[analysis.stage][0].key;
  });
  const [questions, setQuestions] = useState<QItem[]>(() => seedQuestions(analysis));
  const [notes, setNotes] = useState("");

  const pickPhase = (s: Stage) => { setPhase(s); setTab(PHASE_TABS[s][0].key); };
  const tabs = PHASE_TABS[phase];

  return (
    <div className="pw">
      <div className="pw-head">
        <div>
          <h2>{analysis.name}</h2>
          <div className="pw-meta">
            <span className="role-badge">我方：{analysis.ourRole}</span>
            <span className="ind-badge">{analysis.industry}</span>
            {analysis.focus && <span className="ind-badge">重点：{analysis.focus}</span>}
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
        {phase === "定框" && tab === "step0" && (
          <Step0 analysis={analysis} onBack={() => pickPhase("调研前")} />
        )}
        {phase === "调研前" && tab === "board" && <TwoAxisBoard project={analysis} />}
        {phase === "调研前" && tab === "deep" && (
          <ReportProgress analysis={analysis} onBack={() => setTab("board")} />
        )}
        {phase === "调研前" && tab === "questions" && (
          <div className="dash"><QuestionList items={questions} onChange={setQuestions} mode="编辑" /></div>
        )}
        {phase === "洽谈中" && tab === "notes" && (
          <div className="dash"><MeetingNotes analysis={analysis} notes={notes} onNotes={setNotes} /></div>
        )}
        {phase === "洽谈中" && tab === "check" && (
          <div className="dash"><QuestionList items={questions} onChange={setQuestions} mode="核对" /></div>
        )}
        {phase === "洽谈后" && tab === "report" && (
          <div className="dash"><ProjectReport analysis={analysis} /></div>
        )}
      </div>
    </div>
  );
}
