import { useEffect, useState, useSyncExternalStore } from "react";
import { Analysis, Stage } from "./types";
import { loadAnalyses, saveAnalyses } from "./data/analysesStore";
import Dashboard from "./components/Dashboard";
import IndustryReport from "./components/IndustryReport";
import Settings from "./components/Settings";
import NewAnalysis from "./components/NewAnalysis";
import ProjectWorkspace from "./components/ProjectWorkspace";
import ReportLibrary from "./components/ReportLibrary";
import { setMaterials, startRun } from "./llm/pipelineStore";
import { clearUnread, getUnread, subscribeUnread } from "./llm/unread";

type View = "dashboard" | "project" | "settings" | "new" | "reports";

const STAGE_CLASS: Record<Stage, string> = {
  调研前: "st-pre", 洽谈中: "st-neg", 洽谈后: "st-post",
};

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const initial = loadAnalyses();
  const [view, setView] = useState<View>((params.get("view") as View) || "dashboard");
  const [pid, setPid] = useState(params.get("pid") || initial[0]?.id || "");
  const [sampleOn, setSampleOn] = useState(params.get("report") === "1");
  const [items, setItems] = useState<Analysis[]>(initial);
  const unread = useSyncExternalStore(subscribeUnread, getUnread);

  // #9：在办分析持久化——任何变化即写本机，重启不丢
  useEffect(() => { saveAnalyses(items); }, [items]);

  const project = items.find((p) => p.id === pid) ?? items[0];
  const suanli = items.find((p) => p.hasIndustryReport) ?? items[0];

  const openProject = (id: string, rep = false) => {
    setPid(id);
    setSampleOn(rep);
    setView("project");
    clearUnread(id);   // #7：点开即消绿点
  };

  const createAnalysis = (a: Analysis, materials: string) => {
    setItems((xs) => [a, ...xs]);
    setPid(a.id);
    setSampleOn(false);
    setView("project");
    // #3：建好即开始生成——喂入本单资料并直接启动流水线，不再二次点击
    if (materials) setMaterials(a.id, materials);
    void startRun(a.id, {
      industry: a.industry, ourRole: a.ourRole, focus: a.focus ?? "行业深度分析",
      company: a.company, counterparty: a.counterparty,
    });
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
          {navItem("settings", "⚙ 设置")}

          <div className="nav-group">在办分析 · {items.length}</div>
          {items.map((p) => (
            <button
              key={p.id}
              type="button"
              className={"nav-proj" + (view === "project" && pid === p.id ? " active" : "")}
              onClick={() => openProject(p.id, false)}
            >
              {unread.has(p.id) && <span className="nav-dot" title="已完成 · 未读" />}
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
          {view === "reports" && <ReportLibrary />}
          {view === "settings" && <Settings />}
        </main>
      </div>
    </div>
  );
}
