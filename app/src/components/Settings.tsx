import { useState } from "react";
import { AppConfig, LLM_STAGES, ProviderId } from "../llm/types";
import { loadConfig, providerById, saveConfig } from "../config/store";
import { makeClient } from "../llm/adapters";

export default function Settings() {
  const [cfg, setCfg] = useState<AppConfig>(() => loadConfig());
  const [checks, setChecks] = useState<Record<string, string>>({});
  const commit = (next: AppConfig) => { setCfg(next); saveConfig(next); };

  const patch = (id: ProviderId, p: Partial<{ apiKey: string; baseUrl: string; models: string[] }>) =>
    commit({ ...cfg, providers: cfg.providers.map((x) => (x.id === id ? { ...x, ...p } : x)) });

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
        <div className="dash-sub">多提供商 Key 本地保存（第二段改存 OS 密钥库、不入库）；可按阶段选模型。硬结构化步骤默认走 Claude 更稳。</div>
      </div>

      <div className="sec-head">提供商（勾选为默认）</div>
      <div className="prov-list">
        {cfg.providers.map((p) => (
          <div key={p.id} className="prov-card">
            <div className="prov-top">
              <label className="prov-name">
                <input type="radio" name="def" checked={cfg.defaultProvider === p.id} onChange={() => commit({ ...cfg, defaultProvider: p.id })} />
                {p.label}
                <span className="prov-style">{p.style === "anthropic" ? "Anthropic" : "OpenAI 兼容"}</span>
              </label>
              <div className="prov-check">
                <span className={chkClass(checks[p.id])}>{checks[p.id] ?? ""}</span>
                <button type="button" className="app-btn ghost dark" onClick={() => selfCheck(p.id)} disabled={p.id !== "mock" && !p.apiKey}>连通性自检</button>
              </div>
            </div>
            {p.id !== "mock" && (
              <div className="prov-fields">
                <input className="key-input wide" type="password" placeholder="API Key" value={p.apiKey ?? ""} onChange={(e) => patch(p.id, { apiKey: e.target.value })} />
                <input className="key-input wide" placeholder="Base URL" value={p.baseUrl} onChange={(e) => patch(p.id, { baseUrl: e.target.value })} />
                <input className="key-input wide" placeholder="模型（逗号分隔）" value={p.models.join(", ")} onChange={(e) => patch(p.id, { models: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              </div>
            )}
          </div>
        ))}
      </div>

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
      <div className="board-note" style={{ marginTop: 16 }}>
        建议：<strong>四流抽取、前提假设映射</strong>这类必须机器可解析的步骤默认走 Claude；散文类（行业分析、企业画像）可自由选。配置自动本地保存。
      </div>
    </div>
  );
}
