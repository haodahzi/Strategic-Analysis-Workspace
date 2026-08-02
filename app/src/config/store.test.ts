import { describe, it, expect, beforeEach } from "vitest";
import { loadConfig, saveConfig } from "./store";

// node 环境无 localStorage，注入内存版 mock 以验证「API Key 记忆」这条持久化行为。
class MemLS {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

describe("配置持久化 · API Key 记忆", () => {
  beforeEach(() => { (globalThis as unknown as { localStorage: MemLS }).localStorage = new MemLS(); });

  it("保存含 Key 的配置后，重新 loadConfig 能带出该 Key（不必重填）", () => {
    const cfg = loadConfig();
    saveConfig({ ...cfg, defaultProvider: "claude", providers: cfg.providers.map((p) => (p.id === "claude" ? { ...p, apiKey: "sk-test-123" } : p)) });
    const reloaded = loadConfig();
    expect(reloaded.providers.find((p) => p.id === "claude")?.apiKey).toBe("sk-test-123");
    expect(reloaded.defaultProvider).toBe("claude");
  });

  it("清除 Key（置空）后重新 loadConfig 不再带出", () => {
    const cfg = loadConfig();
    saveConfig({ ...cfg, providers: cfg.providers.map((p) => (p.id === "claude" ? { ...p, apiKey: "" } : p)) });
    expect(loadConfig().providers.find((p) => p.id === "claude")?.apiKey).toBe("");
  });

  it("保存的自定义模型列表也随之持久化", () => {
    const cfg = loadConfig();
    saveConfig({ ...cfg, providers: cfg.providers.map((p) => (p.id === "deepseek" ? { ...p, apiKey: "k", models: ["deepseek-reasoner"] } : p)) });
    expect(loadConfig().providers.find((p) => p.id === "deepseek")?.models).toContain("deepseek-reasoner");
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
