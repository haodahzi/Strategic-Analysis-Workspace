import { AppConfig, LLM_STAGES, ProviderConfig, ProviderId } from "../llm/types";
import { DEFAULT_PROVIDERS } from "../llm/providers";

const KEY = "dw.config.v1";

export function defaultConfig(): AppConfig {
  const providers: ProviderConfig[] = Object.values(DEFAULT_PROVIDERS).map((p) => ({ ...p }));
  const routing = {} as AppConfig["routing"];
  for (const s of LLM_STAGES) routing[s] = { provider: "mock", model: "mock-1" };
  return { providers, defaultProvider: "mock", routing };
}

export function loadConfig(): AppConfig {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return defaultConfig();
    const saved = JSON.parse(raw) as Partial<AppConfig>;
    const base = defaultConfig();
    // 以默认 provider 定义为准，套用已保存的 key/baseUrl/models（provider 集合不由存储决定）
    const providers = base.providers.map((bp) => {
      const sp = saved.providers?.find((x) => x.id === bp.id);
      return sp ? { ...bp, apiKey: sp.apiKey, baseUrl: sp.baseUrl || bp.baseUrl, models: sp.models?.length ? sp.models : bp.models } : bp;
    });
    return {
      providers,
      defaultProvider: saved.defaultProvider ?? base.defaultProvider,
      routing: { ...base.routing, ...(saved.routing ?? {}) },
    };
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
