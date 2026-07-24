import { useState } from "react";
import { AGENT_ROLES, AppConfig, ModelPick, ProviderId } from "../llm/types";
import { applyMainProvider, loadConfig, providerById, saveConfig } from "../config/store";
import { makeClient } from "../llm/adapters";
import { getLlmFetch } from "../llm/runtime";

export default function Settings() {
  const [cfg, setCfg] = useState<AppConfig>(() => loadConfig());
  const [check, setCheck] = useState<string>("");
  const commit = (next: AppConfig) => { setCfg(next); saveConfig(next); };

  const active = cfg.defaultProvider;
  const activeP = providerById(cfg, active);

  const patch = (p: Partial<{ apiKey: string; baseUrl: string; models: string[] }>) =>
    commit({ ...cfg, providers: cfg.providers.map((x) => (x.id === active ? { ...x, ...p } : x)) });

  const selectProvider = (id: ProviderId) => { commit(applyMainProvider(cfg, id)); setCheck(""); };

  const selfCheck = async () => {
    setCheck("检测中…");
    try {
      await makeClient(activeP, await getLlmFetch()).send({ model: activeP.models[0] ?? "", messages: [{ role: "user", content: "回复 OK" }], maxTokens: 5 });
      setCheck("✓ 连通");
    } catch (e) { setCheck("✗ " + (e as Error).message.slice(0, 70)); }
  };
  const chkClass = "chk-res " + (check.startsWith("✓") ? "ok" : check.startsWith("✗") ? "bad" : "");

  // provider + model 双下拉行
  const modelRow = (label: string, pick: ModelPick, onChange: (v: ModelPick) => void) => {
    const prov = providerById(cfg, pick.provider);
    return (
      <tr key={label}>
        <td className="mx-dim">{label}</td>
        <td>
          <select value={pick.provider} onChange={(e) => { const provider = e.target.value as ProviderId; onChange({ provider, model: providerById(cfg, provider).models[0] ?? "" }); }}>
            {cfg.providers.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
          </select>
        </td>
        <td>
          <select value={pick.model} onChange={(e) => onChange({ ...pick, model: e.target.value })}>
            {prov.models.map((m) => (<option key={m} value={m}>{m}</option>))}
          </select>
        </td>
      </tr>
    );
  };

  return (
    <div className="dash">
      <div className="dash-head">
        <h2>设置</h2>
      </div>

      <div className="sec-head">主用提供商（填 Key 即用）</div>
      <div className="set-row">
        <select className="set-select" value={active} onChange={(e) => selectProvider(e.target.value as ProviderId)}>
          {cfg.providers.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
        </select>
        <span className="prov-style">{activeP.style === "anthropic" ? "Anthropic" : "OpenAI 兼容"}</span>
        <span className={"key-status " + (activeP.id === "mock" ? "na" : activeP.apiKey ? "ok" : "none")}>
          {activeP.id === "mock" ? "无需 Key（演示）" : activeP.apiKey ? "● Key 已存本机" : "○ 未配置 Key"}
        </span>
        <div className="spacer" />
        <span className={chkClass}>{check}</span>
        <button type="button" className="app-btn ghost dark" onClick={selfCheck} disabled={active !== "mock" && !activeP.apiKey}>连通性自检</button>
      </div>
      {active !== "mock" && (
        <div className="prov-fields-col">
          <label className="fld"><span>API Key</span>
            <input className="key-input wide" type="password" placeholder="填入 API Key…" value={activeP.apiKey ?? ""} onChange={(e) => patch({ apiKey: e.target.value })} />
            <div className="key-persist">
              {activeP.apiKey ? (
                <>🔒 已存本机、下次打开自动带出（仅本地，不上传、不入库）
                  <button type="button" className="key-clear" onClick={() => patch({ apiKey: "" })}>清除</button>
                </>
              ) : "填入后即自动保存到本机浏览器；桌面版将改存系统钥匙库（加密）。"}
            </div>
          </label>
          <label className="fld"><span>Base URL</span>
            <input className="key-input wide" value={activeP.baseUrl} onChange={(e) => patch({ baseUrl: e.target.value })} />
          </label>
          <label className="fld"><span>模型列表（逗号分隔）</span>
            <input className="key-input wide" value={activeP.models.join(", ")} onChange={(e) => patch({ models: e.target.value.split(/[,，、]+/).map((s) => s.trim()).filter(Boolean) })} />
          </label>
        </div>
      )}

      <div className="sec-head">定框 · 模型</div>
      <div className="tw">
        <table className="matrix">
          <thead><tr><th className="mx-dim">环节</th><th>提供商</th><th>模型</th></tr></thead>
          <tbody>{modelRow("定框（Step 0）", cfg.step0, (v) => commit({ ...cfg, step0: v }))}</tbody>
        </table>
      </div>

      <div className="sec-head">多智能体子任务 · 模型（红队宜换一款，互查更狠）</div>
      <div className="tw">
        <table className="matrix">
          <thead><tr><th className="mx-dim">子任务</th><th>提供商</th><th>模型</th></tr></thead>
          <tbody>
            {AGENT_ROLES.map((a) => modelRow(a, cfg.agents[a], (v) => commit({ ...cfg, agents: { ...cfg.agents, [a]: v } })))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
