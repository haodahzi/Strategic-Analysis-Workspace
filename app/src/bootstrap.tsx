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
}

export async function bootstrapApplication(
  dependencies: BootstrapDependencies = {},
): Promise<IntelligenceBootCoordinator> {
  const coordinator =
    dependencies.coordinator ?? createRuntimeIntelligenceBoot(dependencies);
  const render = dependencies.render ?? ((tree: ReactElement) => {
    const rootElement = document.getElementById("root");
    if (!rootElement) throw new Error("application root is unavailable");
    ReactDOM.createRoot(rootElement).render(tree);
  });

  await coordinator.start();
  render(createApplicationTree(coordinator));
  return coordinator;
}
