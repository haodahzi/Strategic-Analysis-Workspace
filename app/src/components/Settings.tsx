import { useState } from "react";
import { AppConfig, LLM_STAGES, ProviderId } from "../llm/types";
import { loadConfig, providerById, saveConfig } from "../config/store";
import { makeClient } from "../llm/adapters";

// 硬结构化步骤：推荐 Claude（原生结构化输出），但也支持其他模型（JSON mode + 本地校验重试）。
const STRUCTURED = new Set<string>(["前提假设映射", "四流抽取"]);

export default function Settings() {
  const [cfg, setCfg] = useState<AppConfig>(() => loadConfig());
  const [editing, setEditing] = useState<ProviderId>("claude");
  const [checks, setChecks] = useState<Record<string, string>>({});
  const commit = (next: AppConfig) => { setCfg(next); saveConfig(next); };
  const patch = (id: ProviderId, p: Partial<{ apiKey: string; baseUrl: string; models: string[] }>) =>
    commit({ ...cfg, providers: cfg.providers.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const editP = providerById(cfg, editing);

  const selfCheck = async (id: ProviderId) => {
    const p = providerById(cfg, id);
    setChecks((c) => ({ ...c, [id]: "检测中…" }));
    try {
      await makeClient(p).send({ model: p.models[0] ?? "", messages: [{ role: "user", content: "回复 OK" }], maxTokens: 5 });
      setChecks((c) => ({ ...c, [id]: "✓ 连通" }));
    } catch (e) {
      setChecks((c) => ({ ...c, [id]: "✗ " + (e as Error).message.slice(0, 70) }));
    }
  };
  const chkClass = (v?: string) => "chk-res " + (v?.startsWith("✓") ? "ok" : v?.startsWith("✗") ? "bad" : "");

  return (
    <div className="dash">
      <div className="dash-head">
        <h2>设置 · 多模型（填 Key 即用）</h2>
        <div className="dash-sub">先选提供商再填其配置；可按阶段选模型。Key 本地保存（第二段改存 OS 密钥库、不入库）。</div>
      </div>

      <div className="sec-head">默认提供商</div>
      <div className="set-row">
        <select className="set-select" value={cfg.defaultProvider} onChange={(e) => commit({ ...cfg, defaultProvider: e.target.value as ProviderId })}>
          {cfg.providers.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
        </select>
        <span className="set-hint">未配置 Key 的提供商，请先在下方填好再选用。</span>
      </div>

      <div className="sec-head">配置提供商</div>
      <div className="set-row">
        <select className="set-select" value={editing} onChange={(e) => setEditing(e.target.value as ProviderId)}>
          {cfg.providers.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
        </select>
        <span className="prov-style">{editP.style === "anthropic" ? "Anthropic" : "OpenAI 兼容"}</span>
        <span className={"key-status " + (editP.id === "mock" ? "na" : editP.apiKey ? "ok" : "none")}>
          {editP.id === "mock" ? "无需 Key" : editP.apiKey ? "● 已配置 Key" : "○ 未配置 Key"}
        </span>
        <div className="spacer" />
        <span className={chkClass(checks[editing])}>{checks[editing] ?? ""}</span>
        <button type="button" className="app-btn ghost dark" onClick={() => selfCheck(editing)} disabled={editing !== "mock" && !editP.apiKey}>连通性自检</button>
      </div>
      {editing !== "mock" && (
        <div className="prov-fields-col">
          <label className="fld"><span>API Key</span>
            <input className="key-input wide" type="password" placeholder="填入 API Key…" value={editP.apiKey ?? ""} onChange={(e) => patch(editing, { apiKey: e.target.value })} />
          </label>
          <label className="fld"><span>Base URL</span>
            <input className="key-input wide" value={editP.baseUrl} onChange={(e) => patch(editing, { baseUrl: e.target.value })} />
          </label>
          <label className="fld"><span>模型列表（逗号分隔）</span>
            <input className="key-input wide" value={editP.models.join(", ")} onChange={(e) => patch(editing, { models: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
          </label>
        </div>
      )}

      <div className="sec-head">按阶段选模型</div>
      <div className="tw">
        <table className="matrix">
          <thead><tr><th className="mx-dim">阶段</th><th>提供商</th><th>模型</th></tr></thead>
          <tbody>
            {LLM_STAGES.map((s) => {
              const r = cfg.routing[s];
              const prov = providerById(cfg, r.provider);
              return (
                <tr key={s}>
                  <td className="mx-dim">{s}{STRUCTURED.has(s) && <span className="stg-tag">结构化</span>}</td>
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
      <div className="board-note" style={{ marginTop: 16 }}>
        <strong>四流抽取、前提假设映射</strong> 标「结构化」：推荐 Claude（原生结构化输出），但<strong>同样支持其他大模型</strong>——非严格结构化的模型自动走 JSON mode + 本地 schema 校验与重试。配置自动本地保存。
      </div>
    </div>
  );
}
