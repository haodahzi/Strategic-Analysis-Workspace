import type { StartupRecovery } from "./startupRecovery";

export type IntelligenceBootSnapshot =
  | { status: "initializing" }
  | { status: "ready"; recovery: StartupRecovery }
  | { status: "error" }
  | { status: "unavailable" };

export interface IntelligenceBootCoordinator {
  start(): Promise<void>;
  retry(): Promise<void>;
  subscribe(listener: () => void): () => void;
  getSnapshot(): IntelligenceBootSnapshot;
}

export function createIntelligenceBootCoordinator(
  recover: () => Promise<StartupRecovery>,
): IntelligenceBootCoordinator {
  let snapshot: IntelligenceBootSnapshot = { status: "initializing" };
  let operation: Promise<void> | null = null;
  const idle = Promise.resolve();
  const listeners = new Set<() => void>();

  const publish = (next: IntelligenceBootSnapshot) => {
    if (next === snapshot) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const coordinator: IntelligenceBootCoordinator = {
    start() {
      if (operation) return operation;
      if (snapshot.status !== "initializing") {
        publish({ status: "initializing" });
      }
      let recovery: Promise<StartupRecovery>;
      try {
        recovery = recover();
      } catch (error) {
        recovery = Promise.reject(error);
      }
      operation = recovery
        .then((recovery) => {
          publish({ status: "ready", recovery });
        })
        .catch(() => {
          publish({ status: "error" });
        });
      return operation;
    },
    retry() {
      if (snapshot.status === "error") {
        operation = null;
        return coordinator.start();
      }
      return operation ?? idle;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
  };

  return coordinator;
}

export function createUnavailableIntelligenceBootCoordinator(): IntelligenceBootCoordinator {
  let snapshot: IntelligenceBootSnapshot = { status: "initializing" };
  let operation: Promise<void> | null = null;
  const idle = Promise.resolve();
  const listeners = new Set<() => void>();

  return {
    start() {
      if (operation) return operation;
      snapshot = { status: "unavailable" };
      listeners.forEach((listener) => listener());
      operation = Promise.resolve();
      return operation;
    },
    retry() {
      return operation ?? idle;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
  };
}
