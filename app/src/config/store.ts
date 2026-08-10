import { AGENT_ROLES, AgentRole, AppConfig, DataSourceCfg, ModelPick, ProviderConfig, ProviderId, SearchConfig } from "../llm/types";
import { DEFAULT_PROVIDERS } from "../llm/providers";
import { DATA_SOURCES } from "../sources/registry";

export const CONFIG_STORAGE_KEY = "dw.config.v1";
const MOCK: ModelPick = { provider: "mock", model: "mock-1" };
const runtimeSecrets = new Map<ProviderId, string>();

// 内置数据源默认全部启用（在「从信息源获取」里可见）；API Key 留空、由用户按需填。
function defaultDataSources(): DataSourceCfg[] {
  return DATA_SOURCES.map((s) => ({ id: s.id, enabled: true }));
}

export function defaultConfig(): AppConfig {
  const providers: ProviderConfig[] = Object.values(DEFAULT_PROVIDERS).map((provider) => ({ ...provider }));
  const agents = {} as Record<AgentRole, ModelPick>;
  for (const role of AGENT_ROLES) agents[role] = { ...MOCK };
  return {
    providers, defaultProvider: "mock", step0: { ...MOCK }, agents,
    search: { provider: "none", baseUrl: "https://api.tavily.com/search", maxResults: 10, maxQueries: 10, maxSources: 50, preferDomains: [], freshness: "threeYears" },
    vision: { ...MOCK },
    dataSources: defaultDataSources(),
  };
}

function mergeSaved(saved: Partial<AppConfig>, includeLegacySecrets: boolean): AppConfig {
  const base = defaultConfig();
  const providers = base.providers.map((baseProvider) => {
    const savedProvider = saved.providers?.find((provider) => provider.id === baseProvider.id);
    const cachedSecret = runtimeSecrets.get(baseProvider.id);
    if (!savedProvider) {
      return cachedSecret === undefined ? baseProvider : { ...baseProvider, apiKey: cachedSecret };
    }
    const models = (savedProvider.models?.length ? savedProvider.models : baseProvider.models)
      .flatMap((model) => model.split(/[,，、]+/))
      .map((model) => model.trim())
      .filter(Boolean);
    const legacySecret = includeLegacySecrets ? savedProvider.apiKey : undefined;
    const secret = cachedSecret ?? legacySecret;
    return {
      ...baseProvider,
      ...(secret === undefined ? {} : { apiKey: secret }),
      baseUrl: savedProvider.baseUrl || baseProvider.baseUrl,
      models: models.length ? models : baseProvider.models,
    };
  });
  const config: AppConfig = {
    providers,
    defaultProvider: saved.defaultProvider ?? base.defaultProvider,
    step0: saved.step0 ?? base.step0,
    agents: { ...base.agents, ...(saved.agents ?? {}) },
    search: migrateSearch(base.search, saved.search),
    vision: saved.vision ?? base.vision,
    dataSources: mergeDataSources(saved.dataSources),
  };
  if (!saved.agents && config.defaultProvider !== "mock") {
    return applyMainProvider(config, config.defaultProvider);
  }
  return config;
}

export function loadConfig(): AppConfig {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(CONFIG_STORAGE_KEY);
    return raw ? mergeSaved(JSON.parse(raw) as Partial<AppConfig>, false) : mergeSaved({}, false);
  } catch {
    return mergeSaved({}, false);
  }
}

// 合并检索配置并做一次性迁移：本次新增 maxQueries/maxSources/时间范围 UI 之前的旧配置里，
// freshness 从未可设、恒为旧默认；识别「无 maxQueries 字段」的旧配置，把 freshness 升到新默认（近3年）。
// 存过一次新配置后带 maxQueries，此后用户的时间范围选择（含「不限」）原样保留、不再被覆盖。
function migrateSearch(base: SearchConfig, saved?: Partial<SearchConfig>): SearchConfig {
  const merged: SearchConfig = { ...base, ...(saved ?? {}) };
  if (saved && saved.maxQueries == null) merged.freshness = base.freshness;
  return merged;
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

export function redactConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    providers: config.providers.map(({ apiKey: _apiKey, ...provider }) => provider),
  };
}

export function saveConfigOrThrow(config: AppConfig): void {
  if (typeof localStorage === "undefined") throw new Error("configuration storage unavailable");
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(redactConfig(config)));
}

export function saveConfig(config: AppConfig): void {
  try {
    saveConfigOrThrow(config);
  } catch {
    // Ordinary preference writes remain best effort. Secure callers use saveConfigOrThrow.
  }
}

function isUsableSavedConfig(value: unknown): value is Partial<AppConfig> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const providers = (value as { providers?: unknown }).providers;
  return providers === undefined || (Array.isArray(providers) && providers.every(
    (provider) => provider !== null && typeof provider === "object" && !Array.isArray(provider),
  ));
}

export function readLegacyConfig(): { raw: string; config: AppConfig } | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as unknown;
    return isUsableSavedConfig(saved) ? { raw, config: mergeSaved(saved, true) } : null;
  } catch {
    return null;
  }
}

export function getRuntimeSecret(providerId: ProviderId): string | undefined {
  return runtimeSecrets.get(providerId);
}

export function replaceRuntimeSecrets(secrets: ReadonlyMap<ProviderId, string>): void {
  runtimeSecrets.clear();
  for (const [providerId, secret] of secrets) {
    if (secret) runtimeSecrets.set(providerId, secret);
  }
}

export function resetRuntimeSecretsForTests(): void {
  runtimeSecrets.clear();
}

export function providerById(config: AppConfig, id: ProviderId): ProviderConfig {
  return config.providers.find((provider) => provider.id === id) ?? config.providers[0];
}

export function applyMainProvider(config: AppConfig, id: ProviderId): AppConfig {
  const models = providerById(config, id).models;
  const mainModel = models[0] ?? "";
  const agents = {} as Record<AgentRole, ModelPick>;
  for (const role of AGENT_ROLES) agents[role] = { provider: id, model: mainModel };
  agents["红队"] = { provider: id, model: models[1] ?? mainModel };
  return { ...config, defaultProvider: id, step0: { provider: id, model: mainModel }, agents };
}
