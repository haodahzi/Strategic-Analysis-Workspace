import { useEffect, useState, useSyncExternalStore } from "react";
import { Analysis, Stage } from "./types";
import { loadAnalysesAsync, saveAnalysesAsync } from "./data/analysesStore";
import Dashboard from "./components/Dashboard";
import IndustryReport from "./components/IndustryReport";
import Settings from "./components/Settings";
import NewAnalysis from "./components/NewAnalysis";
import ProjectWorkspace from "./components/ProjectWorkspace";
import ReportLibrary from "./components/ReportLibrary";
import { deleteRun, hydrateRuns, setMaterials, startRun } from "./llm/pipelineStore";
import { clearUnread, getUnread, subscribeUnread } from "./llm/unread";
import { IntelligenceFeature } from "./features/intelligence";

type View = "dashboard" | "project" | "settings" | "new" | "reports" | "intelligence";

const STAGE_CLASS: Record<Stage, string> = {
  调研前: "st-pre", 洽谈中: "st-neg", 洽谈后: "st-post",
};

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const [view, setView] = useState<View>((params.get("view") as View) || "dashboard");
  const [pid, setPid] = useState(params.get("pid") || "");
  const [sampleOn, setSampleOn] = useState(params.get("report") === "1");
  const [items, setItems] = useState<Analysis[] | null>(null);   // null = 加载中（先回灌落盘数据再渲染）
  const unread = useSyncExternalStore(subscribeUnread, getUnread);

  // #9：启动时回灌落盘数据——先把生成状态（材料/附件/报告正文）填回内存，再加载在办分析列表
  useEffect(() => {
    let alive = true;
    void (async () => {
      await hydrateRuns();
      const a = await loadAnalysesAsync();
      if (!alive) return;
      setItems(a);
      setPid((cur) => cur || a[0]?.id || "");
    })();
    return () => { alive = false; };
  }, []);

  // 在办分析变化即落盘（桌面 app_data_dir，网页 localStorage），重启不丢
  useEffect(() => { if (items) void saveAnalysesAsync(items); }, [items]);

  const list = items ?? [];
  const project = list.find((p) => p.id === pid) ?? list[0];
  const suanli = list.find((p) => p.hasIndustryReport) ?? list[0];

  const openProject = (id: string, rep = false) => {
    setPid(id);
    setSampleOn(rep);
    setView("project");
    clearUnread(id);   // #7：点开即消绿点
  };

  // #2：编辑分析基础信息后更新并持久化（useEffect 会把 items 存本机）
  const updateAnalysis = (a: Analysis) => setItems((xs) => (xs ?? []).map((x) => (x.id === a.id ? a : x)));

  // 删除一份在办分析：清列表 + 清生成状态；若删的是当前项，切到下一份或回总览。已存报告库的成品保留。
  const deleteAnalysis = (id: string) => {
    const a = list.find((x) => x.id === id);
    if (!window.confirm(`删除「${a?.name ?? "该分析"}」？此操作不可撤销，该分析的生成内容会一并清除（已存入报告库的成品保留）。`)) return;
    const rest = list.filter((x) => x.id !== id);
    setItems(rest);
    deleteRun(id);
    clearUnread(id);
    if (pid === id) { setPid(rest[0]?.id ?? ""); setView(rest.length ? "project" : "dashboard"); }
  };

  const createAnalysis = (a: Analysis, materials: string) => {
    setItems((xs) => [a, ...(xs ?? [])]);
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
          {navItem("intelligence", "◉ 对标企业情报")}
          {navItem("settings", "⚙ 设置")}

          <div className="nav-group">在办分析 · {list.length}</div>
          {list.map((p) => (
            <div key={p.id} className="nav-proj-row">
              <button
                type="button"
                className={"nav-proj" + (view === "project" && pid === p.id ? " active" : "")}
                onClick={() => openProject(p.id, false)}
              >
                {unread.has(p.id) && <span className="nav-dot" title="已完成 · 未读" />}
                <span className="nav-proj-name">{p.name}</span>
                <span className={"st-chip mini " + STAGE_CLASS[p.stage]}>{p.stage}</span>
              </button>
              <button type="button" className="nav-proj-del" title="删除该分析" onClick={() => deleteAnalysis(p.id)}>×</button>
            </div>
          ))}
        </aside>

        <main className="app-main">
          {items === null && <div className="dash"><div className="set-hint">正在载入本机数据…</div></div>}
          {items !== null && view === "dashboard" && <Dashboard items={list} onOpen={openProject} onOpenReports={() => setView("reports")} />}
          {items !== null && view === "new" && <NewAnalysis onCreate={createAnalysis} onCancel={() => setView("dashboard")} />}
          {items !== null && view === "project" && (
            !project
              ? <div className="dash"><div className="set-hint">还没有在办分析，点左侧「✚ 新建分析」开始。</div></div>
              : sampleOn
                ? <IndustryReport project={project.hasIndustryReport ? project : suanli} onBack={() => setSampleOn(false)} />
                // key={project.id}：换项目即重挂载，避免洽谈清单 / 记录 / phase 等本地状态串到别的项目
                : <ProjectWorkspace key={project.id} analysis={project} onUpdate={updateAnalysis} onDelete={() => deleteAnalysis(project.id)} />
          )}
          {items !== null && view === "reports" && <ReportLibrary />}
          {items !== null && view === "intelligence" && <IntelligenceFeature status="initializing" onRetry={() => undefined} />}
          {items !== null && view === "settings" && <Settings />}
        </main>
      </div>
    </div>
  );
}
