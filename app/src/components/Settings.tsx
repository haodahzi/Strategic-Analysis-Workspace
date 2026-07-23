import { useState } from "react";
import { AppConfig, LLM_STAGES, ProviderId } from "../llm/types";
import { loadConfig, providerById, saveConfig } from "../config/store";
import { makeClient } from "../llm/adapters";

export default function Settings() {
  const [cfg, setCfg] = useState<AppConfig>(() => loadConfig());
  const [check, setCheck] = useState<string>("");
  const commit = (next: AppConfig) => { setCfg(next); saveConfig(next); };

  const active = cfg.defaultProvider;          // 主用提供商 = 正在配置的对象
  const activeP = providerById(cfg, active);

  const patch = (p: Partial<{ apiKey: string; baseUrl: string; models: string[] }>) =>
    commit({ ...cfg, providers: cfg.providers.map((x) => (x.id === active ? { ...x, ...p } : x)) });

  // 选主用提供商：设为默认，并把所有阶段一键填成它（个别阶段需要时在下方单独改）
  const selectProvider = (id: ProviderId) => {
    const model = providerById(cfg, id).models[0] ?? "";
    const routing = {} as AppConfig["routing"];
    for (const s of LLM_STAGES) routing[s] = { provider: id, model };
    commit({ ...cfg, defaultProvider: id, routing });
    setCheck("");
  };

  const selfCheck = async () => {
    setCheck("检测中…");
    try {
      await makeClient(activeP).send({ model: activeP.models[0] ?? "", messages: [{ role: "user", content: "回复 OK" }], maxTokens: 5 });
      setCheck("✓ 连通");
    } catch (e) { setCheck("✗ " + (e as Error).message.slice(0, 70)); }
  };
  const chkClass = "chk-res " + (check.startsWith("✓") ? "ok" : check.startsWith("✗") ? "bad" : "");

  return (
    <div className="dash">
      <div className="dash-head">
        <h2>设置</h2>
        <div className="dash-sub">选主用提供商、填 Key 即用；选定后所有分析阶段默认走它，个别阶段想换在下方单独改。Key 仅本地保存（第二段改存 OS 密钥库、不入库）。</div>
      </div>

      <div className="sec-head">主用提供商（填 Key 即用）</div>
      <div className="set-row">
        <select className="set-select" value={active} onChange={(e) => selectProvider(e.target.value as ProviderId)}>
          {cfg.providers.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
        </select>
        <span className="prov-style">{activeP.style === "anthropic" ? "Anthropic" : "OpenAI 兼容"}</span>
        <span className={"key-status " + (activeP.id === "mock" ? "na" : activeP.apiKey ? "ok" : "none")}>
          {activeP.id === "mock" ? "无需 Key（演示）" : activeP.apiKey ? "● 已配置 Key" : "○ 未配置 Key"}
        </span>
        <div className="spacer" />
        <span className={chkClass}>{check}</span>
        <button type="button" className="app-btn ghost dark" onClick={selfCheck} disabled={active !== "mock" && !activeP.apiKey}>连通性自检</button>
      </div>
      {active !== "mock" && (
        <div className="prov-fields-col">
          <label className="fld"><span>API Key</span>
            <input className="key-input wide" type="password" placeholder="填入 API Key…" value={activeP.apiKey ?? ""} onChange={(e) => patch({ apiKey: e.target.value })} />
          </label>
          <label className="fld"><span>Base URL</span>
            <input className="key-input wide" value={activeP.baseUrl} onChange={(e) => patch({ baseUrl: e.target.value })} />
          </label>
          <label className="fld"><span>模型列表（逗号分隔）</span>
            <input className="key-input wide" value={activeP.models.join(", ")} onChange={(e) => patch({ models: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
          </label>
        </div>
      )}

      <div className="sec-head">按阶段选模型（默认跟随主用提供商，个别要换才动）</div>
      <div className="tw">
        <table className="matrix">
          <thead><tr><th className="mx-dim">阶段</th><th>提供商</th><th>模型</th></tr></thead>
          <tbody>
            {LLM_STAGES.map((s) => {
              const r = cfg.routing[s];
              const prov = providerById(cfg, r.provider);
              return (
                <tr key={s}>
                  <td className="mx-dim">{s}</td>
                  <td>
                    <select value={r.provider} onChange={(e) => {
                      const provider = e.target.value as ProviderId;
                      const model = providerById(cfg, provider).models[0] ?? "";
                      commit({ ...cfg, routing: { ...cfg.routing, [s]: { provider, model } } });
                    }}>
                      {cfg.providers.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
                    </select>
                  </td>
                  <td>
                    <select value={r.model} onChange={(e) => commit({ ...cfg, routing: { ...cfg.routing, [s]: { ...r, model: e.target.value } } })}>
                      {prov.models.map((m) => (<option key={m} value={m}>{m}</option>))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
