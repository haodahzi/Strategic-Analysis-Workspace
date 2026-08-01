import { beforeEach, describe, expect, it } from "vitest";
import {
  CONFIG_STORAGE_KEY,
  loadConfig,
  replaceRuntimeSecrets,
  resetRuntimeSecretsForTests,
  saveConfig,
} from "./store";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

describe("redacted configuration persistence", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });
    resetRuntimeSecretsForTests();
  });

  it("ordinary save removes every apiKey property and secret sentinel", () => {
    const config = loadConfig();
    config.providers[0].apiKey = "secret-sentinel-one";
    config.providers[1].apiKey = "secret-sentinel-two";
    saveConfig(config);

    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)!;
    expect(raw).not.toContain("apiKey");
    expect(raw).not.toContain("secret-sentinel-one");
    expect(raw).not.toContain("secret-sentinel-two");
    for (const provider of JSON.parse(raw).providers) {
      expect(provider).not.toHaveProperty("apiKey");
    }
  });

  it("synchronous load ignores legacy persisted secrets and merges only runtime cache", () => {
    const config = loadConfig();
    config.providers[0].apiKey = "legacy-must-not-load";
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    replaceRuntimeSecrets(new Map([["claude", "runtime-only"]]));

    const loaded = loadConfig();
    expect(loaded.providers.find((provider) => provider.id === "claude")?.apiKey).toBe("runtime-only");
    expect(loaded.providers.some((provider) => provider.apiKey === "legacy-must-not-load")).toBe(false);
  });
});

describe("配置持久化 · 数据源", () => {
  beforeEach(() => { (globalThis as unknown as { localStorage: MemLS }).localStorage = new MemLS(); });

  it("默认带出全部内置数据源且默认启用", () => {
    const ds = loadConfig().dataSources;
    expect(ds.find((x) => x.id === "baogaocha")?.enabled).toBe(true);
    expect(ds.find((x) => x.id === "qcc")).toBeTruthy();
  });

  it("保存的数据源 Key / 自定义源持久化，且内置源不丢", () => {
    const cfg = loadConfig();
    saveConfig({ ...cfg, dataSources: [
      ...cfg.dataSources.map((x) => (x.id === "qcc" ? { ...x, apiKey: "qcc-key" } : x)),
      { id: "custom-x", name: "我的源", url: "https://ex.com", enabled: true },
    ] });
    const re = loadConfig().dataSources;
    expect(re.find((x) => x.id === "qcc")?.apiKey).toBe("qcc-key");
    expect(re.find((x) => x.id === "custom-x")?.name).toBe("我的源");
    expect(re.find((x) => x.id === "baogaocha")).toBeTruthy();       // 内置源补齐不丢
  });

  it("旧配置（无 dataSources 字段）加载后自动补齐内置源", () => {
    (globalThis as unknown as { localStorage: MemLS }).localStorage.setItem("dw.config.v1", JSON.stringify({ defaultProvider: "mock" }));
    expect(loadConfig().dataSources.length).toBeGreaterThanOrEqual(4);
  });
});

describe("配置持久化 · 检索（B 升级）", () => {
  beforeEach(() => { (globalThis as unknown as { localStorage: MemLS }).localStorage = new MemLS(); });

  it("默认检索：条数 10、召回上限 50、时间范围近 3 年", () => {
    const s = loadConfig().search;
    expect(s.maxQueries).toBe(10);
    expect(s.maxSources).toBe(50);
    expect(s.freshness).toBe("threeYears");
  });

  it("旧配置（有 search 但无 maxQueries）一次性把时间范围升到近 3 年，其它字段保留", () => {
    (globalThis as unknown as { localStorage: MemLS }).localStorage.setItem(
      "dw.config.v1",
      JSON.stringify({ defaultProvider: "mock", search: { provider: "bocha", apiKey: "k", baseUrl: "b", maxResults: 10, preferDomains: [], freshness: "noLimit" } }),
    );
    const s = loadConfig().search;
    expect(s.freshness).toBe("threeYears");   // 旧默认被迁移
    expect(s.apiKey).toBe("k");               // 其它字段保留
  });

  it("新配置（已带 maxQueries）保留用户的时间范围选择（含不限），不再被迁移覆盖", () => {
    const cfg = loadConfig();
    saveConfig({ ...cfg, search: { ...cfg.search, maxQueries: 12, freshness: "noLimit" } });
    const s = loadConfig().search;
    expect(s.maxQueries).toBe(12);
    expect(s.freshness).toBe("noLimit");
  });
});
