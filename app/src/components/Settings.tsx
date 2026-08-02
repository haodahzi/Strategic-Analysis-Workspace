import { useState } from "react";
import { AGENT_ROLES, AppConfig, ModelPick, ProviderConfig, ProviderId, SearchConfig } from "../llm/types";
import { applyMainProvider, loadConfig, providerById, saveConfig } from "../config/store";
import { makeClient } from "../llm/adapters";
import { getLlmFetch } from "../llm/runtime";
import { SEARCH_ENDPOINTS, webSearch } from "../llm/search";

export default function Settings() {
  const [cfg, setCfg] = useState<AppConfig>(() => loadConfig());
  const [check, setCheck] = useState<Record<string, string>>({});   // 每个提供商各自的自检结果
  const [searchChk, setSearchChk] = useState("");
  const commit = (next: AppConfig) => { setCfg(next); saveConfig(next); };

  const patchSearch = (p: Partial<SearchConfig>) => commit({ ...cfg, search: { ...cfg.search, ...p } });
  const searchSelfCheck = async () => {
    setSearchChk("检测中…");
    try { const hits = await webSearch(cfg, "测试 test"); setSearchChk(`✓ 通 · 取回 ${hits.length} 条`); }
    catch (e) { setSearchChk("✗ " + (e as Error).message.slice(0, 60)); }
  };

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

      <div className="sec-head">联网检索（可选 · 为报告接地、给真实引用来源）</div>
      <div className="set-hint" style={{ marginBottom: 12 }}>配一个搜索 API（博查 Bocha：api.bocha.cn；或 Tavily）后，生成报告时会自动联网检索、据实写作、文末附参考文献；不配则仅用模型知识 + 你上传的材料。切换提供商会自动带出对应 EndPoint。Key 仅存本机。</div>
      <div className="prov-card">
        <div className="prov-card-hd">
          <select className="set-select" value={cfg.search.provider} onChange={(e) => { const provider = e.target.value as SearchConfig["provider"]; patchSearch({ provider, baseUrl: SEARCH_ENDPOINTS[provider] || cfg.search.baseUrl }); }}>
            <option value="none">不联网</option>
            <option value="bocha">博查 Bocha</option>
            <option value="tavily">Tavily</option>
          </select>
          <span className={"key-status " + (cfg.search.provider === "none" ? "na" : cfg.search.apiKey ? "ok" : "none")}>
            {cfg.search.provider === "none" ? "已关闭" : cfg.search.apiKey ? "● Key 已存本机" : "○ 未配置 Key"}
          </span>
          <div className="spacer" />
          <span className={chkClass(searchChk)}>{searchChk}</span>
          <button type="button" className="app-btn ghost dark" disabled={cfg.search.provider === "none" || !cfg.search.apiKey} onClick={() => void searchSelfCheck()}>检索自检</button>
        </div>
        {cfg.search.provider !== "none" && (
          <>
            <label className="fld"><span>搜索 API Key</span>
              <input className="key-input wide" type="password" placeholder="填入搜索 API Key…" value={cfg.search.apiKey ?? ""} onChange={(e) => patchSearch({ apiKey: e.target.value })} />
            </label>
            <div className="prov-two">
              <label className="fld"><span>Base URL</span>
                <input className="key-input wide" value={cfg.search.baseUrl} onChange={(e) => patchSearch({ baseUrl: e.target.value })} />
              </label>
              <label className="fld"><span>每条查询取回条数（博查最高 50）</span>
                <input className="key-input wide" type="number" min={1} max={50} value={cfg.search.maxResults} onChange={(e) => patchSearch({ maxResults: Math.max(1, Math.min(50, Number(e.target.value) || 10)) })} />
              </label>
            </div>
          </>
        )}
      </div>

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

      <div className="sec-head">文档视觉模型（可选 · 扫描件 / 复杂表格用）</div>
      <div className="set-hint" style={{ marginBottom: 8 }}>选一个带视觉的模型（通义 Qwen-VL、智谱 GLM-4V、GPT-4o、Claude 等）。上传扫描件 / 图片版 PDF 会自动「看图读」，数字版仍走便宜的文本提取。发图较慢较贵，只对需要的页用。</div>
      <div className="tw">
        <table className="matrix">
          <thead><tr><th className="mx-dim">用途</th><th>提供商</th><th>模型</th></tr></thead>
          <tbody>{modelRow("文档视觉", cfg.vision, (v) => commit({ ...cfg, vision: v }))}</tbody>
        </table>
      </div>
    </div>
  );
}
