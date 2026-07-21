import { useState } from "react";
import { projects } from "./data/seed";
import { sampleTx } from "./data/tx-sample";
import { Stage } from "./types";
import Dashboard from "./components/Dashboard";
import TwoAxisBoard from "./components/TwoAxisBoard";
import KnowledgeBase from "./components/KnowledgeBase";
import IndustryReport from "./components/IndustryReport";
import TxComplianceView from "./components/TxComplianceView";

type View = "dashboard" | "project" | "kb" | "settings";
type SubView = "board" | "report" | "tx";

const STAGE_CLASS: Record<Stage, string> = {
  定框: "st-def", 调研前: "st-pre", 洽谈中: "st-neg", 洽谈后: "st-post",
};

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const [view, setView] = useState<View>((params.get("view") as View) || "dashboard");
  const [pid, setPid] = useState(params.get("pid") || projects[0].id);
  const [sub, setSub] = useState<SubView>(
    (params.get("sub") as SubView) || (params.get("report") === "1" ? "report" : "board"),
  );

  const project = projects.find((p) => p.id === pid) ?? projects[0];
  const suanli = projects.find((p) => p.hasIndustryReport) ?? projects[0];

  const openProject = (id: string, rep = false) => {
    setPid(id);
    setSub(rep ? "report" : "board");
    setView("project");
  };

  const navItem = (v: View, label: string) => (
    <button
      type="button"
      className={"nav-item" + (view === v ? " active" : "")}
      onClick={() => { setView(v); setSub("board"); }}
    >
      {label}
    </button>
  );

  return (
    <div className="app-root">
      <header className="app-chrome">
        <div className="app-brand">
          <span className="app-logo">◆</span>
          <div>
            <div className="app-title">业务项目对接工作台</div>
            <div className="app-sub">决策副驾 · 洽谈+评估 · M1 Web 内核</div>
          </div>
        </div>
        <nav className="app-actions">
          <button type="button" className="app-btn">+ 新建项目</button>
          <button type="button" className="app-btn ghost" onClick={() => setView("settings")}>设置</button>
        </nav>
      </header>

      <div className="app-body">
        <aside className="app-sidebar">
          <div className="nav-group">导航</div>
          {navItem("dashboard", "▤ 项目总览")}
          {navItem("kb", "▧ 交付物库")}
          {navItem("settings", "⚙ 设置（多模型）")}

          <div className="nav-group">运行项目 · {projects.length}</div>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={"nav-proj" + (view === "project" && pid === p.id ? " active" : "")}
              onClick={() => openProject(p.id, false)}
            >
              <span className="nav-proj-name">{p.name}</span>
              <span className={"st-chip mini " + STAGE_CLASS[p.stage]}>{p.stage}</span>
            </button>
          ))}
        </aside>

        <main className="app-main">
          {view === "dashboard" && <Dashboard onOpen={openProject} />}
          {view === "project" && sub === "board" && (
            <TwoAxisBoard
              project={project}
              onOpenReport={() => setSub("report")}
              onOpenTx={() => setSub("tx")}
            />
          )}
          {view === "project" && sub === "report" && (
            <IndustryReport project={project.hasIndustryReport ? project : suanli} onBack={() => setSub("board")} />
          )}
          {view === "project" && sub === "tx" && (
            <TxComplianceView tx={sampleTx} project={project} onBack={() => setSub("board")} />
          )}
          {view === "kb" && <KnowledgeBase onOpenSample={() => openProject(suanli.id, true)} />}
          {view === "settings" && <SettingsStub />}
        </main>
      </div>
    </div>
  );
}

function SettingsStub() {
  const providers = [
    { name: "Claude (Anthropic)", note: "默认 · claude-opus-4-8 / claude-fable-5", on: true },
    { name: "GPT (OpenAI)", note: "OpenAI Chat Completions", on: false },
    { name: "DeepSeek", note: "OpenAI 兼容 · deepseek-chat / reasoner", on: false },
    { name: "智谱 GLM", note: "OpenAI 兼容 · glm-*", on: false },
    { name: "KIMI (Moonshot)", note: "OpenAI 兼容 · moonshot-*", on: false },
  ];
  return (
    <div className="dash">
      <div className="dash-head">
        <h2>设置 · 多模型（填 Key 即用）</h2>
        <div className="dash-sub">保留多提供商 API Key，可按阶段选模型；Key 存 OS 密钥库、不入库。（连通性自检为下一块）</div>
      </div>
      <div className="kb-list">
        {providers.map((p) => (
          <div key={p.name} className="kb-row">
            <div className="kb-row-main">
              <span className="kb-row-title">{p.name}</span>
              {p.on && <span className="kb-tag">默认</span>}
            </div>
            <div className="kb-row-r">
              <span className="kb-up">{p.note}</span>
              <input className="key-input" placeholder="填入 API Key…" disabled />
              <button type="button" className="app-btn ghost" disabled>连通性自检</button>
            </div>
          </div>
        ))}
      </div>
      <div className="board-note" style={{ marginTop: 18 }}>
        硬结构化步骤（四流抽取、前提假设映射）默认走 Claude 更稳；散文类阶段可自由选提供商。
      </div>
    </div>
  );
}
