import { useState } from "react";
import { analyses } from "./data/seed";
import { Analysis, Stage } from "./types";
import Dashboard from "./components/Dashboard";
import KnowledgeBase from "./components/KnowledgeBase";
import IndustryReport from "./components/IndustryReport";
import Settings from "./components/Settings";
import NewAnalysis from "./components/NewAnalysis";
import ProjectWorkspace from "./components/ProjectWorkspace";
import ReportLibrary from "./components/ReportLibrary";

type View = "dashboard" | "project" | "kb" | "settings" | "new" | "reports";

const STAGE_CLASS: Record<Stage, string> = {
  调研前: "st-pre", 洽谈中: "st-neg", 洽谈后: "st-post",
};

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const [view, setView] = useState<View>((params.get("view") as View) || "dashboard");
  const [pid, setPid] = useState(params.get("pid") || analyses[0].id);
  const [sampleOn, setSampleOn] = useState(params.get("report") === "1");
  const [items, setItems] = useState<Analysis[]>(analyses);

  const project = items.find((p) => p.id === pid) ?? items[0];
  const suanli = items.find((p) => p.hasIndustryReport) ?? items[0];

  const openProject = (id: string, rep = false) => {
    setPid(id);
    setSampleOn(rep);
    setView("project");
  };

  const createAnalysis = (a: Analysis) => {
    setItems((xs) => [a, ...xs]);
    setPid(a.id);
    setSampleOn(false);
    setView("project");
  };

  const navItem = (v: View, label: string) => (
    <button
      type="button"
      className={"nav-item" + (view === v ? " active" : "")}
      onClick={() => setView(v)}
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
            <div className="app-title">战略发展分析工作台</div>
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className="app-sidebar">
          <div className="nav-group">导航</div>
          {navItem("dashboard", "▤ 研究分析总览")}
          {navItem("new", "✚ 新建分析")}
          {navItem("reports", "▦ 报告库")}
          {navItem("kb", "▧ 交付物库")}
          {navItem("settings", "⚙ 设置")}

          <div className="nav-group">在办分析 · {items.length}</div>
          {items.map((p) => (
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
          {view === "dashboard" && <Dashboard items={items} onOpen={openProject} />}
          {view === "new" && <NewAnalysis onCreate={createAnalysis} onCancel={() => setView("dashboard")} />}
          {view === "project" && (sampleOn
            ? <IndustryReport project={project.hasIndustryReport ? project : suanli} onBack={() => setSampleOn(false)} />
            : <ProjectWorkspace analysis={project} />)}
          {view === "kb" && <KnowledgeBase onOpenSample={() => openProject(suanli.id, true)} />}
          {view === "reports" && <ReportLibrary />}
          {view === "settings" && <Settings />}
        </main>
      </div>
    </div>
  );
}
