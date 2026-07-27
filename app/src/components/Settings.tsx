import { useState } from "react";
import { AGENT_ROLES, AppConfig, ModelPick, ProviderConfig, ProviderId } from "../llm/types";
import { applyMainProvider, loadConfig, providerById, saveConfig } from "../config/store";
import { makeClient } from "../llm/adapters";
import { getLlmFetch } from "../llm/runtime";

export default function Settings() {
  const [cfg, setCfg] = useState<AppConfig>(() => loadConfig());
  const [check, setCheck] = useState<Record<string, string>>({});   // 每个提供商各自的自检结果
  const commit = (next: AppConfig) => { setCfg(next); saveConfig(next); };

  // 改某一个提供商的字段（各家可并存，多 Key #12）
  const patchProvider = (id: ProviderId, p: Partial<Pick<ProviderConfig, "apiKey" | "baseUrl" | "models">>) =>
    commit({ ...cfg, providers: cfg.providers.map((x) => (x.id === id ? { ...x, ...p } : x)) });

  const selfCheck = async (p: ProviderConfig) => {
    setCheck((c) => ({ ...c, [p.id]: "检测中…" }));
    try {
      await makeClient(p, await getLlmFetch()).send({ model: p.models[0] ?? "", messages: [{ role: "user", content: "回复 OK" }], maxTokens: 5 });
      setCheck((c) => ({ ...c, [p.id]: "✓ 连通" }));
    } catch (e) { setCheck((c) => ({ ...c, [p.id]: "✗ " + (e as Error).message.slice(0, 60) })); }
  };
  const chkClass = (s?: string) => "chk-res " + (s?.startsWith("✓") ? "ok" : s?.startsWith("✗") ? "bad" : "");

  // provider + model 双下拉行（子任务分模型）
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

  const realProviders = cfg.providers.filter((p) => p.id !== "mock");

  return (
    <div className="dash">
      <div className="dash-head">
        <h2>设置</h2>
      </div>

      <div className="sec-head">模型提供商 · 各家可并存（填了 Key 就能在下面按子任务选用）</div>
      <div className="set-hint" style={{ marginBottom: 12 }}>想让不同子任务用不同大模型：给相应提供商各自填好 Key，再到下方「子任务 · 分模型」分别指定即可。Key 仅存本机、不上传、不入库。</div>
      {realProviders.map((p) => (
        <div key={p.id} className="prov-card">
          <div className="prov-card-hd">
            <span className="prov-card-name">{p.label}</span>
            <span className="prov-style">{p.style === "anthropic" ? "Anthropic" : "OpenAI 兼容"}</span>
            <span className={"key-status " + (p.apiKey ? "ok" : "none")}>{p.apiKey ? "● Key 已存本机" : "○ 未配置 Key"}</span>
            <div className="spacer" />
            <span className={chkClass(check[p.id])}>{check[p.id] ?? ""}</span>
            <button type="button" className="app-btn ghost dark" disabled={!p.apiKey} onClick={() => void selfCheck(p)}>连通自检</button>
          </div>
          <label className="fld"><span>API Key</span>
            <input className="key-input wide" type="password" placeholder="填入 API Key…" value={p.apiKey ?? ""} onChange={(e) => patchProvider(p.id, { apiKey: e.target.value })} />
            {p.apiKey && <div className="key-persist">🔒 已存本机、下次自动带出（仅本地）<button type="button" className="key-clear" onClick={() => patchProvider(p.id, { apiKey: "" })}>清除</button></div>}
          </label>
          <div className="prov-two">
            <label className="fld"><span>Base URL</span>
              <input className="key-input wide" value={p.baseUrl} onChange={(e) => patchProvider(p.id, { baseUrl: e.target.value })} />
            </label>
            <label className="fld"><span>模型列表（逗号分隔）</span>
              <input className="key-input wide" value={p.models.join(", ")} onChange={(e) => patchProvider(p.id, { models: e.target.value.split(/[,，、]+/).map((s) => s.trim()).filter(Boolean) })} />
            </label>
          </div>
        </div>
      ))}

      <div className="sec-head">子任务 · 分模型（红队宜换一款 / 一家，互查更狠）</div>
      <div className="set-row" style={{ marginBottom: 8 }}>
        <span className="set-hint">快速把全部子任务切到某一家：</span>
        <select className="set-select" value={cfg.defaultProvider} onChange={(e) => commit(applyMainProvider(cfg, e.target.value as ProviderId))}>
          {cfg.providers.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
        </select>
      </div>
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
