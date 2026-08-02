import { AGENT_ROLES, AgentRole, AppConfig, DataSourceCfg, ModelPick, ProviderConfig, ProviderId } from "../llm/types";
import { DEFAULT_PROVIDERS } from "../llm/providers";
import { DATA_SOURCES } from "../sources/registry";

const KEY = "dw.config.v1";              // 保持同一 key：升级到 step0/agents 结构时 apiKey 不丢
const MOCK: ModelPick = { provider: "mock", model: "mock-1" };

// 内置数据源默认全部启用（在「从信息源获取」里可见）；API Key 留空、由用户按需填。
function defaultDataSources(): DataSourceCfg[] {
  return DATA_SOURCES.map((s) => ({ id: s.id, enabled: true }));
}

export function defaultConfig(): AppConfig {
  const providers: ProviderConfig[] = Object.values(DEFAULT_PROVIDERS).map((p) => ({ ...p }));
  const agents = {} as Record<AgentRole, ModelPick>;
  for (const a of AGENT_ROLES) agents[a] = { ...MOCK };
  return {
    providers, defaultProvider: "mock", step0: { ...MOCK }, agents,
    search: { provider: "none", baseUrl: "https://api.tavily.com/search", maxResults: 10, preferDomains: [], freshness: "noLimit" },
    vision: { ...MOCK },
    dataSources: defaultDataSources(),
  };
}

export function loadConfig(): AppConfig {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return defaultConfig();
    const saved = JSON.parse(raw) as Partial<AppConfig>;
    const base = defaultConfig();
    // 以默认 provider 定义为准，套用已保存的 key/baseUrl/models；模型名顺手按逗号/顿号拆散自愈
    const providers = base.providers.map((bp) => {
      const sp = saved.providers?.find((x) => x.id === bp.id);
      if (!sp) return bp;
      const models = (sp.models?.length ? sp.models : bp.models)
        .flatMap((m) => m.split(/[,，、]+/)).map((s) => s.trim()).filter(Boolean);
      return { ...bp, apiKey: sp.apiKey, baseUrl: sp.baseUrl || bp.baseUrl, models: models.length ? models : bp.models };
    });
    const cfg: AppConfig = {
      providers,
      defaultProvider: saved.defaultProvider ?? base.defaultProvider,
      step0: saved.step0 ?? base.step0,                    // 旧结构（routing）缺这些字段 → 回落默认
      agents: { ...base.agents, ...(saved.agents ?? {}) },
      search: { ...base.search, ...(saved.search ?? {}) },
      vision: saved.vision ?? base.vision,
      dataSources: mergeDataSources(saved.dataSources),
    };
    // 迁移旧配置：若之前已选过真实主用提供商但还没有子任务路由，自动铺到定框+各子任务（Key 不用重配）
    if (!saved.agents && cfg.defaultProvider !== "mock") return applyMainProvider(cfg, cfg.defaultProvider);
    return cfg;
  } catch {
    return defaultConfig();
  }
}

// 合并数据源配置：保留用户已存的（含 Key / 自定义源），并补齐尚未出现过的内置源，顺序内置在前。
function mergeDataSources(saved?: DataSourceCfg[]): DataSourceCfg[] {
  const list = Array.isArray(saved) ? saved.filter((x) => x && typeof x.id === "string") : [];
  const seen = new Set(list.map((x) => x.id));
  const merged = [...list];
  for (const s of DATA_SOURCES) if (!seen.has(s.id)) merged.push({ id: s.id, enabled: true });
  // 内置源按登记册顺序排前，自定义源按原顺序排后
  const order = new Map(DATA_SOURCES.map((s, i) => [s.id, i]));
  return merged.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
}

export function saveConfig(c: AppConfig): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(c));
  } catch { /* 存储不可用时忽略 */ }
}

export function providerById(c: AppConfig, id: ProviderId): ProviderConfig {
  return c.providers.find((p) => p.id === id) ?? c.providers[0];
}

// 选主用提供商：定框与所有子任务都用它；红队默认换该提供商的第 2 个模型（同一 Key 也能异构互查）。
export function applyMainProvider(c: AppConfig, id: ProviderId): AppConfig {
  const models = providerById(c, id).models;
  const m0 = models[0] ?? "";
  const agents = {} as Record<AgentRole, ModelPick>;
  for (const a of AGENT_ROLES) agents[a] = { provider: id, model: m0 };
  agents["红队"] = { provider: id, model: models[1] ?? m0 };
  return { ...c, defaultProvider: id, step0: { provider: id, model: m0 }, agents };
}
