import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderId } from "../../../llm/types";
import {
  CONFIG_STORAGE_KEY,
  loadConfig,
  resetRuntimeSecretsForTests,
} from "../../../config/store";
import {
  bootstrapSecureConfig,
  createBrowserSecretStore,
  createNativeSecretStore,
  getCachedSecret,
  resetSecureConfigForTests,
  saveConfigSecurely,
  type SecretStore,
} from "./secureConfig";

class MemoryStorage {
  private values = new Map<string, string>();
  readonly writes: string[] = [];
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("sentinel-storage-detail");
    this.writes.push(value);
    this.values.set(key, value);
  }
  seed(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

function fakeStore(overrides: Partial<SecretStore> = {}): SecretStore {
  return {
    persistence: "native",
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function withSecret(providerId: ProviderId, secret: string) {
  const config = loadConfig();
  return {
    ...config,
    providers: config.providers.map((provider) => provider.id === providerId
      ? { ...provider, apiKey: secret }
      : provider),
  };
}

describe("secure provider configuration", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
    resetRuntimeSecretsForTests();
    resetSecureConfigForTests();
  });

  it("migrates all legacy secrets before writing one fully redacted config", async () => {
    const config = withSecret("openai", "legacy-openai");
    config.providers.find((provider) => provider.id === "kimi")!.apiKey = "legacy-kimi";
    storage.seed(CONFIG_STORAGE_KEY, JSON.stringify(config));
    const events: string[] = [];
    const store = fakeStore({
      set: vi.fn(async (providerId, secret) => { events.push(`set:${providerId}:${secret}`); }),
      get: vi.fn(async (providerId) => { events.push(`get:${providerId}`); return undefined; }),
    });

    await bootstrapSecureConfig(store);

    const raw = storage.getItem(CONFIG_STORAGE_KEY)!;
    expect(events.slice(0, 2)).toEqual(["set:openai:legacy-openai", "set:kimi:legacy-kimi"]);
    expect(raw).not.toContain("apiKey");
    expect(raw).not.toContain("legacy-kimi");
    expect(getCachedSecret("kimi")).toBe("legacy-kimi");
  });

  it("keeps the exact legacy JSON and cache unchanged when migration fails", async () => {
    const raw = JSON.stringify(withSecret("claude", "legacy-never-erase"));
    storage.seed(CONFIG_STORAGE_KEY, raw);
    const store = fakeStore({ set: vi.fn().mockRejectedValue(new Error("platform sentinel-never-leak")) });

    await expect(bootstrapSecureConfig(store)).rejects.toThrow();
    expect(storage.getItem(CONFIG_STORAGE_KEY)).toBe(raw);
    expect(getCachedSecret("claude")).toBeUndefined();
    expect(storage.writes).toHaveLength(0);
  });

  it("performs changed set/delete operations before redacted persistence", async () => {
    const events: string[] = [];
    const store = fakeStore({
      set: vi.fn(async (providerId) => { events.push(`set:${providerId}`); }),
      delete: vi.fn(async (providerId) => { events.push(`delete:${providerId}`); }),
    });
    const original = withSecret("claude", "old");
    await saveConfigSecurely(original, store);
    storage.writes.length = 0;
    const draft = withSecret("openai", "new");
    draft.providers.find((provider) => provider.id === "claude")!.apiKey = "";

    await saveConfigSecurely(draft, store);

    expect(events.slice(-2)).toEqual(["delete:claude", "set:openai"]);
    expect(storage.writes).toHaveLength(1);
    expect(storage.writes[0]).not.toContain("apiKey");
    expect(getCachedSecret("claude")).toBeUndefined();
    expect(getCachedSecret("openai")).toBe("new");
  });

  it("does not update cache or persist redacted success when a secret operation fails", async () => {
    const store = fakeStore();
    await saveConfigSecurely(withSecret("claude", "committed"), store);
    storage.writes.length = 0;
    vi.mocked(store.set).mockRejectedValueOnce(new Error("sentinel-secret-platform-detail"));

    await expect(saveConfigSecurely(withSecret("claude", "draft-secret"), store))
      .rejects.not.toThrow("sentinel-secret-platform-detail");
    expect(getCachedSecret("claude")).toBe("committed");
    expect(storage.writes).toHaveLength(0);
  });

  it("rewrites every credential after a partial secret-operation failure", async () => {
    const credentials = new Map<ProviderId, string>();
    let rejectOpenAiUpdate = false;
    const store = fakeStore({
      set: vi.fn(async (providerId, secret) => {
        if (rejectOpenAiUpdate && providerId === "openai" && secret === "new-openai") {
          throw new Error("partial write failure");
        }
        credentials.set(providerId, secret);
      }),
      delete: vi.fn(async (providerId) => { credentials.delete(providerId); }),
    });
    const committed = withSecret("claude", "old-claude");
    committed.providers.find((provider) => provider.id === "openai")!.apiKey = "old-openai";
    await saveConfigSecurely(committed, store);

    const partial = withSecret("claude", "new-claude");
    partial.providers.find((provider) => provider.id === "openai")!.apiKey = "new-openai";
    rejectOpenAiUpdate = true;
    await expect(saveConfigSecurely(partial, store)).rejects.toThrow();
    expect(credentials.get("claude")).toBe("new-claude");
    expect(getCachedSecret("claude")).toBe("old-claude");

    rejectOpenAiUpdate = false;
    await saveConfigSecurely(committed, store);
    expect(credentials.get("claude")).toBe("old-claude");
    expect(credentials.get("openai")).toBe("old-openai");
  });

  it("rolls cache back when redacted localStorage persistence fails", async () => {
    const store = fakeStore();
    await saveConfigSecurely(withSecret("claude", "committed"), store);
    storage.failWrites = true;

    await expect(saveConfigSecurely(withSecret("claude", "draft"), store)).rejects.toThrow(
      "secure configuration could not be saved",
    );
    expect(getCachedSecret("claude")).toBe("committed");
  });

  it("browser session storage never calls the native invoke seam or persists secrets", async () => {
    const nativeInvoke = vi.fn().mockRejectedValue(new Error("must never run"));
    createNativeSecretStore(nativeInvoke);
    const browser = createBrowserSecretStore();
    await bootstrapSecureConfig(browser);
    const result = await saveConfigSecurely(withSecret("kimi", "browser-session-secret"), browser);

    expect(result).toEqual({ storage: "session-only" });
    expect(nativeInvoke).not.toHaveBeenCalled();
    expect(getCachedSecret("kimi")).toBe("browser-session-secret");
    const raw = storage.getItem(CONFIG_STORAGE_KEY)!;
    expect(raw).not.toContain("browser-session-secret");
    expect(raw).not.toContain("apiKey");

    resetRuntimeSecretsForTests();
    await bootstrapSecureConfig(createBrowserSecretStore());
    expect(getCachedSecret("kimi")).toBeUndefined();
    expect(loadConfig().providers.find((provider) => provider.id === "kimi")?.apiKey).toBeUndefined();
    expect(storage.getItem(CONFIG_STORAGE_KEY)).toBe(raw);
  });

  it("moves browser legacy secrets into the current session and redacts localStorage", async () => {
    const raw = JSON.stringify(withSecret("openai", "browser-legacy-secret"));
    storage.seed(CONFIG_STORAGE_KEY, raw);
    const nativeInvoke = vi.fn().mockRejectedValue(new Error("must never run"));
    createNativeSecretStore(nativeInvoke);

    const result = await bootstrapSecureConfig(createBrowserSecretStore());

    expect(result).toEqual({ storage: "session-only" });
    expect(nativeInvoke).not.toHaveBeenCalled();
    expect(getCachedSecret("openai")).toBe("browser-legacy-secret");
    expect(storage.getItem(CONFIG_STORAGE_KEY)).not.toContain("apiKey");
    expect(storage.getItem(CONFIG_STORAGE_KEY)).not.toContain("browser-legacy-secret");
  });

  it("migrates and reloads the Ali provider through the native credential store", async () => {
    const raw = JSON.stringify(withSecret("ali", "legacy-ali-secret"));
    storage.seed(CONFIG_STORAGE_KEY, raw);
    const credentials = new Map<ProviderId, string>();
    const store = fakeStore({
      get: vi.fn(async (providerId) => credentials.get(providerId)),
      set: vi.fn(async (providerId, secret) => { credentials.set(providerId, secret); }),
      delete: vi.fn(async (providerId) => { credentials.delete(providerId); }),
    });

    await bootstrapSecureConfig(store);
    expect(credentials.get("ali")).toBe("legacy-ali-secret");
    expect(getCachedSecret("ali")).toBe("legacy-ali-secret");
    expect(storage.getItem(CONFIG_STORAGE_KEY)).not.toContain("apiKey");

    resetRuntimeSecretsForTests();
    await bootstrapSecureConfig(store);
    expect(getCachedSecret("ali")).toBe("legacy-ali-secret");
  });

  it("saves and deletes the Ali provider through the native credential store", async () => {
    const credentials = new Map<ProviderId, string>();
    const store = fakeStore({
      get: vi.fn(async (providerId) => credentials.get(providerId)),
      set: vi.fn(async (providerId, secret) => { credentials.set(providerId, secret); }),
      delete: vi.fn(async (providerId) => { credentials.delete(providerId); }),
    });

    await saveConfigSecurely(withSecret("ali", "new-ali-secret"), store);
    expect(credentials.get("ali")).toBe("new-ali-secret");
    expect(getCachedSecret("ali")).toBe("new-ali-secret");

    const cleared = withSecret("ali", "");
    await saveConfigSecurely(cleared, store);
    expect(credentials.has("ali")).toBe(false);
    expect(getCachedSecret("ali")).toBeUndefined();
  });

  it.each([
    ["malformed JSON", "{"],
    ["null JSON", "null"],
    ["non-array providers", JSON.stringify({ providers: {} })],
    ["invalid provider entry", JSON.stringify({ providers: [null] })],
  ])("treats %s as absent during native and browser secure bootstrap", async (_label, raw) => {
    for (const store of [fakeStore(), createBrowserSecretStore()]) {
      storage.seed(CONFIG_STORAGE_KEY, raw);
      resetRuntimeSecretsForTests();
      await expect(bootstrapSecureConfig(store)).resolves.toEqual({
        storage: store.persistence === "native" ? "persistent-native" : "session-only",
      });
      expect(getCachedSecret("ali")).toBeUndefined();
    }
  });

  it("maps all native commands to the exact request envelope", async () => {
    const nativeInvoke = vi.fn()
      .mockResolvedValueOnce("stored-secret")
      .mockResolvedValue(undefined);
    const native = createNativeSecretStore(nativeInvoke);

    await expect(native.get("openai")).resolves.toBe("stored-secret");
    await native.set("openai", "new-secret");
    await native.delete("openai");

    expect(nativeInvoke.mock.calls).toEqual([
      ["get_provider_secret", { request: { providerId: "openai" } }],
      ["set_provider_secret", { request: { providerId: "openai", secret: "new-secret" } }],
      ["delete_provider_secret", { request: { providerId: "openai" } }],
    ]);
  });
});
