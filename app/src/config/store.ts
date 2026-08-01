import { AGENT_ROLES, AgentRole, AppConfig, ModelPick, ProviderConfig, ProviderId } from "../llm/types";
import { DEFAULT_PROVIDERS } from "../llm/providers";

const KEY = "dw.config.v1";              // 保持同一 key：升级到 step0/agents 结构时 apiKey 不丢
const MOCK: ModelPick = { provider: "mock", model: "mock-1" };

export function defaultConfig(): AppConfig {
  const providers: ProviderConfig[] = Object.values(DEFAULT_PROVIDERS).map((p) => ({ ...p }));
  const agents = {} as Record<AgentRole, ModelPick>;
  for (const a of AGENT_ROLES) agents[a] = { ...MOCK };
  return {
    providers, defaultProvider: "mock", step0: { ...MOCK }, agents,
    search: { provider: "none", baseUrl: "https://api.tavily.com/search", maxResults: 5 },
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
    };
    // 迁移旧配置：若之前已选过真实主用提供商但还没有子任务路由，自动铺到定框+各子任务（Key 不用重配）
    if (!saved.agents && cfg.defaultProvider !== "mock") return applyMainProvider(cfg, cfg.defaultProvider);
    return cfg;
  } catch {
    return defaultConfig();
  }
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
