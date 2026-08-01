import React, { type ReactElement } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isTauri } from "./llm/runtime";
import {
  createIntelligenceBootCoordinator,
  createUnavailableIntelligenceBootCoordinator,
  type IntelligenceBootCoordinator,
} from "./features/intelligence/application/intelligenceBoot";
import { recoverOnStartup } from "./features/intelligence/application/startupRecovery";
import type { IntelligencePlatform } from "./features/intelligence/domain/platform";
import { createTauriPlatform } from "./features/intelligence/infrastructure/tauriPlatform";
import {
  bootstrapSecureConfig,
  createBrowserSecretStore,
  createNativeSecretStore,
  setActiveSecretStore,
  type SecretStore,
  type SecureSaveResult,
} from "./features/intelligence/infrastructure/secureConfig";

export interface RuntimeBootDependencies {
  detectTauri?: () => boolean;
  createPlatform?: () => IntelligencePlatform;
  now?: () => Date;
}

export function createRuntimeIntelligenceBoot(
  dependencies: RuntimeBootDependencies = {},
): IntelligenceBootCoordinator {
  const detectTauri = dependencies.detectTauri ?? isTauri;
  if (!detectTauri()) {
    return createUnavailableIntelligenceBootCoordinator();
  }

  const platform = (dependencies.createPlatform ?? createTauriPlatform)();
  const now = dependencies.now ?? (() => new Date());
  return createIntelligenceBootCoordinator(() => recoverOnStartup(platform, now));
}

export function createApplicationTree(
  coordinator: IntelligenceBootCoordinator,
): ReactElement {
  return (
    <React.StrictMode>
      <App intelligenceBoot={coordinator} />
    </React.StrictMode>
  );
}

export interface BootstrapDependencies extends RuntimeBootDependencies {
  coordinator?: IntelligenceBootCoordinator;
  render?: (tree: ReactElement) => void;
  createNativeSecrets?: () => SecretStore;
  createBrowserSecrets?: () => SecretStore;
  bootstrapSecure?: (store: SecretStore) => Promise<SecureSaveResult>;
}

export function SecureBootstrapFailure({ retry }: { retry: () => void }) {
  return (
    <main role="alert">
      <p>安全配置初始化失败，请重试。</p>
      <button type="button" onClick={retry}>重试</button>
    </main>
  );
}

function createDefaultRenderer(): (tree: ReactElement) => void {
  let root: ReturnType<typeof ReactDOM.createRoot> | undefined;
  return (tree) => {
    const rootElement = document.getElementById("root");
    if (!rootElement) throw new Error("application root is unavailable");
    root ??= ReactDOM.createRoot(rootElement);
    root.render(tree);
  };
}

export async function bootstrapApplication(
  dependencies: BootstrapDependencies = {},
): Promise<IntelligenceBootCoordinator> {
  const native = (dependencies.detectTauri ?? isTauri)();
  const render = dependencies.render ?? createDefaultRenderer();
  const secureBootstrap = dependencies.bootstrapSecure ?? bootstrapSecureConfig;
  let running = false;

  return new Promise<IntelligenceBootCoordinator>((resolve) => {
    const attempt = async () => {
      if (running) return;
      running = true;
      try {
        const secrets = native
          ? (dependencies.createNativeSecrets ?? createNativeSecretStore)()
          : (dependencies.createBrowserSecrets ?? createBrowserSecretStore)();
        await secureBootstrap(secrets);
        setActiveSecretStore(secrets);
        const coordinator = dependencies.coordinator ?? createRuntimeIntelligenceBoot({
          ...dependencies,
          detectTauri: () => native,
        });
        await coordinator.start();
        render(createApplicationTree(coordinator));
        resolve(coordinator);
      } catch {
        if (!native) {
          const secrets = createBrowserSecretStore();
          setActiveSecretStore(secrets);
          const coordinator = createUnavailableIntelligenceBootCoordinator();
          await coordinator.start();
          render(createApplicationTree(coordinator));
          resolve(coordinator);
          return;
        }
        render(<SecureBootstrapFailure retry={() => void attempt()} />);
      } finally {
        running = false;
      }
    };
    void attempt();
  });
}
