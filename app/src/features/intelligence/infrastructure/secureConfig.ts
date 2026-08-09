import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, ProviderId } from "../../../llm/types";
import {
  getRuntimeSecret,
  readLegacyConfig,
  replaceRuntimeSecrets,
  saveConfigOrThrow,
} from "../../../config/store";

export const KNOWN_PROVIDER_IDS = ["claude", "openai", "deepseek", "zhipu", "kimi"] as const;
type KnownProviderId = (typeof KNOWN_PROVIDER_IDS)[number];

export interface SecretStore {
  readonly persistence: "native" | "session-only";
  get(providerId: KnownProviderId): Promise<string | undefined>;
  set(providerId: KnownProviderId, secret: string): Promise<void>;
  delete(providerId: KnownProviderId): Promise<void>;
}

export interface SecureSaveResult {
  storage: "persistent-native" | "session-only";
}

let activeSecretStore: SecretStore = createBrowserSecretStore();
let secretStateUncertain = false;

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export function createNativeSecretStore(nativeInvoke: Invoke = invoke): SecretStore {
  return {
    persistence: "native",
    get: (providerId) => nativeInvoke<string | null>("get_provider_secret", { request: { providerId } }).then((value) => value ?? undefined),
    set: (providerId, secret) => nativeInvoke<void>("set_provider_secret", { request: { providerId, secret } }),
    delete: (providerId) => nativeInvoke<void>("delete_provider_secret", { request: { providerId } }),
  };
}

export function createBrowserSecretStore(): SecretStore {
  return {
    persistence: "session-only",
    get: async () => undefined,
    set: async () => undefined,
    delete: async () => undefined,
  };
}

export function setActiveSecretStore(store: SecretStore): void {
  activeSecretStore = store;
}

export function resetSecureConfigForTests(): void {
  activeSecretStore = createBrowserSecretStore();
  secretStateUncertain = false;
}

export function getCachedSecret(providerId: ProviderId): string | undefined {
  return getRuntimeSecret(providerId);
}

function secretsFrom(config: AppConfig): Map<ProviderId, string> {
  const result = new Map<ProviderId, string>();
  for (const provider of config.providers) {
    if (provider.apiKey) result.set(provider.id, provider.apiKey);
  }
  return result;
}

function containsLegacySecretField(raw: string): boolean {
  const parsed = JSON.parse(raw) as { providers?: Array<Record<string, unknown>> };
  return parsed.providers?.some((provider) => Object.prototype.hasOwnProperty.call(provider, "apiKey")) ?? false;
}

export async function bootstrapSecureConfig(store: SecretStore): Promise<SecureSaveResult> {
  if (store.persistence === "session-only") {
    const legacy = readLegacyConfig();
    const legacySecrets = legacy ? secretsFrom(legacy.config) : new Map<ProviderId, string>();
    const needsLegacyRedaction = legacy ? containsLegacySecretField(legacy.raw) : false;
    try {
      if (needsLegacyRedaction) saveConfigOrThrow(legacy!.config);
    } catch {
      replaceRuntimeSecrets(new Map());
      throw new Error("secure configuration could not be initialized");
    }
    replaceRuntimeSecrets(legacySecrets);
    return { storage: "session-only" };
  }

  const legacy = readLegacyConfig();
  const legacySecrets = legacy ? secretsFrom(legacy.config) : new Map<ProviderId, string>();
  const needsLegacyRedaction = legacy ? containsLegacySecretField(legacy.raw) : false;
  const next = new Map<ProviderId, string>();

  try {
    for (const providerId of KNOWN_PROVIDER_IDS) {
      const legacySecret = legacySecrets.get(providerId);
      if (legacySecret) {
        await store.set(providerId, legacySecret);
        next.set(providerId, legacySecret);
      }
    }
    for (const providerId of KNOWN_PROVIDER_IDS) {
      if (!legacySecrets.has(providerId)) {
        const secret = await store.get(providerId);
        if (secret) next.set(providerId, secret);
      }
    }
  } catch {
    throw new Error("secure configuration could not be initialized");
  }

  const previous = new Map<ProviderId, string>();
  for (const providerId of KNOWN_PROVIDER_IDS) {
    const secret = getRuntimeSecret(providerId);
    if (secret) previous.set(providerId, secret);
  }
  replaceRuntimeSecrets(next);
  try {
    if (needsLegacyRedaction) saveConfigOrThrow(legacy!.config);
  } catch {
    replaceRuntimeSecrets(previous);
    throw new Error("secure configuration could not be initialized");
  }
  return { storage: "persistent-native" };
}

export async function saveConfigSecurely(
  draft: AppConfig,
  store: SecretStore,
): Promise<SecureSaveResult> {
  const next = new Map<ProviderId, string>();
  for (const provider of draft.providers) {
    if (provider.apiKey) next.set(provider.id, provider.apiKey);
  }

  try {
    for (const providerId of KNOWN_PROVIDER_IDS) {
      const previous = getRuntimeSecret(providerId) ?? "";
      const proposed = next.get(providerId) ?? "";
      if (!secretStateUncertain && previous === proposed) continue;
      if (proposed) await store.set(providerId, proposed);
      else await store.delete(providerId);
    }
  } catch {
    secretStateUncertain = true;
    throw new Error("secure configuration could not be saved");
  }
  secretStateUncertain = false;

  const previous = new Map<ProviderId, string>();
  for (const providerId of KNOWN_PROVIDER_IDS) {
    const secret = getRuntimeSecret(providerId);
    if (secret) previous.set(providerId, secret);
  }
  replaceRuntimeSecrets(next);
  try {
    saveConfigOrThrow(draft);
  } catch {
    replaceRuntimeSecrets(previous);
    secretStateUncertain = true;
    throw new Error("secure configuration could not be saved");
  }
  return { storage: store.persistence === "native" ? "persistent-native" : "session-only" };
}

export function saveCurrentConfigSecurely(draft: AppConfig): Promise<SecureSaveResult> {
  return saveConfigSecurely(draft, activeSecretStore);
}
